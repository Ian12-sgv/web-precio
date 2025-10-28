const BASE = import.meta.env.VITE_API_BASE?.replace(/\/+$/,'') || 'http://localhost:5000/api';

export async function apiBuscar(params) {
  const url = new URL(BASE + '/buscar');
  Object.entries(params).forEach(([k,v]) => v!=null && url.searchParams.set(k, v));
  const resp = await fetch(url, { headers:{'Accept':'application/json'} });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}
