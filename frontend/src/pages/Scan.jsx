// src/pages/Scan.jsx
import React, { useEffect, useRef, useState } from 'react';
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
  const readerRef = useRef(null);
  const imgRef    = useRef(null);
  const selectRef = useRef(null);

  const [html5QrCode, setHtml5QrCode] = useState(null);
  const [started, setStarted] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);

  // anti-duplicados
  const inFlightRef  = useRef(false);
  const lastScanRef  = useRef({ code: '', t: 0 });
  const [readyAt, setReadyAt] = useState(0);

  // UI
  const [alert, setAlert] = useState('');
  const [alertKind, setAlertKind] = useState('error');
  const [detail, setDetail] = useState(null); // ← aquí guardamos el ítem para el overlay

  const showAlert = (msg, kind = 'error') => { setAlert(msg); setAlertKind(kind); };
  const hideAlert = () => setAlert('');

  function mapApiProblem(json) {
    const txt = (json?.error || json?.message || '').toString();
    const dbDown = json?.db === 'down' || /db|database|sql|sqlserver|mssql/i.test(txt);
    return dbDown ? 'Fallo al consultar la base de datos' : 'Fallo en la consulta al servidor';
  }

  // Enumerar cámaras
  useEffect(() => {
    (async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        const sel = selectRef.current;
        if (!sel) return;
        if (!devices?.length) {
          sel.innerHTML = '<option>No hay cámaras</option>';
          return;
        }
        sel.innerHTML = devices.map(d => `<option value="${d.id}">${d.label || 'Cámara'}</option>`).join('');
        const back = devices.find(d => /back|trás|rear|environment/i.test(d.label || ''));
        sel.value = back ? back.id : devices[0].id;
      } catch (e) {
        console.error('getCameras error:', e);
        showAlert('No se pudo enumerar las cámaras del dispositivo', 'warn');
      }
    })();
  }, []);

  // Intento de autoarranque suave (si el permiso ya fue concedido alguna vez, arranca solo)
  useEffect(() => {
    const t = setTimeout(async () => {
      try { await handleStart(); setNeedsGesture(false); }
      catch { setNeedsGesture(true); }
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detener cámara al desmontar
  useEffect(() => {
    return () => { (async () => { try { if (html5QrCode?.isScanning) await html5QrCode.stop(); } catch {} })(); };
  }, [html5QrCode]);

  function placeReaderInHero() {
    const reader = readerRef.current;
    const img = imgRef.current;
    if (!reader || !img) return;
    const cs = getComputedStyle(img);
    reader.style.width = cs.width;
    reader.style.maxWidth = cs.maxWidth !== 'none' ? cs.maxWidth : cs.width;
    img.replaceWith(reader);
    reader.classList.add('in-hero');
    reader.hidden = false;
    reader.setAttribute('aria-hidden','false');
  }

  async function startCamera(deviceId) {
    placeReaderInHero();

    let h = html5QrCode;
    if (!h) {
      h = new Html5Qrcode('reader');
      setHtml5QrCode(h);
    } else if (h.isScanning) {
      try { await h.stop(); } catch {}
    }

    const cameraSelector =
      deviceId && typeof deviceId === 'string'
        ? deviceId
        : { facingMode: 'environment' };

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
    // si hay overlay abierto, ignora
    if (detail) return;

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

      // MOSTRAR DETALLE EN OVERLAY (no navegamos de ruta)
      setDetail(rows[0]);
      // dejamos la cámara pausada para reanudar luego
      inFlightRef.current = false;
    } catch {
      showAlert('Fallo en la consulta al servidor', 'error');
      inFlightRef.current = false;
      try { await html5QrCode?.resume?.(); } catch {}
    }
  }

  async function handleStart() {
    const sel = selectRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('El navegador requiere HTTPS y permiso para la cámara');
    }
    setReadyAt(Date.now() + 600);
    await startCamera(sel?.value);
  }

  async function handleChangeCamera(e) {
    if (!started) return;
    try { await startCamera(e.target.value); }
    catch { showAlert('No se pudo cambiar la cámara', 'warn'); }
  }

  async function handleManualSearch(value) {
    const texto = (value||'').trim();
    if (!texto) return;
    try {
      const json = await apiBuscar({ one:1, ...( /^\d+$/.test(texto) ? {barcode:texto} : {referencia:texto} ) });
      if (!json || json.ok === false) {
        showAlert(mapApiProblem(json || {}), 'error'); return;
      }
      const rows = json?.data || [];
      if (!rows.length) { showAlert('Código de barra no encontrado', 'warn'); return; }
      setDetail(rows[0]);
      try { await html5QrCode?.pause?.(true); } catch {}
    } catch {
      showAlert('Fallo en la consulta al servidor', 'error');
    }
  }

  async function closeDetailAndResume() {
    setDetail(null);
    setReadyAt(Date.now() + 600); // pequeña gracia para evitar doble lectura inmediata
    try { await html5QrCode?.resume?.(); } catch {}
  }

  return (
    <>
      <Alert msg={alert} kind={alertKind} onHide={hideAlert} />

      {/* Si el navegador exige gesto inicial y no pudimos auto-arrancar */}
      {needsGesture && !started && (
        <div
          onClick={async () => { try { await handleStart(); setNeedsGesture(false); } catch {} }}
          onTouchEnd={async () => { try { await handleStart(); setNeedsGesture(false); } catch {} }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 9999 }}
        >
          <button className="btn-primary" style={{ fontSize:18, padding:'14px 18px', borderRadius:12 }} aria-label="Toca para iniciar la cámara">
            Toca para iniciar la cámara
          </button>
        </div>
      )}

      {/* OVERLAY DE DETALLE (cámara pausada, no pedimos permisos otra vez) */}
      {detail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9998 }}>
          <div className="card" style={{ maxWidth:680, width:'92%', background:'#fff', padding:16, borderRadius:12 }}>
            <h2 style={{ margin:'0 0 8px' }}>{detail.Nombre}</h2>
            <div className="row" style={{ display:'grid', gridTemplateColumns:'180px 1fr', gap:'8px 12px', marginTop:8 }}>
              <div><strong>Referencia</strong></div><div>{detail.Referencia}</div>
              <div><strong>Código barras</strong></div><div>{detail.CodigoBarra || '—'}</div>
              <div><strong>Costo Dólar</strong></div><div>{detail.CostoInicial}</div>
              <div><strong>Precio bolívares</strong></div><div>{detail.PrecioDetal}</div>
            </div>
            <div className="actions" style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
              <button className="btn-ghost" onClick={closeDetailAndResume}>
                Escanear otro producto
              </button>
            </div>
          </div>
        </div>
      )}

      <section id="pane-scan" className="pane is-visible" role="region" aria-label="Escanear o ingresar código">
        <div className="hero card">
          <div className="hero__body">
            <h2 className="hero__title">Apunta al código</h2>

            <img ref={imgRef} className="scan-illustration" src="/svg/barcode.jpeg" alt="Ilustración: escanea el código de barras" />

            <div className="controls" style={{marginTop:8}}>
              <label className="visually-hidden" htmlFor="cameraSelect">Cámara</label>
              <select id="cameraSelect" ref={selectRef} onChange={handleChangeCamera} title="Cámara" />
              <button id="btn-torch" disabled>Linterna</button>
            </div>

            <div className="hero__actions" style={{gap:10, flexDirection:'column', alignItems:'flex-start'}}>
              <button id="btn-start" className="btn-primary" onClick={async ()=>{ try{ await handleStart(); setNeedsGesture(false);}catch(e){ setNeedsGesture(true);} }}>
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

        <div id="reader" ref={readerRef} className="card reader" hidden aria-hidden="true"></div>
      </section>
    </>
  );
}
