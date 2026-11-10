import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, LogOut } from "lucide-react";
import { useStore } from "../state/Store";
import { config, sizeCharts } from "../config";
import { api } from "../services/api";
import { acquireOverlayScrollLock } from "../services/overlayScrollLock";
import {
  readStorageText,
  removeStorage,
  storageKeys,
  writeStorageText,
} from "../services/storage";
import { Spinner, useReducedMotion } from "./UI";

const AUTH_FORM_TYPES = new Set(["login", "register"]);
const ANIMATED_MODAL_TYPES = new Set(["login", "register", "account", "description", "size", "terms"]);
const AUTH_MODAL_TRANSITION_MS = 240;

function Dialog({ title, children, onClose, onExited, restoreFocusTarget, className = "", animatedAuth = false, phase = "open" }) {
  const ref = useRef(null);
  const restoreFocusRef = useRef(
    restoreFocusTarget ||
      (typeof document !== "undefined" ? document.activeElement : null),
  );
  useEffect(() => {
    const previous = restoreFocusRef.current,
      releaseScrollLock = acquireOverlayScrollLock();
    const appRoot = document.getElementById("root");
    const wasInert = appRoot?.inert;
    if (appRoot) appRoot.inert = true;
    ref.current?.querySelector("button")?.focus();
    const handle = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const elements = [
          ...ref.current.querySelectorAll(
            "button,input,select,textarea,a[href]",
          ),
        ].filter((el) => !el.disabled);
        if (!elements.length) {
          e.preventDefault();
          return;
        }
        const first = elements[0],
          last = elements.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !elements.includes(document.activeElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !elements.includes(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      releaseScrollLock();
      document.removeEventListener("keydown", handle);
      if (appRoot) appRoot.inert = wasInert;
      requestAnimationFrame(() => {
        const target = previous?.isConnected
          ? previous
          : document.querySelector('[aria-label="Open navigation menu"]');
        if (target?.isConnected) target.focus();
      });
    };
  }, [onClose]);
  return createPortal(
    <div
      className={`modal-backdrop${animatedAuth ? ` auth-modal-backdrop is-${phase}` : ""}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onTransitionEnd={(event) => {
        if (
          animatedAuth &&
          phase === "closing" &&
          event.target === event.currentTarget &&
          event.propertyName === "opacity"
        ) onExited?.();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`modal${animatedAuth ? " auth-modal" : ""}${className ? ` ${className}` : ""}`}
      >
        <button
          className="modal-close icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X />
        </button>
        <h2 id="modal-title">{title}</h2>
        {children}
      </section>
    </div>,
    document.body,
  );
}

function Account({ user, logout, onClose }) {
  const [email] = useState(user?.email || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const actionLock = useRef(false);

  async function handleLogout() {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      await logout();
      onClose();
    } catch (logoutError) {
      actionLock.current = false;
      setBusy(false);
      setError(logoutError?.message || "Log out failed. Please try again.");
    }
  }

  return (
    <div className="account-content">
      <p>{email}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button
        className="button secondary account-logout-button"
        disabled={busy}
        aria-busy={busy}
        onClick={handleLogout}
      >
        {busy ? <Spinner label="Logging out…" /> : <>Log out <LogOut size={16} /></>}
      </button>
    </div>
  );
}
function Auth({ register }) {
  const { authenticated, setModal } = useStore(),
    [otpMode, setOtpMode] = useState(false),
    [form, setForm] = useState(() => ({
      email: readStorageText("localStorage", storageKeys.rememberedEmail),
      phone: readStorageText("localStorage", storageKeys.rememberedPhone),
      fullName: "",
      password: "",
      confirm: "",
      otp: "",
    })),
    [remember, setRemember] = useState(() => {
      return readStorageText("localStorage", storageKeys.rememberMe) === "true";
    }),
    [error, setError] = useState(""),
    [fieldErrors, setFieldErrors] = useState({}),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [count, setCount] = useState(0),
    [expires, setExpires] = useState(0);
  const actionLock = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!count) return;
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);
  useEffect(() => {
    if (!expires) return;
    const timer = setTimeout(
      () =>
        setExpires((seconds) => {
          if (seconds <= 1) {
            setSent(false);
            setError("The demo OTP expired. Request a new code.");
            return 0;
          }
          return seconds - 1;
        }),
      1000,
    );
    return () => clearTimeout(timer);
  }, [expires]);
  const field = (name, label, type = "text", autoComplete) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        inputMode={name === "phone" || name === "otp" ? "numeric" : undefined}
        autoComplete={autoComplete}
        value={form[name]}
        onChange={(e) => {
          setForm({ ...form, [name]: e.target.value });
          if (name === "phone") {
            setSent(false);
            setExpires(0);
            setCount(0);
          }
        }}
        required={name !== "otp" || sent}
        pattern={name === "phone" ? "[6-9][0-9]{9}" : undefined}
        minLength={name === "password" || name === "confirm" ? 8 : undefined}
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={fieldErrors[name] ? `${name}-error` : undefined}
      />
      {fieldErrors[name] && (
        <span className="field-error" id={`${name}-error`}>
          {fieldErrors[name]}
        </span>
      )}
    </label>
  );
  async function send() {
    if (actionLock.current) return;
    setError("");
    setFieldErrors({});
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      setFieldErrors({ email: "Enter a valid email address to receive OTP." });
      return;
    }
    actionLock.current = true;
    setBusy(true);
    try {
      const res = await api.sendOtp(form.email, register ? "register" : "login");
      setSent(true);
      setCount(res?.resendSeconds || 30);
      setExpires(600);
    } catch (e) {
      setError(e.message);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (actionLock.current) return;
    setError("");
    const validation = validateAuth(form, { register, otpMode, sent });
    setFieldErrors(validation);
    if (Object.keys(validation).length) return;
    if (otpMode && !sent) {
      setError("Please request an email OTP code first.");
      return;
    }
    actionLock.current = true;
    setBusy(true);
    try {
      let user;
      if (otpMode) {
        user = await api.verifyOtp(form.otp, form.email, remember);
      } else if (register) {
        user = await api.register({
          email: form.email,
          password: form.password,
          phone: form.phone || undefined,
          full_name: form.fullName || undefined,
          remember_me: remember,
        });
      } else {
        user = await api.login({
          email: form.email,
          password: form.password,
          remember_me: remember,
        });
      }

      if (!active.current) {
        api.logout();
        return;
      }
      if (remember) {
        writeStorageText(
          "localStorage",
          storageKeys.rememberedEmail,
          form.email,
        );
        if (form.phone) {
          writeStorageText(
            "localStorage",
            storageKeys.rememberedPhone,
            form.phone,
          );
        }
        writeStorageText(
          "localStorage",
          storageKeys.rememberMe,
          "true",
        );
      } else {
        removeStorage("localStorage", storageKeys.rememberedEmail);
        removeStorage("localStorage", storageKeys.rememberedPhone);
        removeStorage("localStorage", storageKeys.rememberMe);
      }
      if (!active.current) {
        api.logout();
        return;
      }
      await authenticated(user, remember);
    } catch (e) {
      if (/phone.*already registered/i.test(e.message))
        setFieldErrors((current) => ({ ...current, phone: e.message }));
      else if (/already registered/i.test(e.message))
        setFieldErrors((current) => ({ ...current, email: e.message }));
      else if (/OTP|verification code/i.test(e.message))
        setFieldErrors((current) => ({ ...current, otp: e.message }));
      else setError(e.message);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <form onSubmit={submit} className="form-stack" noValidate>
        {register && field("fullName", "Full Name", "text", "name")}
        {field("email", "Email Address", "email", "username")}
        {!otpMode &&
          field(
            "password",
            "Password",
            "password",
            register ? "new-password" : "current-password",
          )}
        {register &&
          field("confirm", "Confirm password", "password", "new-password")}
        {register &&
          field("phone", "Phone number (optional)", "tel", "tel-national")}
        {otpMode && (
          <>
            <button
              type="button"
              className="button secondary"
              disabled={busy || count > 0}
              onClick={send}
            >
              {count
                ? `Resend OTP in ${count}s`
                : sent
                  ? "Resend Email OTP"
                  : "Send Email OTP"}
            </button>
            {sent && (
              <>
                {field("otp", "Enter 6-Digit Email OTP", "text", "one-time-code")}
                <span className="otp-expiry">
                  Code sent to your email. Expires in {expires}s
                </span>
              </>
            )}
          </>
        )}
        {!register && (
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setOtpMode((v) => !v);
              setError("");
              setSent(false);
              setCount(0);
              setExpires(0);
            }}
          >
            {otpMode ? "Log in with password instead" : "Log in with Email OTP"}
          </button>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember me on this device
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy ? (
            <Spinner label="Please wait…" />
          ) : register ? (
            "Register"
          ) : (
            "Log in"
          )}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            setError("Google login will be connected by your backend team.")
          }
        >
          Continue with Google
        </button>
        <p>
          {register ? "Already have an account?" : "Don’t have an account?"}{" "}
          <button
            type="button"
            className="text-link"
            onClick={() => setModal({ type: register ? "login" : "register" })}
          >
            {register ? "Log in" : "Register"}
          </button>
        </p>
      </form>
    </>
  );
}

function validateAuth(form, { register, otpMode, sent }) {
  const errors = {};
  if (!/^\S+@\S+\.\S+$/.test(form.email || ""))
    errors.email = "Enter a valid email address.";
  if (!otpMode && (form.password || "").length < 8)
    errors.password = "Password must contain at least 8 characters.";
  if (register && form.password !== form.confirm)
    errors.confirm = "Passwords do not match.";
  if (form.phone && form.phone.trim() && !/^[6-9]\d{9}$/.test(form.phone.trim()))
    errors.phone = "Enter a valid 10-digit Indian phone number.";
  if (otpMode && sent && !/^\d{6}$/.test((form.otp || "").trim()))
    errors.otp = "Enter the 6-digit email OTP.";
  return errors;
}
export function Modals() {
  const { modal, closeModal, user, logout } = useStore();
  const reducedMotion = useReducedMotion();
  const [renderedModal, setRenderedModal] = useState(modal);
  const [authPhase, setAuthPhase] = useState(modal ? "open" : "entering");
  const renderedModalRef = useRef(renderedModal);
  const lastExternalFocusRef = useRef(null);
  const phaseRef = useRef(authPhase);
  const closeTimerRef = useRef(null);
  const openFrameRef = useRef(null);
  const secondOpenFrameRef = useRef(null);
  renderedModalRef.current = renderedModal;
  phaseRef.current = authPhase;

  useEffect(() => {
    const rememberExternalFocus = (event) => {
      if (
        event.target instanceof HTMLElement &&
        !event.target.closest(".modal-backdrop")
      ) lastExternalFocusRef.current = event.target;
    };
    document.addEventListener("focusin", rememberExternalFocus);
    return () => document.removeEventListener("focusin", rememberExternalFocus);
  }, []);

  const finishClose = () => {
    if (!modal && phaseRef.current === "closing") {
      setRenderedModal(null);
      setAuthPhase("entering");
    }
  };

  useEffect(() => {
    clearTimeout(closeTimerRef.current);
    cancelAnimationFrame(openFrameRef.current);
    cancelAnimationFrame(secondOpenFrameRef.current);
    const current = renderedModalRef.current;

    if (modal) {
      setRenderedModal(modal);
      if (!ANIMATED_MODAL_TYPES.has(modal.type) || reducedMotion) {
        setAuthPhase("open");
      } else if (current) {
        // Switching forms or reopening during close continues from the current
        // rendered opacity instead of restarting or flashing the backdrop.
        setAuthPhase("open");
      } else {
        setAuthPhase("entering");
      }
      return;
    }

    if (!current) return;
    if (!ANIMATED_MODAL_TYPES.has(current.type) || reducedMotion) {
      setRenderedModal(null);
      setAuthPhase("entering");
      return;
    }

    // If an opening was interrupted before its first visible frame, remove the
    // invisible overlay immediately instead of leaving it over the page.
    if (phaseRef.current === "entering") {
      setRenderedModal(null);
      return;
    }
    setAuthPhase("closing");
    closeTimerRef.current = setTimeout(finishClose, AUTH_MODAL_TRANSITION_MS + 40);
  }, [modal, reducedMotion]);

  useEffect(() => {
    if (!renderedModal || authPhase !== "entering" || reducedMotion) return;
    // Two painted frames guarantee the browser sees the initial hidden state
    // before the opening class is applied, including after rapid remounts.
    openFrameRef.current = requestAnimationFrame(() => {
      secondOpenFrameRef.current = requestAnimationFrame(() => setAuthPhase("open"));
    });
    return () => {
      cancelAnimationFrame(openFrameRef.current);
      cancelAnimationFrame(secondOpenFrameRef.current);
    };
  }, [renderedModal, authPhase, reducedMotion]);

  useEffect(() => () => {
    clearTimeout(closeTimerRef.current);
    cancelAnimationFrame(openFrameRef.current);
    cancelAnimationFrame(secondOpenFrameRef.current);
  }, []);

  if (!renderedModal) return null;
  const titles = {
    login: "Log into your account",
    register: "Register your account",
    description: "Product description",
    size: "Size chart",
    terms: "Terms & Conditions",
    account: "Your account",
  };
  return (
    <Dialog
      title={titles[renderedModal.type]}
      onClose={closeModal}
      onExited={finishClose}
      restoreFocusTarget={lastExternalFocusRef.current}
      className={renderedModal.type === "account" ? "account-modal" : ""}
      animatedAuth={ANIMATED_MODAL_TYPES.has(renderedModal.type)}
      phase={authPhase}
    >
      {AUTH_FORM_TYPES.has(renderedModal.type) ? (
        <Auth key={renderedModal.type} register={renderedModal.type === "register"} />
      ) : renderedModal.type === "description" ? (
        <p>{renderedModal.product.description}</p>
      ) : renderedModal.type === "size" ? (
        <>
          <p>
            Inches, with centimetres in brackets. Provisional chart—confirm
            garment measurements before launch.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {(renderedModal.product.type === "upper"
                    ? ["Size", "Chest", "Shoulder", "Length"]
                    : ["Size", "Waist", "Hip", "Inseam"]
                  ).map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sizeCharts[renderedModal.product.type].map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, i) => (
                      <td key={i}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : renderedModal.type === "terms" ? (
        <div className="policy-content">{config.terms}</div>
      ) : <Account user={user} logout={logout} onClose={closeModal} />}
    </Dialog>
  );
}
