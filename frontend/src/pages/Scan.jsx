// src/pages/Scan.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiBuscar } from '../lib/api';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const PREF_CAM_KEY = 'scan.prefCameraId'; // 🔐 cámara preferida

function Alert({ msg, kind = 'error', onHide }) {
  if (!msg) return null;
  const icon = kind === 'ok' ? '✅' : kind === 'warn' ? '⚠️' : '❌';
  return (
    <div className={`alert ${kind === 'ok' ? 'alert--ok' : kind === 'warn' ? 'alert--warn' : 'alert--error'}`} role="alert">
      <div className="alert__icon" aria-hidden="true">{icon}</div>
      <div className="alert__text">{msg}</div>
      <button className="btn-ghost" onClick={onHide}>Cerrar</button>
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
  const [camerasLoaded, setCamerasLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState('');

  // 🔒 anti-duplicados y ventana de gracia
  const inFlightRef   = useRef(false);
  const startingRef   = useRef(false);
  const lastScanRef   = useRef({ code: '', t: 0 });
  const [readyAt, setReadyAt] = useState(0);

  const [alert, setAlert] = useState('');
  const [alertKind, setAlertKind] = useState('error');

  // Autostart
  const [autoStartProcessed, setAutoStartProcessed] = useState(false);
  const hasAutoStart = params.get('autostart') === '1';

  const showAlert = (msg, kind = 'error') => { setAlert(msg); setAlertKind(kind); };
  const hideAlert = () => setAlert('');

  function mapApiProblem(json) {
    const txt = (json?.error || json?.message || '').toString();
    const dbDown = json?.db === 'down' || /db|database|sql|sqlserver|mssql/i.test(txt);
    return dbDown ? 'Fallo al consultar la base de datos' : 'Fallo en la consulta al servidor';
  }

  // Enumerar cámaras (preferida en cache → trasera → primera)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (cancelled) return;
        const sel = selectRef.current;
        if (!sel) return;

        if (!devices?.length) {
          sel.innerHTML = '<option>No hay cámaras</option>';
          setCamerasLoaded(true);
          return;
        }

        sel.innerHTML = devices.map(d => `<option value="${d.id}">${d.label || 'Cámara'}</option>`).join('');

        // 🧠 tomar la cache si existe y está disponible
        const cached = (() => { try { return localStorage.getItem(PREF_CAM_KEY); } catch { return null; } })();
        let picked = null;

        if (cached && devices.some(d => d.id === cached)) {
          picked = cached;
        } else {
          const back = devices.find(d => /back|trás|rear|environment/i.test(d.label || ''));
          picked = back ? back.id : devices[0].id;
          // guarda la primera elección para próximas visitas
          try { localStorage.setItem(PREF_CAM_KEY, picked); } catch {}
        }

        sel.value = picked;
        setSelectedId(picked);
        setCamerasLoaded(true);
      } catch (e) {
        console.error('getCameras error:', e);
        setCamerasLoaded(true);
        showAlert('No se pudo enumerar las cámaras del dispositivo', 'warn');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ✅ Autostart por query PERO solo si venimos de Detalle (scanPrime=1)
  useEffect(() => {
    if (!hasAutoStart || autoStartProcessed) return;
    if (!camerasLoaded) return;

    const prime = (() => { try { return sessionStorage.getItem('scanPrime') === '1'; } catch { return false; } })();
    if (!prime) return; // ← exige venir de Detalle

    if (document.visibilityState !== 'visible') return;

    setAutoStartProcessed(true);

    // limpia ?autostart=1 del URL
    const newParams = new URLSearchParams(params);
    newParams.delete('autostart');
    setParams(newParams, { replace: true });

    setReadyAt(Date.now() + 1000);
    const timer = setTimeout(() => {
      handleStart()
        .catch(err => console.error('Autostart failed:', err))
        .finally(() => { try { sessionStorage.removeItem('scanPrime'); } catch {} });
    }, 300);
    return () => clearTimeout(timer);
  }, [hasAutoStart, autoStartProcessed, camerasLoaded, params, setParams]);

  // ✅ Reintento de autostart SOLO si venimos de Detalle (scanPrime=1)
  useEffect(() => {
    const tryStart = () => {
      const prime = (() => { try { return sessionStorage.getItem('scanPrime') === '1'; } catch { return false; } })();
      if (!prime) return; // ← exige venir de Detalle
      if (!camerasLoaded) return;
      if (started) return;
      if (autoStartProcessed) return;
      if (document.visibilityState !== 'visible') return;

      setAutoStartProcessed(true);
      setReadyAt(Date.now() + 600);
      handleStart()
        .catch(err => console.error('autostart (visibility/focus):', err))
        .finally(() => { try { sessionStorage.removeItem('scanPrime'); } catch {} });
    };

    document.addEventListener('visibilitychange', tryStart);
    window.addEventListener('focus', tryStart);
    window.addEventListener('pageshow', tryStart); // back/forward cache

    // intenta una vez por si ya estamos visibles
    tryStart();

    return () => {
      document.removeEventListener('visibilitychange', tryStart);
      window.removeEventListener('focus', tryStart);
      window.removeEventListener('pageshow', tryStart);
    };
  }, [camerasLoaded, started, autoStartProcessed]);

  // ✅ Autostart al entrar SOLO si venimos de Detalle (scanPrime=1)
  useEffect(() => {
    if (autoStartProcessed) return;
    if (!camerasLoaded) return;

    const prime = (() => { try { return sessionStorage.getItem('scanPrime') === '1'; } catch { return false; } })();
    if (!prime) return; // ← exige venir de Detalle
    if (document.visibilityState !== 'visible') return;

    setAutoStartProcessed(true);
    setReadyAt(Date.now() + 1000);
    const t = setTimeout(() => {
      handleStart()
        .catch((e) => console.error('Auto start on enter failed:', e))
        .finally(() => { try { sessionStorage.removeItem('scanPrime'); } catch {} });
    }, 300);
    return () => clearTimeout(t);
  }, [autoStartProcessed, camerasLoaded]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      (async () => {
        try { if (html5QrCode?.isScanning) await html5QrCode.stop(); } catch {}
        try { if (html5QrCode) await html5QrCode.clear(); } catch {}
        inFlightRef.current = false;
        startingRef.current = false;
        lastScanRef.current = { code: '', t: 0 };
      })();
    };
  }, [html5QrCode]);

  // Mostrar el reader dentro del visor
  function showReaderInViewer() {
    const reader = readerRef.current;
    const img = imgRef.current;
    if (!reader || !img) return;
    img.classList.add('is-hidden');
    reader.hidden = false;
    reader.setAttribute('aria-hidden','false');
  }

  async function ensureFreshInstance() {
    if (html5QrCode) {
      try { if (html5QrCode.isScanning) await html5QrCode.stop(); } catch (e) { console.warn('stop:', e); }
      try { await html5QrCode.clear(); } catch (e) { console.warn('clear:', e); }
      setHtml5QrCode(null);
    }
    await new Promise(r => setTimeout(r, 100));
    const h = new Html5Qrcode('reader');
    setHtml5QrCode(h);
    return h;
  }

  async function startCamera(deviceIdOrFacing) {
  showReaderInViewer();

  if (startingRef.current) {
    console.log('Camera already starting, skipping...');
    return;
  }
  startingRef.current = true;

  try {
    const h = await ensureFreshInstance();

    const opts = {
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
    };

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    // 1) En iOS: prioriza arrancar con facingMode (permite permiso/previa inicialización)
    if (isIOS) {
      try {
        await h.start({ facingMode: 'environment' }, opts, onCode, () => {});
        setStarted(true);
        // Si nos pasaron un ID concreto y ya hay permiso, intenta cambiar a esa cámara
        if (typeof deviceIdOrFacing === 'string' && deviceIdOrFacing) {
          try { await h.stop(); } catch {}
          try {
            await h.start({ deviceId: { exact: deviceIdOrFacing } }, opts, onCode, () => {});
            setStarted(true);
            try { localStorage.setItem(PREF_CAM_KEY, deviceIdOrFacing); } catch {}
          } catch (e) {
            console.warn('No se pudo iniciar con deviceId en iOS, seguimos con environment:', e);
          }
        }
        return;
      } catch (e) {
        console.warn('iOS environment start falló, probando con user/backups:', e);
        // Fallback extra por si environment fallara (raro)
        await h.start({ facingMode: 'user' }, opts, onCode, () => {});
        setStarted(true);
        return;
      }
    }

    // 2) Otros navegadores (Android/desktop): intenta con el ID exacto si viene, y haz fallback
    const primarySel =
      (deviceIdOrFacing && typeof deviceIdOrFacing === 'string')
        ? { deviceId: { exact: deviceIdOrFacing } }
        : { facingMode: 'environment' };

    try {
      await h.start(primarySel, opts, onCode, () => {});
      setStarted(true);
      if (typeof deviceIdOrFacing === 'string') {
        try { localStorage.setItem(PREF_CAM_KEY, deviceIdOrFacing); } catch {}
      }
    } catch (err1) {
      console.warn('No se pudo iniciar con selección primaria, fallback a environment…', err1);
      try {
        await h.start({ facingMode: 'environment' }, opts, onCode, () => {});
        setStarted(true);
      } catch (err2) {
        console.warn('Fallback environment falló, probando cámara frontal…', err2);
        await h.start({ facingMode: 'user' }, opts, onCode, () => {});
        setStarted(true);
      }
    }
  } finally {
    startingRef.current = false;
  }
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

      const rows = (Array.isArray(json.data) ? json.data : []);
      if (!rows.length) {
        showAlert('Código de barra no encontrado', 'warn');
        inFlightRef.current = false;
        try { await html5QrCode?.resume?.(); } catch {}
        return;
      }

      try { await html5QrCode?.stop(); } catch {}
      try { await html5QrCode?.clear(); } catch {}

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
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('El navegador requiere HTTPS/permiso para la cámara');
      }
      setReadyAt(Date.now() + 600);
      await startCamera(sel?.value || selectedId || undefined);
    } catch (e) {
      console.error('startCamera error:', e);
      const msg = e?.name ? `${e.name}: ${e.message || ''}` : (e?.message || 'Error');
      showAlert(`No se pudo iniciar la cámara: ${msg}`, 'error');
    }
  }

  async function handleChangeCamera(e) {
    const id = e.target.value;
    setSelectedId(id);
    // 💾 guarda inmediatamente la preferida
    try { localStorage.setItem(PREF_CAM_KEY, id); } catch {}
    if (!started) return;
    try { 
      await startCamera(id); 
    } catch { 
      showAlert('No se pudo cambiar la cámara', 'warn'); 
    }
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
    <section id="pane-scan" className="pane is-visible scan" role="region" aria-label="Escanear o ingresar código">

      <div className="scan__grid">
        {/* VISOR */}
        <div className="scan__viewer card">
          <div className="viewer">
            <img
              ref={imgRef}
              className="viewer__placeholder scan-illustration"
              src="/svg/barcode.jpeg"
              alt="Ilustración: escanea el código de barras"
            />
            <div id="reader" ref={readerRef} className="viewer__reader" hidden aria-hidden="true"></div>
            <div className="viewer__overlay" aria-hidden="true" />
          </div>

          <div className="controls viewer__controls">
            <label className="visualmente-hidden" htmlFor="cameraSelect">Cámara</label>
            <select id="cameraSelect" ref={selectRef} onChange={handleChangeCamera} title="Cámara" />
          </div>
        </div>

        {/* PANEL */}
        <aside className="scan__panel card">
          <Alert msg={alert} kind={alertKind} onHide={hideAlert} />

          <button id="btn-start" className="btn-primary btn-block" onClick={handleStart} aria-pressed={started}>
            {started ? 'Reiniciar escaneo' : 'Escanear codigo de barras para ver precios'}
          </button>

          <div className="input-group">
            <label className="visually-hidden" htmlFor="manual-text">Referencia o código</label>
            <input
              id="manual-text"
              className="input-lg"
              type="search"
              inputMode="text"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              placeholder="escribe referencia O código"
              onKeyDown={(e)=> e.key==='Enter' && handleManualSearch(e.currentTarget.value)}
            />
            <button
              id="btn-manual"
              className="btn"
              type="button"
              onClick={()=>handleManualSearch(document.getElementById('manual-text').value)}
            >
              Buscar
            </button>
          </div>

        </aside>
      </div>
    </section>
  );
}
