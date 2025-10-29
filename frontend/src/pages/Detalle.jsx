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
  const [prepping, setPrepping] = useState(false);

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

  // 🔧 FIX: Click que "precalienta" permisos de cámara y navega a /scan?autostart=1
  const handleScanOtro = async () => {
    setPrepping(true);
    
    // Pequeño delay para mostrar feedback visual
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        // Pedimos cámara dentro del gesto del usuario (click); iOS lo acepta
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }
        });
        
        // 🔧 FIX: Delay mínimo antes de cerrar el stream
        // Esto asegura que el sistema operativo registre correctamente el permiso
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Cerramos de inmediato; solo queremos el permiso
        stream.getTracks().forEach(t => t.stop());
        
        // 🔧 FIX: Otro delay después de cerrar para asegurar liberación
        await new Promise(resolve => setTimeout(resolve, 150));
        
        console.log('✅ Permisos de cámara obtenidos y liberados');
      }
    } catch (e) {
      console.warn('⚠️ No se pudo precalentar la cámara:', e.message);
      // Si el usuario niega o hay restricción, igual navegamos.
      // En /scan el usuario podrá tocar "Iniciar escaneo".
    } finally {
      // 🔧 FIX: Navegar con state para mejor control
      navigate('/scan?autostart=1', { 
        replace: false,
        state: { fromDetalle: true }
      });
      setPrepping(false);
    }
  };

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
        <button
          className="btn-ghost"
          onClick={handleScanOtro}
          disabled={prepping}
          aria-busy={prepping ? 'true' : 'false'}
        >
          {prepping ? 'Preparando cámara…' : 'Escanear otro producto'}
        </button>
        
        <button
          className="btn-ghost"
          onClick={() => navigate('/scan')}
          disabled={prepping}
        >
          Scanear otro producto 
        </button>
      </div>
    </div>
  );
}