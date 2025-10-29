// src/lib/api.js
// Cliente mínimo para hablar con tu API desde Vite/React.

const API_BASE =
  (import.meta.env.VITE_API_BASE || 'https://api.apipalacio.com').replace(/\/$/, '');

const TIMEOUT_MS = 12000;

/* -------------------- helpers -------------------- */
function withTimeout(promise, ms = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timeout consultando el servidor')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); })
           .catch(e => { clearTimeout(t); reject(e); });
  });
}

function toQuery(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

async function xfetch(path, init = {}) {
  const res = await withTimeout(fetch(API_BASE + path, {
    mode: 'cors',
    credentials: 'omit',
    headers: { Accept: 'application/json', ...(init.headers || {}) },
    ...init,
  }));
  return res;
}

/* -------------------- endpoints -------------------- */
export async function apiHealth({ signal } = {}) {
  const r = await xfetch('/api/health', { signal });
  if (!r.ok) throw new Error(`Health ${r.status}`);
  return r.json();
}

export async function apiDbHealth({ signal } = {}) {
  const r = await xfetch('/api/db/health', { signal });
  if (!r.ok) throw new Error(`DB ${r.status}`);
  return r.json();
}

/**
 * Busca por barcode o referencia (GET por defecto).
 * Ej.: apiBuscar({ one:1, barcode:'750...' })  o  apiBuscar({ one:1, referencia:'ABC' })
 */
export async function apiBuscar(params = {}) {
  const qs = toQuery(params);
  const url = '/api/buscar' + (qs ? `?${qs}` : '');
  const r = await xfetch(url, { method: 'GET' });
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    try { const j = await r.json(); msg = j?.error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

/* Variante POST (por si algún día la prefieres) */
export async function apiBuscarPOST(params = {}) {
  const r = await xfetch('/api/buscar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    try { const j = await r.json(); msg = j?.error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

/* Para depurar/mostrar la URL base en la app si lo necesitas */
export const API_URL = API_BASE;
