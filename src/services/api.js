import {
  validAddress,
  validSavedAddress,
  validUser,
  validOrder,
  addressErrors,
} from "./validation.js";
import { products, findVariant, registerDynamicProduct } from "./catalog.js";
import { filterProducts, addLine, rankRelatedProducts } from "./logic.js";
import { config } from "../config.js";
import { storageKeys } from "./storage.js";
import { normalizeNavigation, resolveProductClothingType } from "./navigation.js";
const KEY = storageKeys.demoDatabase;
const emptyDatabase = () => ({
  users: [],
  carts: {},
  addresses: {},
  orders: [],
  reviews: [],
});
const isRecord = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
function arrayRecord(value, itemFilter) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, items]) => [
      key,
      Array.isArray(items) ? items.filter(itemFilter) : [],
    ]),
  );
}
function validLine(line) {
  return (
    isRecord(line) &&
    typeof line.variantId === "string" &&
    Number.isInteger(line.quantity) &&
    line.quantity > 0
  );
}
function validReview(review) {
  return (
    isRecord(review) &&
    typeof review.id === "string" &&
    typeof review.userId === "string" &&
    typeof review.productId === "string" &&
    Number.isInteger(review.rating) &&
    review.rating >= 1 &&
    review.rating <= 5 &&
    typeof review.text === "string"
  );
}
function normalizeDatabase(value) {
  const source = isRecord(value) ? value : {};
  return {
    users: Array.isArray(source.users) ? source.users.filter(validUser) : [],
    carts: arrayRecord(source.carts, validLine),
    addresses: arrayRecord(source.addresses, validSavedAddress),
    orders: Array.isArray(source.orders)
      ? source.orders.filter(validOrder)
      : [],
    reviews: Array.isArray(source.reviews)
      ? source.reviews.filter(validReview).map((review) => ({
          ...review,
          name:
            typeof review.name === "string" && review.name.trim()
              ? review.name
              : "Verified buyer",
          updatedAt: Number.isFinite(review.updatedAt) ? review.updatedAt : 0,
        }))
      : [],
  };
}
function read() {
  try {
    return normalizeDatabase(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    return emptyDatabase();
  }
}
function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    throw new Error(
      "Demo storage is unavailable or full. Check browser storage before continuing.",
    );
  }
}
let currentUser = null;
let sessionVersion = 0;
const catalogueCache = new Map();
const CATALOGUE_CACHE_LIMIT = 50;
const CATALOGUE_CACHE_TTL = 30_000;
function cachedCatalogue(key) {
  const entry = catalogueCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > CATALOGUE_CACHE_TTL) {
    catalogueCache.delete(key);
    return undefined;
  }
  catalogueCache.delete(key);
  catalogueCache.set(key, entry);
  return entry.value;
}
function cacheCatalogue(key, value) {
  catalogueCache.set(key, { createdAt: Date.now(), value });
  if (catalogueCache.size > CATALOGUE_CACHE_LIMIT)
    catalogueCache.delete(catalogueCache.keys().next().value);
  return value;
}
function rejectIfAborted(signal) {
  if (signal?.aborted)
    throw new DOMException("Request cancelled", "AbortError");
}
const activeSessionChecks = new Set();
const wait = (signal, delay = 250) => {
  const sessionChecks = [...activeSessionChecks];
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Request cancelled", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      try {
        sessionChecks.forEach((check) => check());
        resolve();
      } catch (error) {
        reject(error);
      }
    }, delay);
    signal?.addEventListener("abort", abort, { once: true });
  });
};
const requireUser = () => {
  if (!currentUser) throw new Error("Please log in.");
  return currentUser.id;
};
const BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE
  ? import.meta.env.VITE_API_BASE
  : "http://localhost:8000"
).replace(/\/$/, "");

function getStoredToken(key) {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(key)) {
      return localStorage.getItem(key);
    }
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) {
      return sessionStorage.getItem(key);
    }
  } catch {}
  return null;
}

function setStoredToken(key, value, remember = true) {
  try {
    if (remember && typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  } catch {}
}

function clearStoredTokens() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("narziss-access-token");
      localStorage.removeItem("narziss-refresh-token");
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("refresh_token");
      sessionStorage.removeItem("narziss-access-token");
      sessionStorage.removeItem("narziss-refresh-token");
    }
  } catch {}
}

let isRefreshingTokens = false;
let tokenRefreshSubscribers = [];

function onTokenRefreshed(newToken) {
  tokenRefreshSubscribers.forEach((callback) => callback(newToken));
  tokenRefreshSubscribers = [];
}

