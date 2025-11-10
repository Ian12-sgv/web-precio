// src/pages/Detalle.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiBuscar } from '../lib/api';

export default function Detalle() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [item, setItem] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(''); // muestra “Copiado” breve

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

  // Helpers ---------------------------------------------------------
  const toNum = (v) => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  const fmtCurrency = (v, currency, min = 2) => {
    const n = toNum(v);
    if (n === null) return v ?? '—';
    try {
      return new Intl.NumberFormat('es-VE', {
        style: 'currency',
        currency,
        minimumFractionDigits: min,
        maximumFractionDigits: 2
      }).format(n);
    } catch {
      return n.toFixed(min);
    }
  };

  const precioDetalVEF = useMemo(
    () => item ? fmtCurrency(item.PrecioDetalConIva, 'VES') : '',
    [item]
  );
  const costoUSD = useMemo(
    () => item ? fmtCurrency(item.CostoInicial, 'USD') : '',
    [item]
  );

  async function handleGoToScan() {
    // “Priming” de permiso en el gesto del usuario (este click)
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }
        });
        stream.getTracks().forEach(t => t.stop());
        sessionStorage.setItem('scanPrime', '1');
      }
    } catch { /* ignore */ }
    navigate('/scan?autostart=1', { replace: true });
  }

  function handleBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/scan');
  }

  async function copy(text, label = 'Valor') {
    try {
      await navigator.clipboard?.writeText(String(text ?? ''));
      setCopied(`${label} copiado`);
      setTimeout(() => setCopied(''), 1200);
    } catch {
      setCopied('No se pudo copiar');
      setTimeout(() => setCopied(''), 1200);
    }
  }

  // Render ----------------------------------------------------------
  if (loading) {
    return (
      <div className="wrap">
        <div className="card d-card">
          <div className="d-toolbar">
            <button className="d-btn d-btn-primary" onClick={handleGoToScan}>Escanear otro</button>
          </div>

          <div className="d-skel-title d-skeleton" />
          <div className="d-skel-grid">
            <div className="d-skeleton" />
            <div className="d-skeleton" />
            <div className="d-skeleton" />
            <div className="d-skeleton" />
          </div>
        </div>
      </div>
    );
  }

  if (err)   return <div className="wrap"><div className="notfound">{err}</div></div>;
  if (!item) return <div className="wrap"><div className="notfound">No se encontró el ítem solicitado.</div></div>;

  const hasExistencia = item.Existencia != null && item.Existencia !== '';
  const hasPrecioMayor = item.PrecioMayor != null && item.PrecioMayor !== '';
  const hasCostoProm = item.CostoPromedio != null && item.CostoPromedio !== '';

  return (
    <div className="wrap">
      <div className="card d-card">
        {/* Toolbar */}
        {/* Título y chips */}
        <h2 className="d-title">{item.Nombre || 'Producto'}</h2>
        <div className="d-chips">
          {item.Referencia && (
            <div className="d-chip" title="Referencia">
              <span className="d-chip-key">Ref: </span>
              <span className="d-chip-val">{item.Referencia}</span>
              
            </div>
          )}
          <div className="d-chip" title="Código de barras">
            <span className="d-chip-key">Código de barras: </span>
            <span className="d-chip-val">{item.CodigoBarra || '—'}</span>
           
          </div>
        </div>

        {/* Datos principales */}
        <div className="d-grid">
          <div className="d-kv">
            
            <div className="d-v">{costoUSD}</div>
          </div>
          <div className="d-kv">
            
            <div className="d-v">{PrecioDetalConIvaVEF}</div>
          </div>
          {hasPrecioMayor && (
            <div className="d-kv">
              <div className="d-k">Precio mayor</div>
              <div className="d-v">{fmtCurrency(item.PrecioMayor, 'VES')}</div>
            </div>
          )}
          {hasCostoProm && (
            <div className="d-kv">
              <div className="d-k">Costo promedio</div>
              <div className="d-v">{fmtCurrency(item.CostoPromedio, 'USD')}</div>
            </div>
          )}
          
          {hasExistencia && (
            <div className="d-kv">
              <div className="d-k">Existencia</div>
              <div className="d-v">{item.Existencia}</div>
            </div>
          )}
        </div>
        <div className="d-toolbar">
          <div className="d-toolbar-right">
            {copied && <div className="d-chip d-chip-ok" role="status" aria-live="polite">{copied}</div>}
            <button className="d-btn d-btn-primary" onClick={handleGoToScan}>Escanear otro producto</button>
          </div>
        </div>

        {/* Meta extra si viene */}
        <div className="d-meta">
          {item.Categoria && <div><span className="muted">Categoría: </span>{item.Categoria}</div>}
          {item.Marca && <div><span className="muted">Marca: </span>{item.Marca}</div>}
          {item.Tienda && <div><span className="muted">Tienda: </span>{item.Tienda}</div>}
          {item.Region && <div><span className="muted">Región: </span>{item.Region}</div>}
        </div>
      </div>
    </div>
  );
}
