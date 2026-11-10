import { expectData, validCart, validUser } from "../services/validation";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { api } from "../services/api";
import { createPendingAction } from "../services/pendingAction";
import {
  readStorageJson,
  removeStorage,
  storageKeys,
  writeStorageJson,
} from "../services/storage";
const Context = createContext(null);
const loadUser = () => {
  const stored =
    readStorageJson("localStorage", storageKeys.user) ||
    readStorageJson("sessionStorage", storageKeys.user);
  return validUser(stored) ? stored : null;
};
export function Provider({ children }) {
  const [user, setUser] = useState(loadUser),
    [cart, setCart] = useState([]),
    [coupon, setCoupon] = useState(() => {
      try {
        return readStorageJson("sessionStorage", "narziss_applied_coupon") || null;
      } catch {
        return null;
      }
    }),
    [cartLoading, setCartLoading] = useState(Boolean(user)),
    [cartError, setCartError] = useState(""),
    [modal, setModal] = useState(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [maintenanceMode, setMaintenanceMode] = useState(() => {
      try {
        return Boolean(readStorageJson("sessionStorage", "narziss_maintenance_mode"));
      } catch {
        return false;
      }
    }),
    [announcementText, setAnnouncementText] = useState(() => {
      try {
        const stored = readStorageJson("sessionStorage", "narziss_announcement_text");
        return typeof stored === "string" ? stored : null;
      } catch {
        return null;
      }
    });
  const lock = useRef(false),
    pending = useRef(createPendingAction()),
    userRef = useRef(user),
    timer = useRef(null);
  userRef.current = user;

  useEffect(() => {
    let active = true;
    const checkThemeSettings = async () => {
      try {
        const theme = await api.getTheme();
        if (active && theme) {
          const isMaint = Boolean(theme.maintenance_mode);
          setMaintenanceMode(isMaint);
          writeStorageJson("sessionStorage", "narziss_maintenance_mode", isMaint);

          if (theme.announcement_text !== undefined) {
            setAnnouncementText(theme.announcement_text);
            writeStorageJson("sessionStorage", "narziss_announcement_text", theme.announcement_text);
          }
        }
      } catch {}
    };
    checkThemeSettings();
    const interval = setInterval(checkThemeSettings, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setCart([]);
    setCartError("");
    setCartLoading(Boolean(user));
    if (!user) {
      api.restore(null);
      return () => controller.abort();
    }
    if (!api.restore(user)) {
      removeStorage("localStorage", storageKeys.user);
      removeStorage("sessionStorage", storageKeys.user);
      removeStorage("sessionStorage", storageKeys.checkout);
      userRef.current = null;
      setUser(null);
      setCartLoading(false);
      notify("Your demo session expired. Please log in again.");
      return () => controller.abort();
    }
    api
      .cart({ signal: controller.signal })
      .then((c) => {
        expectData(c, validCart, "Your cart could not be read. Please retry.");
        if (active) setCart(c);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") setCartError(e.message);
      })
      .finally(() => active && setCartLoading(false));
    return () => {
      active = false;
      controller.abort();
    };
  }, [user?.id]);
  useEffect(() => {
    const synchronize = (event) => {
      if (event.key === storageKeys.user || event.key === null) {
        const next = event.newValue === null ? null : loadUser();
        if (next?.id !== userRef.current?.id) {
          api.restore(next);
          userRef.current = next;
          setUser(next);
          if (!next) {
            setCart([]);
            removeStorage("sessionStorage", storageKeys.checkout);
          }
        }
      }
      if (event.key === storageKeys.demoDatabase && userRef.current) {
        if (!api.restore(userRef.current)) {
          removeStorage("localStorage", storageKeys.user);
          removeStorage("sessionStorage", storageKeys.user);
          removeStorage("sessionStorage", storageKeys.checkout);
          userRef.current = null;
          setUser(null);
          setCart([]);
          notify("Your demo session expired. Please log in again.");
          return;
        }
        const userId = userRef.current.id;
        setCartLoading(true);
        api
          .cart()
          .then((nextCart) => {
            if (userRef.current?.id === userId) {
              expectData(
                nextCart,
                validCart,
                "Your cart could not be read. Please retry.",
              );
              setCart(nextCart);
              setCartError("");
            }
          })
          .catch((error) => {
            if (userRef.current?.id === userId) setCartError(error.message);
          })
          .finally(() => {
            if (userRef.current?.id === userId) setCartLoading(false);
          });
      }
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  function notify(message) {
    setNotice(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(""), 5000);
  }
  function requireLogin(action) {
    if (userRef.current) {
      action?.();
      return true;
    }
    pending.current.set(action);
    setModal({ type: "login" });
    return false;
  }
  async function authenticated(next, remember) {
    if (!validUser(next) || !api.restore(next))
      throw new Error("Login response was invalid. Please retry.");
    removeStorage("localStorage", storageKeys.user);
    removeStorage("sessionStorage", storageKeys.user);
    const persisted = writeStorageJson(
      remember ? "localStorage" : "sessionStorage",
      storageKeys.user,
      next,
    );
    userRef.current = next;
    setUser(next);
    setModal(null);
    if (!persisted)
      notify(
        "Logged in for this page, but browser storage is unavailable; refresh will require login.",
      );
    try {
      await pending.current.run();
    } catch (error) {
      notify(error.message);
    }
  }
  const closeModal = useCallback(() => {
    setModal(null);
    pending.current.clear();
  }, []);
  async function add(variantId, quantity = 1) {
    if (!userRef.current) {
      requireLogin(() => add(variantId, quantity));
      return;
    }
    if (lock.current) return;
    const actor = userRef.current.id;
    lock.current = true;
    setBusy(true);
    try {
      const next = expectData(
        await api.add(variantId, quantity),
        validCart,
        "Your cart could not be read. Please retry.",
      );
      if (userRef.current?.id !== actor) return;
      setCart(next);
      setCartError("");
      notify("Added to your cart");
    } catch (e) {
      notify(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function quantity(id, q) {
    if (lock.current || !userRef.current) return;
    const actor = userRef.current.id;
    lock.current = true;
    setBusy(true);
    try {
      const next = expectData(
        await api.quantity(id, q),
        validCart,
        "Your cart could not be read. Please retry.",
      );
      if (userRef.current?.id !== actor) return;
      setCart(next);
      setCartError("");
    } catch (e) {
      notify(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refreshCart() {
    const actor = userRef.current?.id;
    if (!actor) return;
    setCartLoading(true);
    try {
      const next = expectData(
        await api.cart(),
        validCart,
        "Your cart could not be read. Please retry.",
      );
      if (userRef.current?.id === actor) {
        setCart(next);
        setCartError("");
      }
    } catch (error) {
      if (userRef.current?.id === actor) setCartError(error.message);
      // An order result remains authoritative even if cart refresh fails.
      throw error;
    } finally {
      if (userRef.current?.id === actor) setCartLoading(false);
    }
  }
  function applyCoupon(couponData) {
    setCoupon(couponData);
    if (couponData) {
      writeStorageJson("sessionStorage", "narziss_applied_coupon", couponData);
    } else {
      removeStorage("sessionStorage", "narziss_applied_coupon");
    }
  }

  function logout() {
    api.logout();
    removeStorage("localStorage", storageKeys.user);
    removeStorage("sessionStorage", storageKeys.user);
    removeStorage("sessionStorage", storageKeys.checkout);
    removeStorage("sessionStorage", "narziss_applied_coupon");
    setCoupon(null);
    pending.current.clear();
    userRef.current = null;
    setUser(null);
    setCart([]);
    setCartLoading(false);
    setCartError("");
  }
  const lines = useMemo(() => api.hydrateLines(cart), [cart]);
  return (
    <Context.Provider
      value={{
        user,
        cart,
        cartLoading,
        cartError,
        lines,
        coupon,
        applyCoupon,
        modal,
        setModal,
        closeModal,
        notice,
        notify,
        requireLogin,
        authenticated,
        add,
        quantity,
        busy,
        refreshCart,
        logout,
        maintenanceMode,
        setMaintenanceMode,
        announcementText,
        setAnnouncementText,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);
