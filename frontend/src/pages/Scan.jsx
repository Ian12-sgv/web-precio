// src/pages/Scan.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiBuscar } from '../lib/api';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

function Alert({ msg, kind = 'error', onHide }) {
  if (!msg) return null;
  const icon = kind === 'ok' ? '✅' : kind === 'warn' ? '⚠️' : '❌';
  return (
    <div
      className={`alert ${kind === 'ok' ? 'alert--ok' : kind === 'warn' ? 'alert--warn' : 'alert--error'}`}
      role="alert"
      style={{ borderRadius: 12, padding: '12px 14px', lineHeight: 1.4, boxShadow: '0 6px 18px rgba(0,0,0,.12)', display: 'flex', alignItems: 'start', gap: 10 }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>
      <div style={{ flex: 1 }}>{msg}</div>
      <button className="btn-ghost" onClick={onHide} style={{ marginLeft: 8 }}>Cerrar</button>
    </div>
  );
}

export default function Scan() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const readerRef = useRef(null);
  const selectRef = useRef(null);

  const [html5QrCode, setHtml5QrCode] = useState(null);
  const [started, setStarted] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState('');

  // anti-duplicados / timing
  const inFlightRef  = useRef(false);
  const lastScanRef  = useRef({ code: '', t: 0 });
  const [readyAt, setReadyAt] = useState(0);

  // UI
  const [alert, setAlert] = useState('');
  const [alertKind, setAlertKind] = useState('error');

  const showAlert = (msg, kind = 'error') => { setAlert(msg); setAlertKind(kind); };
  const hideAlert = () => setAlert('');

  const hasAutoStart = params.get('autostart') === '1';

  function mapApiProblem(json) {
    const txt = (json?.error || json?.message || '').toString();
    const dbDown = json?.db === 'down' || /db|database|sql|sqlserver|mssql/i.test(txt);
    return dbDown ? 'Fallo al consultar la base de datos' : 'Fallo en la consulta al servidor';
  }

  // 1) Enumerar cámaras y elegir trasera si existe
  useEffect(() => {
    (async () => {
      try {
        const cams = await Html5Qrcode.getCameras();
        setDevices(cams || []);
        if (!cams?.length) {
          showAlert('No hay cámaras disponibles en este dispositivo', 'warn');
          return;
        }
        const back = cams.find(d => /back|trás|rear|environment/i.test(d.label || ''));
        const first = (back || cams[0]).id;
        setSelectedId(first);
      } catch (e) {
        console.error('getCameras error:', e);
        showAlert('No se pudo enumerar las cámaras del dispositivo', 'warn');
      }
    })();
  }, []);

  // 2) Autostart al volver desde Detalle (?autostart=1)
  useEffect(() => {
    if (!hasAutoStart || !selectedId) return;
    // limpia el param para que no quede pegado
    params.delete('autostart');
    setParams(params, { replace: true });

    setReadyAt(Date.now() + 1200); // evita doble lectura al arrancar
    const t = setTimeout(() => {
      handleStart().catch(() => {
        // si falla (permiso/gesto), el usuario puede tocar "Iniciar escaneo"
        showAlert('Toca "Iniciar escaneo" para abrir la cámara', 'warn');
      });
    }, 300); // pequeño delay para que el contenedor tenga layout
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAutoStart, selectedId]);

  // 3) Detener cámara al desmontar
  useEffect(() => {
    return () => { (async () => { try { if (html5QrCode?.isScanning) await html5QrCode.stop(); } catch {} })(); };
  }, [html5QrCode]);

  async function startCamera(cameraId) {
    const el = readerRef.current;
    if (!el) throw new Error('Contenedor del lector no está listo');

    // Asegura tamaño visible antes de start()
    el.style.width = el.style.width || '100%';
    el.style.maxWidth = el.style.maxWidth || '420px';
    el.style.height = el.style.height || '320px';
    el.style.background = el.style.background || '#000';
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');

    let h = html5QrCode;
    if (!h) {
      h = new Html5Qrcode(el.id || 'reader');
      setHtml5QrCode(h);
    } else if (h.isScanning) {
      try { await h.stop(); } catch {}
    }

    const cameraSelector = cameraId ? cameraId : { facingMode: 'environment' };

    await h.start(
      cameraSelector,
      {
        fps: 15,
        qrbox: 280,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF
        ]
      },
      onCode,
      () => {}
    );
    setStarted(true);
  }

  async function onCode(text) {
    if (Date.now() < readyAt) return;

    const now = Date.now();
    if (inFlightRef.current) return;
    if (lastScanRef.current.code === text && (now - lastScanRef.current.t) < 1500) return;
    inFlightRef.current = true;
    lastScanRef.current = { code: text, t: now };

    try { await html5QrCode?.pause?.(true); } catch {}

    try {
      const json = await apiBuscar({ one:1, ...( /^\d+$/.test(text) ? {barcode:text} : {referencia:text} ) });

      if (!json || json.ok === false) {
        showAlert(mapApiProblem(json || {}), 'error');
        inFlightRef.current = false;
        try { await html5QrCode?.resume?.(); } catch {}
        return;
      }

      const rows = Array.isArray(json.data) ? json.data : [];
      if (!rows.length) {
        showAlert('Código de barra no encontrado', 'warn');
        inFlightRef.current = false;
        try { await html5QrCode?.resume?.(); } catch {}
        return;
      }

      // ✅ detener antes de navegar para evitar doble callback
      try { await html5QrCode?.stop(); } catch {}
      const row = rows[0];
      if (row.Referencia) nav(`/detalle?referencia=${encodeURIComponent(row.Referencia)}`);
      else if (row.CodigoBarra) nav(`/detalle?barcode=${encodeURIComponent(row.CodigoBarra)}`);
      else nav(`/detalle?referencia=${encodeURIComponent(text)}`);
    } catch (e) {
      console.error('apiBuscar error:', e);
      showAlert('Fallo en la consulta al servidor', 'error');
      inFlightRef.current = false;
      try { await html5QrCode?.resume?.(); } catch {}
    }
  }

  async function handleStart() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('El navegador requiere HTTPS y permiso para la cámara');
    }
    setReadyAt(Date.now() + 600);
    try {
      await startCamera(selectedId);
    } catch (e) {
      console.error('startCamera error:', e);
      if (e?.name === 'NotAllowedError') {
        showAlert('Permite el acceso a la cámara para continuar.', 'warn');
      } else if (e?.name === 'NotFoundError') {
        showAlert('No se encontró cámara disponible', 'warn');
      } else if (e?.name === 'NotReadableError' || e?.name === 'AbortError') {
        showAlert('La cámara está en uso por otra app. Ciérrala e inténtalo de nuevo.', 'warn');
      } else {
        showAlert(`No se pudo iniciar la cámara: ${e?.message || 'Error'}`, 'error');
      }
      throw e;
    }
  }

  async function handleChangeCamera(e) {
    const id = e.target.value;
    setSelectedId(id);
    if (!started) return;
    try { await startCamera(id); }
    catch { showAlert('No se pudo cambiar la cámara', 'warn'); }
  }

  async function handleManualSearch(value) {
    const texto = (value||'').trim();
    if (!texto) return;
    try {
      const json = await apiBuscar({ one:1, ...( /^\d+$/.test(texto) ? {barcode:texto} : {referencia:texto} ) });
      if (!json || json.ok === false) { showAlert(mapApiProblem(json || {}), 'error'); return; }
      const rows = json?.data || [];
      if (!rows.length) { showAlert('Código de barra no encontrado', 'warn'); return; }
      // igual que onCode: detenemos y navegamos
      try { await html5QrCode?.stop(); } catch {}
      const row = rows[0];
      if (row.Referencia) nav(`/detalle?referencia=${encodeURIComponent(row.Referencia)}`);
      else if (row.CodigoBarra) nav(`/detalle?barcode=${encodeURIComponent(row.CodigoBarra)}`);
    } catch {
      showAlert('Fallo en la consulta al servidor', 'error');
    }
  }

  return (
    <>
      <Alert msg={alert} kind={alertKind} onHide={hideAlert} />

      <section id="pane-scan" className="pane is-visible" role="region" aria-label="Escanear o ingresar código">
        <div className="hero card">
          <div className="hero__body">
            <h2 className="hero__title">Apunta al código</h2>

            {/* CONTENEDOR DEL LECTOR: tamaño fijo visible */}
            <div
              id="reader"
              ref={readerRef}
              hidden
              aria-hidden="true"
              style={{
                width: '100%',
                maxWidth: 420,
                height: 320,
                background: '#000',
                borderRadius: 12,
                margin: '12px auto'
              }}
            />

            <div className="controls" style={{marginTop:8}}>
              <label className="visually-hidden" htmlFor="cameraSelect">Cámara</label>
              <select id="cameraSelect" title="Cámara" value={selectedId} onChange={handleChangeCamera} ref={selectRef}>
                {devices.length === 0 && <option value="">(No hay cámaras)</option>}
                {devices.map(d => <option key={d.id} value={d.id}>{d.label || 'Cámara'}</option>)}
              </select>
              <button id="btn-torch" disabled>Linterna</button>
            </div>

            <div className="hero__actions" style={{gap:10, flexDirection:'column', alignItems:'flex-start'}}>
              <button
                id="btn-start"
                className="btn-primary"
                onClick={() => handleStart().catch(()=>{})}
              >
                {started ? 'Reiniciar escaneo' : 'Iniciar escaneo'}
              </button>

              <div style={{display:'flex', gap:8, width:'100%', maxWidth:420}}>
                <input id="manual-text"
                  className="input-lg"
                  type="search" inputMode="text" enterKeyHint="search"
                  autoCapitalize="none" autoCorrect="off" spellCheck="false"
                  placeholder="Escribe referencia o código y presiona Enter"
                  onKeyDown={(e)=> e.key==='Enter' && handleManualSearch(e.currentTarget.value)}
                  style={{flex:1}} />
                <button id="btn-manual" className="btn-primary" type="button"
                        onClick={()=>handleManualSearch(document.getElementById('manual-text').value)}>
                  Buscar
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