async function tryRefreshToken() {
  const refreshToken = getStoredToken("refresh_token") || getStoredToken("narziss-refresh-token");
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      clearStoredTokens();
      return null;
    }

    const data = await res.json();
    const isRemember = typeof localStorage !== "undefined" && Boolean(localStorage.getItem("refresh_token") || localStorage.getItem("narziss-remember-me") === "true");

    if (data.access_token) {
      setStoredToken("access_token", data.access_token, isRemember);
      setStoredToken("narziss-access-token", data.access_token, isRemember);
    }
    if (data.refresh_token) {
      setStoredToken("refresh_token", data.refresh_token, isRemember);
      setStoredToken("narziss-refresh-token", data.refresh_token, isRemember);
    }
    return data.access_token;
  } catch {
    return null;
  }
}

async function fetchJson(path, options = {}, retry = true) {
  try {
    const token = getStoredToken("access_token") || getStoredToken("narziss-access-token");
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401 && retry && !path.includes("/auth/login") && !path.includes("/auth/register") && !path.includes("/auth/refresh")) {
      if (!isRefreshingTokens) {
        isRefreshingTokens = true;
        const newToken = await tryRefreshToken();
        isRefreshingTokens = false;
        if (newToken) {
          onTokenRefreshed(newToken);
          return fetchJson(path, options, false);
        } else {
          clearStoredTokens();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("auth-expired"));
          }
          return null;
        }
      } else {
        return new Promise((resolve) => {
          tokenRefreshSubscribers.push((newToken) => {
            if (newToken) {
              resolve(fetchJson(path, options, false));
            } else {
              resolve(null);
            }
          });
        });
      }
    }

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function formatBackendProduct(p) {
  if (!p) return null;
  const id = String(p.id ?? "");
  const category = typeof p.category === "string" && p.category.trim() ? p.category : "acid-wash-tees";
  const explicitSizes = Array.isArray(p.sizes)
    ? p.sizes.filter((size) => typeof size === "string" && size.trim())
    : [];
  const type = resolveProductClothingType(p, category, explicitSizes);
  const rawName = typeof p.name === "string" && p.name.trim() ? p.name : "Narziss Apparel";
  const cleanSlug = typeof p.slug === "string" && p.slug.trim()
    ? p.slug
    : (rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + id);
  const sizes = explicitSizes;
  const stockNum = typeof p.stock === "number" && Number.isFinite(p.stock) ? Math.max(0, Math.floor(p.stock)) : 10;
  const variants = sizes.map((size, idx) => ({
    id: `v-${id || "item"}-${size}-${idx}`,
    size,
    stock: stockNum > 0 ? Math.max(1, Math.floor(stockNum / sizes.length)) : 0,
  }));
  const rawImages = Array.isArray(p.images) && p.images.length > 0
    ? p.images.filter(x => typeof x === "string" && Boolean(x.trim()))
    : ["/assets/hero.png"];
  const images = (rawImages.length > 0 ? rawImages : ["/assets/hero.png"]).map(img => (
    typeof img === "string" && img.startsWith("/uploads/")
      ? `${BASE}${img}`
      : img
  ));

  const tags = Array.isArray(p.tags) ? p.tags.filter(t => typeof t === "string") : [];
  const navigationCategoryId = p.navigation_category_id ?? p.navigation?.category?.id ?? null;
  const navigationSubcategoryId = p.navigation_subcategory_id ?? p.navigation?.subcategory?.id ?? null;
  const formatted = {
    id: id || `prod-${cleanSlug}`,
    slug: cleanSlug,
    name: rawName,
    category,
    type,
    price: typeof p.price === "number" && Number.isFinite(p.price) && p.price >= 0 ? p.price : (Number(p.price) || 999),
    material: typeof p.material === "string" && p.material ? p.material : "cotton",
    colour: (Array.isArray(p.colors) && p.colors[0]) || "black",
    isNew: true,
    isTrending: tags.some((tag) => tag.trim().toLowerCase() === "trending"),
    collections: ["formal", "casual"],
    images,
    tags,
    navigationCategoryId,
    navigationSubcategoryId,
    hasHierarchyAssignment: navigationCategoryId !== null || navigationSubcategoryId !== null,
    description: typeof p.description === "string" && p.description.trim()
      ? p.description
      : `${rawName} from Narziss menswear collection.`,
    rating: 4.8,
    reviewCount: 14,
    variants,
  };
  registerDynamicProduct(formatted);
  return formatted;
}

async function warmBackendProductIndex(signal) {
  if (typeof window === "undefined") return;
  const backendItems = await fetchJson("/products", { signal });
  if (!Array.isArray(backendItems)) {
    throw new Error("Product catalogue is unavailable.");
  }
  backendItems.forEach(formatBackendProduct);
}

