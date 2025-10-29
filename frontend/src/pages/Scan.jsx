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
      style={{
        borderRadius: 12,
        padding: '12px 14px',
        lineHeight: 1.4,
        boxShadow: '0 6px 18px rgba(0,0,0,.12)',
        display: 'flex',
        alignItems: 'start',
        gap: 10
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>
      <div style={{ flex: 1 }}>{msg}</div>
      <button className="btn-ghost" onClick={onHide} style={{ marginLeft: 8 }}>
        Cerrar
      </button>
    </div>
  );
}

export default function Scan() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const readerRef = useRef(null);
  const imgRef    = useRef(null);
  const selectRef = useRef(null);

  const [html5QrCode, setHtml5QrCode] = useState(null);
  const [started, setStarted] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false); // ⬅️ fallback para iOS

  // anti-duplicados
  const inFlightRef  = useRef(false);
  const lastScanRef  = useRef({ code: '', t: 0 });
  const [readyAt, setReadyAt] = useState(0);

  const [alert, setAlert] = useState('');
  const [alertKind, setAlertKind] = useState('error');

  const hasAutoStart = params.get('autostart') === '1';
  const autoStartedRef = useRef(false);

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

  // Autostart (con fallback de “primer tap”)
  useEffect(() => {
    if (!hasAutoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;

    const tryAuto = async () => {
      // pequeña ventana para evitar lecturas dobles al abrir
      setReadyAt(Date.now() + 1200);

      // intentamos permiso silencioso (si ya lo diste, devuelve stream; si no, fallará)
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const tmp = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
          tmp.getTracks().forEach(t => t.stop());
        }
      } catch { /* ignoramos */ }

      // Intento de arranque inmediato
      try {
        await handleStart();
        // si arrancó, quitamos el parámetro
        params.delete('autostart');
        setParams(params, { replace: true });
        setNeedsGesture(false);
      } catch (e) {
        // Si falla por política de gesto o estado de cámara, pedimos un tap
        setNeedsGesture(true);
      }
    };

    // Intento inicial (ligero retardo)
    const t = setTimeout(tryAuto, 300);

    // Listener one-shot: primer tap en pantalla => start()
    const onFirstTap = async () => {
      if (started) return;
      setNeedsGesture(false);
      try {
        await handleStart();
        params.delete('autostart');
        setParams(params, { replace: true });
      } catch (e) {
        console.error('gesture start error:', e);
        setNeedsGesture(true);
      } finally {
        window.removeEventListener('pointerdown', onFirstTap, { once: true });
        window.removeEventListener('touchend', onFirstTap, { once: true });
        window.removeEventListener('click', onFirstTap, { once: true });
      }
    };
    window.addEventListener('pointerdown', onFirstTap, { once: true });
    window.addEventListener('touchend', onFirstTap, { once: true });
    window.addEventListener('click', onFirstTap, { once: true });

    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', onFirstTap, { once: true });
      window.removeEventListener('touchend', onFirstTap, { once: true });
      window.removeEventListener('click', onFirstTap, { once: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAutoStart]);

  // Detener la cámara al desmontar
  useEffect(() => {
    return () => {
      (async () => {
        try {
          if (html5QrCode?.isScanning) await html5QrCode.stop();
        } catch {}
      })();
    };
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
    reader.setAttribute('aria-hidden', 'false');
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
        : { facingMode: 'environment' }; // usa "ideal" internamente

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
    const sel = selectRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('El navegador requiere HTTPS y permiso para la cámara');
    }
    // pequeña gracia al reiniciar manualmente
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
        showAlert(mapApiProblem(json || {}), 'error');
        return;
      }

      const rows = json?.data || [];
      if (!rows.length) {
        showAlert('Código de barra no encontrado', 'warn');
        return;
      }

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

      {/* Overlay de gesto cuando el navegador lo exige */}
      {needsGesture && (
        <div
          onClick={async () => { try { await handleStart(); setNeedsGesture(false); } catch {} }}
          onTouchEnd={async () => { try { await handleStart(); setNeedsGesture(false); } catch {} }}
          style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,.6)',
            display:'flex', alignItems:'center', justifyContent:'center',
            zIndex: 9999
          }}
        >
          <button
            className="btn-primary"
            style={{ fontSize:18, padding:'14px 18px', borderRadius:12 }}
            aria-label="Toca para iniciar la cámara"
          >
            Toca para iniciar la cámara
          </button>
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
