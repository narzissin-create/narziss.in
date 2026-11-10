/**
 * adminApi.js
 * Thin wrapper around the FastAPI backend for all admin operations.
 * Base URL is read from the VITE_API_BASE env var (default: http://localhost:8000).
 */

const BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8000').replace(/\/$/, '');

// ── Auth helpers ─────────────────────────────────────────────────────────────

export function getToken() {
  return localStorage.getItem('admin_access_token');
}

export function setToken(token) {
  localStorage.setItem('admin_access_token', token);
}

export function clearToken() {
  localStorage.removeItem('admin_access_token');
}

export function isLoggedIn() {
  return Boolean(getToken());
}

function authHeaders() {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

// ── Auth endpoints ────────────────────────────────────────────────────────────

export async function adminLogin(email, password) {
  const data = await request('POST', '/login', { email, password });
  setToken(data.access_token);
  return data;
}

export async function adminRegister(email, password) {
  const data = await request('POST', '/register', { email, password });
  setToken(data.access_token);
  return data;
}

// ── Clothes ───────────────────────────────────────────────────────────────────

export const clothes = {
  list:   (skip = 0, limit = 50) => request('GET', `/admin/clothes?skip=${skip}&limit=${limit}`),
  get:    (id)                   => request('GET', `/admin/clothes/${id}`),
  create: (body)                 => request('POST', '/admin/clothes', body),
  update: (id, body)             => request('PUT', `/admin/clothes/${id}`, body),
  patch:  (id, body)             => request('PATCH', `/admin/clothes/${id}`, body),
  delete: (id)                   => request('DELETE', `/admin/clothes/${id}`),
};

// ── Banners ───────────────────────────────────────────────────────────────────

export const banners = {
  list:   (skip = 0, limit = 50) => request('GET', `/admin/banners?skip=${skip}&limit=${limit}`),
  get:    (id)                   => request('GET', `/admin/banners/${id}`),
  create: (body)                 => request('POST', '/admin/banners', body),
  update: (id, body)             => request('PUT', `/admin/banners/${id}`, body),
  patch:  (id, body)             => request('PATCH', `/admin/banners/${id}`, body),
  delete: (id)                   => request('DELETE', `/admin/banners/${id}`),
  move:   (id, new_order)        => request('POST', `/admin/banners/${id}/move`, { new_order }),
};

// ── Sections ──────────────────────────────────────────────────────────────────

export const sections = {
  list:   (skip = 0, limit = 50) => request('GET', `/admin/sections?skip=${skip}&limit=${limit}`),
  get:    (id)                   => request('GET', `/admin/sections/${id}`),
  create: (body)                 => request('POST', '/admin/sections', body),
  update: (id, body)             => request('PUT', `/admin/sections/${id}`, body),
  patch:  (id, body)             => request('PATCH', `/admin/sections/${id}`, body),
  delete: (id)                   => request('DELETE', `/admin/sections/${id}`),
};

// ── Theme ─────────────────────────────────────────────────────────────────────

export const theme = {
  get:     ()     => request('GET', '/admin/theme'),
  replace: (body) => request('PUT', '/admin/theme', body),
  patch:   (body) => request('PATCH', '/admin/theme', body),
};
