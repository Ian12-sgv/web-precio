// src/pages/Detalle.jsx
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiBuscar } from '../lib/api';

export default function Detalle() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [item, setItem] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    setItem(null);

    (async () => {
      try {
        const ref = params.get('referencia');
        const bc  = params.get('barcode');
        if (!ref && !bc) {
          if (alive) { setErr('Faltan parámetros'); setLoading(false); }
          return;
        }
        const json = await apiBuscar({ one: 1, ...(bc ? { barcode: bc } : { referencia: ref }) });
        const rows = json?.data || [];
        if (!alive) return;
        setItem(rows[0] || null);
        setLoading(false);
      } catch (e) {
        if (!alive) return;
        setErr('Error consultando el servidor');
        setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [params]);

  async function handleGoToScan() {
    // “Priming” de permiso en el gesto del usuario (este click)
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }
        });
        // cerramos enseguida: sólo necesitamos “abrir” el permiso
        stream.getTracks().forEach(t => t.stop());
        sessionStorage.setItem('scanPrime', '1');
      }
    } catch {
      // Ignoramos: si el navegador bloquea, Scan mostrará fallback
    }
    navigate('/scan?autostart=1', { replace: true });
  }

  if (loading)  return <div className="notfound">Cargando…</div>;
  if (err)      return <div className="notfound">{err}</div>;
  if (!item)    return <div className="notfound">No se encontró el ítem solicitado.</div>;

  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <h2 style={{ margin: '0 0 8px' }}>{item.Nombre}</h2>
      <div className="row" style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px 12px', marginTop: 8 }}>
        <div><strong>Referencia</strong></div><div>{item.Referencia}</div>
        <div><strong>Código barras</strong></div><div>{item.CodigoBarra || '—'}</div>
        <div><strong>Costo Dólar</strong></div><div>{item.CostoInicial}</div>
        <div><strong>Precio bolívares</strong></div><div>{item.PrecioDetal}</div>
      </div>

      <div className="actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="btn-ghost" onClick={handleGoToScan}>
          Escanear otro producto
        </button>
      </div>
    </div>
  );
}
