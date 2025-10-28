import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiBuscar } from '../lib/api';

export default function Detalle() {
  const [params] = useSearchParams();
  const [item, setItem] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const ref = params.get('referencia');
        const bc  = params.get('barcode');
        if (!ref && !bc) { setErr('Faltan parámetros'); return; }
        const json = await apiBuscar({ one:1, ...(bc ? {barcode:bc}:{referencia:ref}) });
        const rows = json?.data || [];
        setItem(rows[0] || null);
      } catch (e) { setErr('Error consultando el servidor'); }
    })();
  }, [params]);

  if (err) return <div className="notfound">{err}</div>;
  if (!item) return <div className="notfound">No se encontró el ítem solicitado.</div>;

  return (
    <div className="card" style={{maxWidth:680}}>
      <h2 style={{margin:'0 0 8px'}}>{item.Nombre}</h2>
      <div className="row" style={{display:'grid', gridTemplateColumns:'180px 1fr', gap:'8px 12px', marginTop:8}}>
        <div><strong>Referencia</strong></div><div>{item.Referencia}</div>
        <div><strong>Código barras</strong></div><div>{item.CodigoBarra || '—'}</div>
        <div><strong>Costo Dólar</strong></div><div>{item.CostoInicial}</div>
        <div><strong>Precio bolivares</strong></div><div>{item.PrecioDetal}</div>
      </div>
     

      <div className="actions" style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:12}}>
        <Link className="btn-ghost" to="/scan">Escanear otro producto</Link>
      </div>
    </div>
  );
}
