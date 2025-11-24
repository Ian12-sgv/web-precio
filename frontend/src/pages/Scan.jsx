// src/pages/Scan.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { apiBuscar, apiTasaDetal } from '../lib/api';

const PREF_CAM_KEY = 'scan.prefCameraId'; // 🔐 cámara preferida

function Alert({ msg, kind = 'error', onHide }) {
  if (!msg) return null;
  const icon = kind === 'ok' ? '✅' : kind === 'warn' ? '⚠️' : '❌';
  return (
    <div
      className={`alert ${
        kind === 'ok' ? 'alert--ok' : kind === 'warn' ? 'alert--warn' : 'alert--error'
      }`}
      role="alert"
    >
      <div className="alert__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="alert__text">{msg}</div>
      <button className="btn-ghost" onClick={onHide}>
        Cerrar
      </button>
    </div>
  );
}

export default function Scan() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const readerRef = useRef(null);
  const imgRef = useRef(null);
  const selectRef = useRef(null);

  const [html5QrCode, setHtml5QrCode] = useState(null);
  const [started, setStarted] = useState(false);
  const [camerasLoaded, setCamerasLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState('');

  // 🔒 anti-duplicados y ventana de gracia
  const inFlightRef = useRef(false);
  const startingRef = useRef(false);
  const lastScanRef = useRef({ code: '', t: 0 });
  const [readyAt, setReadyAt] = useState(0);

  const [alert, setAlert] = useState('');
  const [alertKind, setAlertKind] = useState('error');

  // Autostart
  const [autoStartProcessed, setAutoStartProcessed] = useState(false);
  const hasAutoStart = params.get('autostart') === '1';

  const showAlert = (msg, kind = 'error') => {
    setAlert(msg);
    setAlertKind(kind);
  };
  const hideAlert = () => setAlert('');

  function mapApiProblem(json) {
    const txt = (json?.error || json?.message || '').toString();
    const dbDown = json?.db === 'down' || /db|database|sql|sqlserver|mssql/i.test(txt);
    return dbDown ? 'Fallo al consultar la base de datos' : 'Fallo en la consulta al servidor';
  }

  // 👉 Largo alcance / iOS helpers
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const IS_IOS =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS

  const [longRange, setLongRange] = useState(true); // <-- MODO LARGO ALCANCE
  const [camTrack, setCamTrack] = useState(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false); // reservado si luego quieres UI de linterna

  // ⬇️ Zoom: habilitar solo en iOS
  // ⬇️ Zoom: barra visible en iOS aunque la cámara no exponga capabilities de zoom
const [zoomSupported, setZoomSupported] = useState(IS_IOS);
const [zoomRange, setZoomRange] = useState({
  min: 1,
  max: IS_IOS ? 3 : 1,
  step: 0.1,
  value: 1,
});


  const failCountRef = useRef(0);

  // 🔹 Tasa DETAL (y estados de carga)
  const [tasaDetal, setTasaDetal] = useState(null);
  const [tasaLoading, setTasaLoading] = useState(true);
  const [tasaError, setTasaError] = useState('');

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

        sel.innerHTML = devices
          .map((d) => `<option value="${d.id}">${d.label || 'Cámara'}</option>`)
          .join('');

        const cached = (() => {
          try {
            return localStorage.getItem(PREF_CAM_KEY);
          } catch {
            return null;
          }
        })();
        let picked = null;

        if (cached && devices.some((d) => d.id === cached)) {
          picked = cached;
        } else {
          const back = devices.find((d) =>
            /back|trás|rear|environment/i.test(d.label || '')
          );
          picked = back ? back.id : devices[0].id;
          try {
            localStorage.setItem(PREF_CAM_KEY, picked);
          } catch {}
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
    return () => {
      cancelled = true;
    };
  }, []);

  // 🔹 Cargar TASA DETAL desde la API Node (puente)
  useEffect(() => {
    let cancelled = false;

    async function fetchTasaDetal() {
      setTasaLoading(true);
      setTasaError('');

      try {
        const data = await apiTasaDetal(); // llama a /api/tasa-detal en tu backend Node
        if (!cancelled) {
          setTasaDetal(data); // { valor, fecha }
          setTasaLoading(false);
          console.log('Tasa DETAL cargada:', data);
        }
      } catch (err) {
        console.error('Error obteniendo tasa detal', err);
        if (!cancelled) {
          setTasaError('No se pudo cargar la tasa del dólar');
          setTasaLoading(false);
        }
      }
    }

    fetchTasaDetal();

    return () => {
      cancelled = true;
    };
  }, []);

  // Autostarts (como ya los tenías)
  useEffect(() => {
    if (!hasAutoStart || autoStartProcessed) return;
    if (!camerasLoaded) return;
    const prime = (() => {
      try {
        return sessionStorage.getItem('scanPrime') === '1';
      } catch {
        return false;
      }
    })();
    if (!prime) return;
    if (document.visibilityState !== 'visible') return;

    setAutoStartProcessed(true);
    const newParams = new URLSearchParams(params);
    newParams.delete('autostart');
    setParams(newParams, { replace: true });

    setReadyAt(Date.now() + 1000);
    const timer = setTimeout(() => {
      handleStart()
        .catch((err) => console.error('Autostart failed:', err))
        .finally(() => {
          try {
            sessionStorage.removeItem('scanPrime');
          } catch {}
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [hasAutoStart, autoStartProcessed, camerasLoaded, params, setParams]);

  useEffect(() => {
    const tryStart = () => {
      const prime = (() => {
        try {
          return sessionStorage.getItem('scanPrime') === '1';
        } catch {
          return false;
        }
      })();
      if (!prime) return;
      if (!camerasLoaded) return;
      if (started) return;
      if (autoStartProcessed) return;
      if (document.visibilityState !== 'visible') return;

      setAutoStartProcessed(true);
      setReadyAt(Date.now() + 600);
      handleStart()
        .catch((err) => console.error('autostart (visibility/focus):', err))
        .finally(() => {
          try {
            sessionStorage.removeItem('scanPrime');
          } catch {}
        });
    };
    document.addEventListener('visibilitychange', tryStart);
    window.addEventListener('focus', tryStart);
    window.addEventListener('pageshow', tryStart);
    tryStart();
    return () => {
      document.removeEventListener('visibilitychange', tryStart);
      window.removeEventListener('focus', tryStart);
      window.removeEventListener('pageshow', tryStart);
    };
  }, [camerasLoaded, started, autoStartProcessed]);

  useEffect(() => {
    if (autoStartProcessed) return;
    if (!camerasLoaded) return;
    const prime = (() => {
      try {
        return sessionStorage.getItem('scanPrime') === '1';
      } catch {
        return false;
      }
    })();
    if (!prime) return;
    if (document.visibilityState !== 'visible') return;

    setAutoStartProcessed(true);
    setReadyAt(Date.now() + 1000);
    const t = setTimeout(() => {
      handleStart()
        .catch((e) => console.error('Auto start on enter failed:', e))
        .finally(() => {
          try {
            sessionStorage.removeItem('scanPrime');
          } catch {}
        });
    }, 300);
    return () => clearTimeout(t);
  }, [autoStartProcessed, camerasLoaded]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      (async () => {
        try {
          if (html5QrCode?.isScanning) await html5QrCode.stop();
        } catch {}
        try {
          if (html5QrCode) await html5QrCode.clear();
        } catch {}
        try {
          if (camTrack?.stop) camTrack.stop();
        } catch {}
        inFlightRef.current = false;
        startingRef.current = false;
        lastScanRef.current = { code: '', t: 0 };
      })();
    };
  }, [html5QrCode, camTrack]);

  function showReaderInViewer() {
    const reader = readerRef.current;
    const img = imgRef.current;
    if (!reader || !img) return;
    img.classList.add('is-hidden');
    reader.hidden = false;
    reader.setAttribute('aria-hidden', 'false');
  }

  async function ensureFreshInstance() {
    if (html5QrCode) {
      try {
        if (html5QrCode.isScanning) await html5QrCode.stop();
      } catch (e) {
        console.warn('stop:', e);
      }
      try {
        await html5QrCode.clear();
      } catch (e) {
        console.warn('clear:', e);
      }
      setHtml5QrCode(null);
    }
    await new Promise((r) => setTimeout(r, 100));
    const h = new Html5Qrcode('reader');
    setHtml5QrCode(h);
    return h;
  }

  async function startCamera(deviceIdOrFacing) {
    showReaderInViewer();
    if (startingRef.current) return;
    startingRef.current = true;

    try {
      const h = await ensureFreshInstance();
      const cameraSelector =
        deviceIdOrFacing && typeof deviceIdOrFacing === 'string'
          ? deviceIdOrFacing
          : { facingMode: 'environment' };

      // 🔭 Largo alcance: más resolución, fotograma completo, fps mayores
      const cfg = {
        fps: longRange ? 24 : 15,
        ...(longRange ? {} : { qrbox: 280 }),
        rememberLastUsedCamera: true,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF
        ],
        videoConstraints: {
          width: { ideal: longRange ? 2560 : 1920 },
          height: { ideal: longRange ? 1440 : 1080 },
          aspectRatio: isIOS() ? { ideal: 1.7777777778 } : undefined,
          facingMode: { ideal: 'environment' }
        }
      };

      await h.start(
        cameraSelector,
        cfg,
        onCode,
        onDecodeFailure
      );
      setStarted(true);

      if (typeof deviceIdOrFacing === 'string') {
        try {
          localStorage.setItem(PREF_CAM_KEY, deviceIdOrFacing);
        } catch {}
      }

      // Afinar cámara (AF/exp para todos; zoom/torch solo iOS)
      await tuneCamera();
    } finally {
      startingRef.current = false;
    }
  }

  async function tuneCamera() {
    const video = document.querySelector('#reader video');
    const track = video?.srcObject?.getVideoTracks?.()[0];
    if (!track) return;

    setCamTrack(track);
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    const advanced = [];

    // AF continuo o single-shot (para todos)
    if (caps.focusMode && caps.focusMode.includes('continuous')) {
      advanced.push({ focusMode: 'continuous' });
    } else if (caps.focusMode && caps.focusMode.includes('single-shot')) {
      advanced.push({ focusMode: 'single-shot' });
    }

    if (caps.focusMode && caps.focusMode.includes('continuous')) {
      advanced.push({ focusMode: 'continuous' });
    } else if (caps.focusMode && caps.focusMode.includes('single-shot')) {
      advanced.push({ focusMode: 'single-shot' });
    }

    // 🔍 Zoom solo en iOS
    // 🔍 Zoom solo en iOS
if (IS_IOS) {
  // Siempre mostramos slider en iOS
  setZoomSupported(true);

  if (caps.zoom) {
    const base = longRange ? 2.4 : 1.2;
    const initial = Math.min(
      Math.max(base, caps.zoom.min ?? 1),
      caps.zoom.max ?? base
    );
    advanced.push({ zoom: initial });
    setZoomRange({
      min: caps.zoom.min ?? 1,
      max: caps.zoom.max ?? Math.max(3, initial),
      step: caps.zoom.step ?? 0.1,
      value: initial
    });
  } else {
    // Sin soporte nativo de zoom: mantenemos un rango lógico para el slider
    setZoomRange((z) => ({
      ...z,
      min: 1,
      max: 3,
      step: 0.1,
      value: 1,
    }));
  }
} else {
  setZoomSupported(false);
  setZoomRange({ min: 1, max: 1, step: 0.1, value: 1 });
}


    if (caps.exposureMode && caps.exposureMode.includes('continuous')) {
      advanced.push({ exposureMode: 'continuous' });
    }

    // Torch (state) se mantiene, pero no hay UI; no afecta Android
    setTorchSupported(!!caps.torch);

    if (advanced.length) {
      try {
        await track.applyConstraints({ advanced });
      } catch {}
    }

    // Tap-to-focus si hay pointsOfInterest
    if (caps.pointsOfInterest) {
      video.onclick = async (ev) => {
        const r = video.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width;
        const y = (ev.clientY - r.top) / r.height;
        try {
          await track.applyConstraints({
            advanced: [{ pointsOfInterest: [{ x, y }], focusMode: 'single-shot' }]
          });
        } catch {}
      };
    }
  }

  // Si falla muchas veces seguidas, sube un poco el zoom (solo iOS)
  async function onDecodeFailure(/* error */) {
    failCountRef.current++;
    if (!IS_IOS) return; // 👈 solo iOS
    if (!longRange) return;
    if (!camTrack?.applyConstraints) return;
    if (failCountRef.current % 20 !== 0) return;

    try {
      const caps = camTrack.getCapabilities?.() || {};
      if (!caps.zoom) return;
      const next = Math.min(
        (zoomRange.value || 1) + (caps.zoom.step ?? 0.2),
        caps.zoom.max ?? (zoomRange.value || 3)
      );
      await camTrack.applyConstraints({ advanced: [{ zoom: next }] });
      setZoomRange((z) => ({ ...z, value: next }));
    } catch {}
  }

  async function onCode(text) {
    failCountRef.current = 0; // 👍 reset contador
    if (Date.now() < readyAt) return;

    const now = Date.now();
    if (inFlightRef.current) return;
    if (
      lastScanRef.current.code === text &&
      now - lastScanRef.current.t < 1500
    )
      return;

    inFlightRef.current = true;
    lastScanRef.current = { code: text, t: now };

    try {
      await html5QrCode?.pause?.(true);
    } catch {}

    try {
      const json = await apiBuscar({
        one: 1,
        ...( /^\d+$/.test(text) ? { barcode: text } : { referencia: text } )
      });

      if (!json || json.ok === false) {
        showAlert(mapApiProblem(json || {}), 'error');
        inFlightRef.current = false;
        try {
          await html5QrCode?.resume?.();
        } catch {}
        return;
      }

      const rows = Array.isArray(json.data) ? json.data : [];
      if (!rows.length) {
        showAlert('Código de barra no encontrado', 'warn');
        inFlightRef.current = false;
        try {
          await html5QrCode?.resume?.();
        } catch {}
        return;
      }

      try {
        await html5QrCode?.stop();
      } catch {}
      try {
        await html5QrCode?.clear();
      } catch {}

      const row = rows[0];
      const scannedIsBarcode = /^\d+$/.test(text);

      if (scannedIsBarcode && row.CodigoBarra) {
        nav(`/detalle?barcode=${encodeURIComponent(row.CodigoBarra)}`);
      } else if (row.Referencia) {
        nav(`/detalle?referencia=${encodeURIComponent(row.Referencia)}`);
      } else {
        nav(`/detalle?referencia=${encodeURIComponent(text)}`);
      }
    } catch (e) {
      console.error('apiBuscar error:', e);
      showAlert('Fallo en la consulta al servidor', 'error');
      inFlightRef.current = false;
      try {
        await html5QrCode?.resume?.();
      } catch {}
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
      const msg = e?.name ? `${e.name}: ${e.message || ''}` : e?.message || 'Error';
      showAlert(`No se pudo iniciar la cámara: ${msg}`, 'error');
    }
  }

  async function handleChangeCamera(e) {
    const id = e.target.value;
    setSelectedId(id);
    try {
      localStorage.setItem(PREF_CAM_KEY, id);
    } catch {}
    if (!started) return;
    try {
      await startCamera(id);
    } catch {
      showAlert('No se pudo cambiar la cámara', 'warn');
    }
  }

  async function handleManualSearch(value) {
    const texto = (value || '').trim();
    if (!texto) return;
    try {
      const json = await apiBuscar({
        one: 1,
        ...( /^\d+$/.test(texto) ? { barcode: texto } : { referencia: texto } )
      });
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
      const scannedIsBarcode = /^\d+$/.test(texto);

      if (scannedIsBarcode && row.CodigoBarra) {
        nav(`/detalle?barcode=${encodeURIComponent(row.CodigoBarra)}`);
      } else if (row.Referencia) {
        nav(`/detalle?referencia=${encodeURIComponent(row.Referencia)}`);
      } else {
        nav(`/detalle?referencia=${encodeURIComponent(texto)}`);
      }
    } catch {
      showAlert('Fallo en la consulta al servidor', 'error');
    }
  }

  return (
    <section
      id="pane-scan"
      className="pane is-visible scan"
      role="region"
      aria-label="Escanear o ingresar código"
    >
      {/* 🔹 BLOQUE ENTRE LOGO (HEADER) Y CÁMARA */}
<div className="tasa-wrapper">
  <div className="tasa-card card">
    <div className="tasa-card__left">
      <span className="tasa-card__icon">$</span>
      <div className="tasa-card__text">
        <span className="tasa-card__label">Tasa del Dólar</span>

        {/* Fecha o mensajes debajo */}
        {!tasaLoading && !tasaError && tasaDetal && (
          <span className="tasa-card__date">
            {(tasaDetal.fecha || '').split(' ')[0]}
          </span>
        )}
        {tasaLoading && (
          <span className="tasa-card__date">Cargando tasa...</span>
        )}
        {!tasaLoading && tasaError && (
          <span className="tasa-card__date tasa-card__date--error">
            {tasaError}
          </span>
        )}
      </div>
    </div>

    <div className="tasa-card__right">
      {/* Valor */}
      {!tasaLoading && !tasaError && tasaDetal && (
        <>
          <span className="tasa-card__trend"></span>
          <span className="tasa-card__value">
            {Number(tasaDetal.valor).toFixed(2)}
          </span>
        </>
      )}
      {tasaLoading && <span className="tasa-card__value">···</span>}
      {!tasaLoading && tasaError && (
        <span className="tasa-card__value">—</span>
      )}
    </div>
  </div>
</div>


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
            <div
              id="reader"
              ref={readerRef}
              className="viewer__reader"
              hidden
              aria-hidden="true"
            ></div>
            <div className="viewer__overlay" aria-hidden="true" />
          </div>

          <div className="controls viewer__controls">
            <label className="visualmente-hidden" htmlFor="cameraSelect">Cámara</label>
            <select id="cameraSelect" ref={selectRef} onChange={handleChangeCamera} title="Cámara" />

            {/* 🔍 Zoom SOLO en iOS */}
            {IS_IOS && zoomSupported && (
              <input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoomRange.value}
                onChange={async (e) => {
                  const v = parseFloat(e.target.value);
                  setZoomRange(z => ({ ...z, value: v }));
                  try { await camTrack?.applyConstraints({ advanced: [{ zoom: v }] }); } catch {}
                }}
                style={{ width: 140, marginLeft: 8 }}
                aria-label="Zoom"
                title="Zoom"
              />
            )}
          </div>
        </div>

        {/* PANEL */}
        <aside className="scan__panel card">
          <Alert msg={alert} kind={alertKind} onHide={hideAlert} />

          <button
            id="btn-start"
            className="btn-primary btn-block"
            onClick={handleStart}
            aria-pressed={started}
            style={{ fontSize: '100%' }}
          >
            {started
              ? 'Haz clic aquí'
              : 'Haz clic aquí'}
          </button>

          <div className="input-group" style={{ marginTop: 12 }}>
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
              onKeyDown={(e) =>
                e.key === 'Enter' && handleManualSearch(e.currentTarget.value)
              }
            />
            <button
              id="btn-manual"
              className="btn"
              type="button"
              onClick={() =>
                handleManualSearch(
                  document.getElementById('manual-text').value
                )
              }
            >
              Buscar
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
