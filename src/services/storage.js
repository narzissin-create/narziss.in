export const storageKeys = {
  user: "narziss-user",
  checkout: "narziss-checkout",
  rememberedEmail: "narziss-email",
  rememberedPhone: "narziss-phone",
  rememberMe: "narziss-remember-me",
  accessToken: "narziss-access-token",
  refreshToken: "narziss-refresh-token",
  demoDatabase: "narziss-demo-v1",
};

function area(kind) {
  return window[kind];
}

export function readStorageText(kind, key, fallback = "") {
  try {
    return area(kind).getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function readStorageJson(kind, key, fallback = null) {
  const value = readStorageText(kind, key, "");
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function writeStorageText(kind, key, value) {
  try {
    area(kind).setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function writeStorageJson(kind, key, value) {
  try {
    return writeStorageText(kind, key, JSON.stringify(value));
  } catch {
    return false;
  }
}

export function removeStorage(kind, key) {
  try {
    area(kind).removeItem(key);
    return true;
  } catch {
    return false;
  }
}