// All functions connect to FastAPI backend with fallback to validated catalog
const mockApi = {
  async getNavigation(options = {}) {
    rejectIfAborted(options.signal);
    const payload = await fetchJson("/navigation", { signal: options.signal });
    if (!payload) throw new Error("Store navigation is unavailable.");
    return normalizeNavigation(payload);
  },
  async listProducts(filters = {}, offset = 0, limit = 15, options = {}) {
    rejectIfAborted(options.signal);
    const key = `products:${JSON.stringify([filters, offset, limit])}`;
    const cached = cachedCatalogue(key);
    if (cached) return cached;
    await wait(options.signal);

    let allProducts = products;
    if (typeof window !== "undefined") {
      try {
        const backendItems = await fetchJson("/products", { signal: options.signal });
        if (Array.isArray(backendItems) && backendItems.length > 0) {
          allProducts = backendItems.map(formatBackendProduct);
        }
      } catch {}
    }

    const result = filterProducts(allProducts, filters);
    return cacheCatalogue(key, {
      items: result.slice(offset, offset + limit),
      total: result.length,
    });
  },
  async listHierarchyProducts(filters = {}, offset = 0, limit = 15, options = {}) {
    rejectIfAborted(options.signal);
    const backendItems = await fetchJson("/products", { signal: options.signal });
    if (!Array.isArray(backendItems)) {
      throw new Error("Products are unavailable.");
    }
    const formatted = backendItems.map(formatBackendProduct).filter(Boolean);
    if (formatted.length && !formatted.some((product) => product.hasHierarchyAssignment)) {
      throw new Error("Product hierarchy assignments are not available from the storefront API yet.");
    }
    const result = filterProducts(formatted, filters);
    return {
      items: result.slice(offset, offset + limit),
      total: result.length,
    };
  },
  async product(slug, options = {}) {
    rejectIfAborted(options.signal);
    const key = `product:${slug}`;
    const cached = cachedCatalogue(key);
    if (cached !== undefined) return cached;
    await wait(options.signal);

    if (typeof window !== "undefined") {
      try {
        const backendItem = await fetchJson(`/products/${slug}`, { signal: options.signal });
        if (backendItem) {
          const formatted = formatBackendProduct(backendItem);
          return cacheCatalogue(key, formatted);
        }
      } catch {}
    }

    return cacheCatalogue(
      key,
      products.find((p) => p.slug === slug || p.id === slug) || null,
    );
  },
  async recommendations({ exclude = [], limit = 10 } = {}, options = {}) {
    rejectIfAborted(options.signal);
    const key = `recommendations:${JSON.stringify([exclude, limit])}`;
    const cached = cachedCatalogue(key);
    if (cached) return cached;
    await wait(options.signal);
    const excluded = new Set(exclude);

    let allProducts = products;
    if (typeof window !== "undefined") {
      try {
        const backendItems = await fetchJson("/products", { signal: options.signal });
        if (Array.isArray(backendItems) && backendItems.length > 0) {
          allProducts = backendItems.map(formatBackendProduct);
        }
      } catch {}
    }

    return cacheCatalogue(
      key,
      allProducts
        .filter((p) => !excluded.has(p.id))
        .sort((a, b) => stableHash(a.id) - stableHash(b.id))
        .slice(0, limit),
    );
  },
  async shopMoreProducts({ current, limit = 10 } = {}, options = {}) {
    rejectIfAborted(options.signal);
    const signature = JSON.stringify([
      current?.id,
      current?.slug,
      current?.category,
      current?.type,
      current?.tags,
      Math.min(10, limit),
    ]);
    const key = `shop-more:${signature}`;
    const cached = cachedCatalogue(key);
    if (cached !== undefined) return cached;
    await wait(options.signal);

    const backendItems = await fetchJson("/products", { signal: options.signal });
    if (!Array.isArray(backendItems)) {
      throw new Error("Shop More products are unavailable.");
    }
    const realProducts = backendItems.map(formatBackendProduct).filter(Boolean);
    return cacheCatalogue(
      key,
      rankRelatedProducts(realProducts, current, Math.min(10, limit)),
    );
  },
  async getTags(options = {}) {
    rejectIfAborted(options.signal);
    const key = "tags:public";
    const cached = cachedCatalogue(key);
    if (cached) return cached;
    const backendTags = await fetchJson("/admin/tags/public", { signal: options.signal });
    if (!Array.isArray(backendTags)) throw new Error("Tags are unavailable.");
    return cacheCatalogue(key, backendTags);
  },
  async getBanners() {
    try {
      const backendBanners = await fetchJson("/banners");
      if (Array.isArray(backendBanners) && backendBanners.length > 0) {
        return backendBanners.map(b => ({
          ...b,
          image_url: typeof b.image_url === "string" && b.image_url.startsWith("/uploads/")
            ? `${BASE}${b.image_url}`
            : b.image_url,
        }));
      }
    } catch {}
    return [
      {
        id: 1,
        title: "Spring / Summer 2026 Collection",
        image_url: "/assets/hero.png",
        target_url: "/#new-arrivals",
        active: true,
      },
    ];
  },
  async getSections() {
    try {
      const backendSections = await fetchJson("/sections");
      if (Array.isArray(backendSections) && backendSections.length > 0) {
        return backendSections.map(sec => ({
          ...sec,
          products: Array.isArray(sec.products) ? sec.products.map(formatBackendProduct) : [],
        }));
      }
    } catch {}
    return [
      {
        id: 1,
        name: "New Arrivals",
        description: "Fresh drops — crafted for every occasion.",
        active: true,
        product_ids: [],
        products: [],
      },
    ];
  },
  async getTheme() {
    try {
      const backendTheme = await fetchJson("/theme");
      if (backendTheme) return backendTheme;
    } catch {}
    return {
      primary_color: "#2d4f1e",
      secondary_color: "#c08552",
      font_family: "Google Sans, sans-serif",
      dark_mode: false,
      maintenance_mode: false,
      announcement_text: "Complimentary Express Delivery on orders above ₹1,999 | Use Code FIRST10 for 10% Off",
    };
  },
  async validateCoupon(code, subtotal = 0) {
    try {
      const res = await fetchJson("/coupons/validate", {
        method: "POST",
        body: JSON.stringify({ code, subtotal }),
      });
      if (res && typeof res.valid === "boolean") {
        return res;
      }
    } catch {}
    return null;
  },
  async initiateYoupiPayment(orderNumber, details = null) {
    try {
      const options = { method: "POST" };
      if (details) {
        options.body = JSON.stringify(details);
      }
      const res = await fetchJson(`/payments/youpi/initiate/${encodeURIComponent(orderNumber)}`, options);
      if (res && res.checkoutUrl) {
        return res;
      }
    } catch (e) {
      console.warn("YouPI initiation warning:", e);
    }
    return null;
  },
  async checkYoupiPaymentStatus(orderNumber) {
    try {
      return await fetchJson(`/payments/youpi/status/${encodeURIComponent(orderNumber)}`);
    } catch {
      return null;
    }
  },
  hydrateLines(lines = []) {
    if (!Array.isArray(lines)) return [];
    return lines
      .filter(validLine)
      .map((line) => {
        const variant = findVariant(line.variantId);
        return variant
          ? { ...variant, quantity: line.quantity, variantId: line.variantId }
          : null;
      })
      .filter(Boolean);
  },
  variantDetails(variantId) {
    return findVariant(variantId) || null;
  },
  async login({ email, password, phone, otp, remember_me = false }) {
    await wait();
    if (typeof window !== "undefined") {
      try {
        const res = await fetch(`${BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email || "admin@narziss.com",
            password: password || "admin123",
            remember_me: Boolean(remember_me),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            setStoredToken("access_token", data.access_token, remember_me);
            setStoredToken("narziss-access-token", data.access_token, remember_me);
          }
          if (data.refresh_token) {
            setStoredToken("refresh_token", data.refresh_token, remember_me);
            setStoredToken("narziss-refresh-token", data.refresh_token, remember_me);
          }
          if (typeof localStorage !== "undefined") {
            if (remember_me) {
              localStorage.setItem("narziss-remember-me", "true");
            } else {
              localStorage.removeItem("narziss-remember-me");
            }
          }
          if (data.user) {
            const backendUser = {
              id: String(data.user.id),
              email: data.user.email,
              phone: data.user.phone || phone || "",
              full_name: data.user.full_name,
              role: data.user.role,
            };
            sessionVersion++;
            currentUser = backendUser;
            // Also sync in-memory db users list for validation and cart queries
            const db = read();
            if (!db.users.some((u) => u.id === backendUser.id || u.email === backendUser.email)) {
              db.users.push(backendUser);
              write(db);
            }
            return backendUser;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          if (errData.detail) throw new Error(errData.detail);
        }
      } catch (err) {
        if (!phone) throw err;
      }
    }

    const db = read();
    const user = db.users.find((u) =>
      phone ? u.phone === phone : u.email === email?.toLowerCase(),
    );
    if (!user) throw new Error("Account not found. Please register.");
    if (phone && otp !== "123456")
      throw new Error("Invalid demo OTP. Use 123456.");
    sessionVersion++;
    currentUser = user;
    return user;
  },
  async register({ email, password, phone, otp, full_name, remember_me = false }) {
    await wait();
    if (!/^\S+@\S+\.\S+$/.test(email || ""))
      throw new Error("Enter a valid email address.");
    if (phone && !/^[6-9]\d{9}$/.test(phone))
      throw new Error("Enter a valid Indian phone number.");
    if (otp && otp !== "123456")
      throw new Error("Verify your phone using demo OTP 123456.");

    if (typeof window !== "undefined") {
      try {
        const res = await fetch(`${BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.toLowerCase(),
            phone: phone || undefined,
            password: password || "password123",
            full_name: full_name || undefined,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            setStoredToken("access_token", data.access_token, remember_me);
            setStoredToken("narziss-access-token", data.access_token, remember_me);
          }
          if (data.refresh_token) {
            setStoredToken("refresh_token", data.refresh_token, remember_me);
            setStoredToken("narziss-refresh-token", data.refresh_token, remember_me);
          }
          if (data.user) {
            const backendUser = {
              id: String(data.user.id),
              email: data.user.email,
              phone: data.user.phone || phone || "",
              full_name: data.user.full_name,
              role: data.user.role,
            };
            sessionVersion++;
            currentUser = backendUser;
            const db = read();
            if (!db.users.some((u) => u.id === backendUser.id || u.email === backendUser.email)) {
              db.users.push(backendUser);
              write(db);
            }
            return backendUser;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          if (errData.detail) throw new Error(errData.detail);
        }
      } catch (err) {
        if (!otp) throw err;
      }
    }

    const db = read();
    if (db.users.some((u) => u.email === email.toLowerCase()))
      throw new Error("User already registered");
    if (phone && db.users.some((u) => u.phone === phone))
      throw new Error("Phone number already registered");
    const user = { id: crypto.randomUUID(), email: email.toLowerCase(), phone };
    db.users.push(user);
    write(db);
    sessionVersion++;
    currentUser = user;
    return user;
  },
  async getCurrentUser() {
    return fetchJson("/auth/me");
  },
  async sendOtp(email, purpose = "login") {
    await wait();
    if (typeof window !== "undefined" && email) {
      try {
        const res = await fetch(`${BASE}/auth/send-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.toLowerCase().trim(), purpose }),
        });
        if (res.ok) {
          const data = await res.json();
          return { resendSeconds: data.resend_seconds || 30 };
        } else {
          const errData = await res.json().catch(() => ({}));
          if (errData.detail) throw new Error(errData.detail);
        }
      } catch (err) {
        if (!err.message.includes("Failed to fetch")) throw err;
      }
    }
    return { resendSeconds: 30 };
  },
  async verifyOtp(otp, email = "", remember_me = false) {
    await wait();
    if (typeof window !== "undefined" && email && otp) {
      try {
        const res = await fetch(`${BASE}/auth/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.toLowerCase().trim(),
            otp: String(otp).trim(),
            remember_me: Boolean(remember_me),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            setStoredToken("access_token", data.access_token, remember_me);
            setStoredToken("narziss-access-token", data.access_token, remember_me);
          }
          if (data.refresh_token) {
            setStoredToken("refresh_token", data.refresh_token, remember_me);
            setStoredToken("narziss-refresh-token", data.refresh_token, remember_me);
          }
          if (data.user) {
            const backendUser = {
              id: String(data.user.id),
              email: data.user.email,
              phone: data.user.phone || "",
              full_name: data.user.full_name,
              role: data.user.role,
            };
            sessionVersion++;
            currentUser = backendUser;
            const db = read();
            if (!db.users.some((u) => u.id === backendUser.id || u.email === backendUser.email)) {
              db.users.push(backendUser);
              write(db);
            }
            return backendUser;
          }
          return true;
        } else {
          const errData = await res.json().catch(() => ({}));
          if (errData.detail) throw new Error(errData.detail);
        }
      } catch (err) {
        if (otp !== "123456") throw err;
      }
    }

    if (otp !== "123456") throw new Error("Invalid or expired verification code.");
    return true;
  },
  restore(user) {
    if (!isRecord(user) || typeof user.id !== "string") {
      currentUser = null;
      return false;
    }
    const restored =
      read().users.find((stored) => stored.id === user.id) || null;
    if (restored?.id !== currentUser?.id) sessionVersion++;
    currentUser = restored;
    return Boolean(currentUser);
  },
  logout() {
    clearStoredTokens();
    sessionVersion++;
    currentUser = null;
  },
  async cart(options = {}) {
    await wait(options.signal);
    const lines = read().carts[requireUser()] || [];
    if (lines.some((line) => !findVariant(line.variantId))) {
      await warmBackendProductIndex(options.signal);
    }
    return lines;
  },
  async add(variantId, quantity = 1) {
    await wait();
    const id = requireUser(),
      db = read(),
      v = findVariant(variantId);
    if (!v) throw new Error("Product unavailable");
    db.carts[id] = addLine(db.carts[id] || [], v, quantity, config.maxQuantity);
    write(db);
    return db.carts[id];
  },
  async quantity(variantId, quantity) {
    await wait();
    const id = requireUser(),
      db = read(),
      v = findVariant(variantId);
    if (!Number.isInteger(quantity) || quantity < 0)
      throw new Error("Invalid quantity.");
    if (quantity > Math.min(config.maxQuantity, v?.stock || 0))
      throw new Error("Maximum available quantity reached.");
    db.carts[id] = (db.carts[id] || []).flatMap((l) =>
      l.variantId !== variantId
        ? [l]
        : quantity > 0
          ? [{ ...l, quantity }]
          : [],
    );
    write(db);
    return db.carts[id];
  },
  async addresses(options = {}) {
    await wait(options.signal);
    return (read().addresses[requireUser()] || []).sort(
      (a, b) => b.selectedAt - a.selectedAt,
    );
  },
  async saveAddress(address) {
    await wait();
    if (!validAddress(address))
      throw new Error(
        Object.values(addressErrors(address))[0] || "Address unavailable.",
      );
    const id = requireUser(),
      db = read();
    const item = {
      ...address,
      id: address.id || crypto.randomUUID(),
      selectedAt: Date.now(),
    };
    db.addresses[id] = [
      item,
      ...(db.addresses[id] || []).filter((a) => a.id !== item.id),
    ];
    write(db);
    return item;
  },
  async selectAddress(addressId) {
    const id = requireUser(),
      db = read();
    const item = db.addresses[id]?.find((a) => a.id === addressId);
    if (!item) throw new Error("Address unavailable");
    item.selectedAt = Date.now();
    write(db);
    return item;
  },
  async placeOrder({
    lines,
    address,
    method,
    orderId,
    checkoutKind = "buy",
    idempotencyKey,
    upiProvider,
  }) {
    await wait();
    if (typeof window !== "undefined") {
      try {
        const storedMaint = sessionStorage.getItem("narziss_maintenance_mode");
        if (storedMaint === "true" || storedMaint === "1") {
          throw new Error("Website is currently under maintenance. Orders are temporarily paused.");
        }
      } catch (err) {
        if (err.message.includes("maintenance")) throw err;
      }
    }
    const userId = requireUser();
    if (!validAddress(address) || !Array.isArray(lines) || !lines.length)
      throw new Error("Choose an address and products.");
    if (!["upi", "card", "cod"].includes(method))
      throw new Error("Choose a payment method.");
    if (new Set(lines.map((l) => l.variantId)).size !== lines.length)
      throw new Error("Duplicate checkout items. Return to cart.");
    for (const l of lines) {
      const v = findVariant(l.variantId);
      if (
        !v ||
        !Number.isInteger(l.quantity) ||
        l.quantity < 1 ||
        l.quantity > Math.min(v.stock, config.maxQuantity)
      )
        throw new Error("Stock changed. Update your items.");
    }
    const db = read();
    if (orderId) {
      const existing = db.orders.find(
        (o) => o.id === orderId && o.userId === userId,
      );
      if (!existing || existing.paymentStatus !== "failed")
        throw new Error("This order cannot be retried.");
      existing.method = method;
      existing.paymentStatus = method === "cod" ? "pay-on-delivery" : "pending";
      existing.upiProvider = method === "upi" ? upiProvider : undefined;
      if (
        method === "cod" &&
        existing.checkoutKind === "cart" &&
        !existing.cartCleared
      ) {
        db.carts[userId] = removePurchased(
          db.carts[userId] || [],
          existing.items,
        );
        existing.cartCleared = true;
      }
      write(db);
      return existing;
    }
    const duplicate = idempotencyKey
      ? db.orders.find(
          (o) => o.userId === userId && o.idempotencyKey === idempotencyKey,
        )
      : null;
    if (duplicate) return duplicate;

    // Calculate coupon discount if applied
    const rawSubtotal = lines.reduce(
      (s, l) => s + (findVariant(l.variantId)?.product.price || 0) * l.quantity,
      0,
    );
    const orderDiscount = Number(arguments[0]?.discount) || 0;
    const orderCouponCode = arguments[0]?.couponCode || undefined;

    const order = {
      id: crypto.randomUUID(),
      userId,
      createdAt: Date.now(),
      address,
      method,
      upiProvider: method === "upi" ? upiProvider : undefined,
      checkoutKind,
      idempotencyKey,
      couponCode: orderCouponCode,
      discount: orderDiscount,
      paymentStatus: method === "cod" ? "pay-on-delivery" : "pending",
      items: lines.map((l) => {
        const originalPrice = findVariant(l.variantId).product.price;
        // Proportionally distribute coupon discount across items so prices reflect savings
        const itemSubtotal = originalPrice * l.quantity;
        const itemDiscount = rawSubtotal > 0 ? (itemSubtotal / rawSubtotal) * orderDiscount : 0;
        const effectivePrice = Math.max(0, originalPrice - itemDiscount / l.quantity);
        return {
          ...l,
          originalPrice,
          price: Math.round(effectivePrice * 100) / 100,
          status: "processing",
          canCancel: true,
        };
      }),
    };
    if (method === "cod" && checkoutKind === "cart") {
      db.carts[userId] = removePurchased(db.carts[userId] || [], order.items);
      order.cartCleared = true;
    }
    db.orders.unshift(order);
    write(db);
    return order;
  },
  async clearPurchased(lines) {
    const id = requireUser(),
      db = read();
    db.carts[id] = removePurchased(db.carts[id] || [], lines);
    write(db);
  },
  async orders(options = {}) {
    await wait(options.signal);
    return read().orders.filter((o) => o.userId === requireUser());
  },
  async cancel(orderId, variantId) {
    await wait();
    const db = read(),
      o = db.orders.find((o) => o.id === orderId && o.userId === requireUser());
    if (!o) throw new Error("Order not found");
    o.items = o.items.map((l) =>
      (!variantId || l.variantId === variantId) &&
      l.canCancel &&
      !["delivered", "cancelled"].includes(l.status)
        ? { ...l, status: "cancelled", canCancel: false }
        : l,
    );
    if (
      o.method !== "cod" &&
      o.paymentStatus === "successful" &&
      o.items.some((l) => l.status === "cancelled")
    )
      o.refundStatus = "pending";
    write(db);
    return o;
  },
  async paymentStatus(orderId, status) {
    await wait();
    const db = read(),
      o = db.orders.find((o) => o.id === orderId && o.userId === requireUser());
    if (!o) throw new Error("Order not found");
    if (o.method === "cod") throw new Error("Not an online payment");
    if (!["pending", "successful", "failed"].includes(status))
      throw new Error("Invalid payment status");
    if (o.items.every((l) => l.status === "cancelled"))
      throw new Error("This order was cancelled.");
    if (o.paymentStatus === "successful" && status !== "successful")
      throw new Error("A confirmed payment cannot be changed.");
    o.paymentStatus = status;
    if (
      status === "successful" &&
      o.items.some((line) => line.status === "cancelled")
    )
      o.refundStatus = "pending";
    if (
      status === "successful" &&
      o.checkoutKind === "cart" &&
      !o.cartCleared
    ) {
      db.carts[o.userId] = removePurchased(db.carts[o.userId] || [], o.items);
      o.cartCleared = true;
    }
    write(db);
    return o;
  },
  async reviews(productId, options = {}) {
    await wait(options.signal);
    return read().reviews.filter((r) => r.productId === productId);
  },
  async reviewPage(productId, offset = 0, limit = 20, options = {}) {
    await wait(options.signal);
    const result = read()
      .reviews.filter((review) => review.productId === productId)
      .sort((a, b) => {
        const ownA = a.userId === currentUser?.id ? 1 : 0;
        const ownB = b.userId === currentUser?.id ? 1 : 0;
        return ownB - ownA || (b.updatedAt || 0) - (a.updatedAt || 0);
      });
    return {
      items: result.slice(offset, offset + limit),
      total: result.length,
      averageRating: result.length
        ? result.reduce((sum, review) => sum + review.rating, 0) / result.length
        : null,
    };
  },
  async reviewEligibility(productId, options = {}) {
    await wait(options.signal);
    const userId = requireUser();
    return read().orders.some(
      (order) =>
        order.userId === userId &&
        order.items.some(
          (line) =>
            findVariant(line.variantId)?.product.id === productId &&
            line.status === "delivered",
        ),
    );
  },
  async review(productId, rating, text) {
    await wait();
    const id = requireUser(),
      db = read();
    if (
      !db.orders.some(
        (o) =>
          o.userId === id &&
          o.items.some(
            (l) =>
              findVariant(l.variantId)?.product.id === productId &&
              l.status === "delivered",
          ),
      )
    )
      throw new Error("Reviews are available after delivery.");
    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 2000 ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    )
      throw new Error("Enter a rating and review.");
    db.reviews = db.reviews.filter(
      (r) => !(r.userId === id && r.productId === productId),
    );
    db.reviews.push({
      id: crypto.randomUUID(),
      userId: id,
      productId,
      rating,
      text: text.trim(),
      name: "Verified buyer",
      updatedAt: Date.now(),
    });
    write(db);
  },
  async demoDeliver(orderId) {
    const db = read(),
      o = db.orders.find((o) => o.id === orderId && o.userId === requireUser());
    if (o && o.method !== "cod" && o.paymentStatus !== "successful")
      throw new Error("Payment must succeed before delivery.");
    if (o) {
      o.deliveredAt = Date.now();
      o.items = o.items.map((l) =>
        l.status === "cancelled"
          ? l
          : { ...l, status: "delivered", canCancel: false },
      );
    }
    write(db);
  },
};

// Development/QA transport faults exercise UI recovery without pretending the
// local adapter is a network backend. Production adapters should replace this.
const injectedFaults = new Map();
export function setMockTransportFault(operation, fault) {
  if (!operation || !fault) throw new Error("Provide an operation and fault.");
  injectedFaults.set(operation, { ...fault });
  catalogueCache.clear();
}
export function clearMockTransportFaults() {
  injectedFaults.clear();
  catalogueCache.clear();
}
async function applyTransportFault(operation, args) {
  const browserFaults = globalThis.__NARZISS_MOCK_FAULTS__;
  const fault =
    injectedFaults.get(operation) ||
    browserFaults?.[operation] ||
    browserFaults?.["*"];
  if (!fault) return { overridden: false };
  const possibleOptions = args.at(-1);
  const signal = isRecord(possibleOptions) ? possibleOptions.signal : undefined;
  const delay = Number.isFinite(fault.delayMs)
    ? Math.max(0, fault.delayMs)
    : fault.type === "slow"
      ? 1_200
      : 120;
  await wait(signal, delay);
  if (fault.type === "offline")
    throw new Error(
      "You appear to be offline. Check your connection and retry.",
    );
  if (fault.type === "timeout")
    throw new Error("The request timed out. Please retry.");
  if (fault.type === "failed")
    throw new Error(
      fault.message ||
        "The demo service could not complete this request. Please retry.",
    );
  if (fault.type === "malformed")
    return { overridden: true, value: fault.value ?? null };
  return { overridden: false };
}
const asyncOperations = new Set(
  Object.entries(mockApi)
    .filter(([, value]) => value?.constructor?.name === "AsyncFunction")
    .map(([name]) => name),
);
const transportWrappers = new Map();
const protectedOperations = new Set([
  "cart",
  "add",
  "quantity",
  "addresses",
  "saveAddress",
  "selectAddress",
  "placeOrder",
  "clearPurchased",
  "orders",
  "cancel",
  "paymentStatus",
  "reviewEligibility",
  "review",
  "demoDeliver",
]);
export const api = new Proxy(mockApi, {
  get(target, property) {
    const value = target[property];
    if (!asyncOperations.has(property)) return value;
    if (!transportWrappers.has(property))
      transportWrappers.set(property, async (...args) => {
        const version = sessionVersion;
        const actor = currentUser?.id;
        const guarded = protectedOperations.has(property);
        if (guarded) requireUser();
        const checkSession = () => {
          if (
            guarded &&
            (sessionVersion !== version || currentUser?.id !== actor)
          )
            throw new Error("Your session changed. Please retry.");
        };
        const fault = await applyTransportFault(property, args);
        checkSession();
        if (fault.overridden) return fault.value;
        // The actor is rechecked after adapter waits as well, before mutation.
        activeSessionChecks.add(checkSession);
        let request;
        try {
          request = value.apply(target, args);
        } finally {
          activeSessionChecks.delete(checkSession);
        }
        const result = await request;
        checkSession();
        return result;
      });
    return transportWrappers.get(property);
  },
});

function removePurchased(cart, purchased) {
  return cart.flatMap((line) => {
    const used = purchased.find(
      (x) => x.variantId === line.variantId && x.status !== "cancelled",
    );
    const quantity = line.quantity - (used?.quantity || 0);
    return quantity > 0 ? [{ ...line, quantity }] : [];
  });
}

function stableHash(value) {
  return [...value].reduce(
    (number, character) => (number * 31 + character.charCodeAt(0)) >>> 0,
    17,
  );
}
