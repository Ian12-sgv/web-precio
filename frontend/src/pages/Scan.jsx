import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiBuscar } from '../lib/api';

function Alert({ msg, kind = 'error', onHide }) {
  if (!msg) return null;
  return (
    <div className={`alert ${kind === 'ok' ? 'alert--ok' : 'alert--error'}`} role="alert">
      {msg}
      <div style={{ marginTop: 6 }}>
        <button className="btn-ghost" onClick={onHide}>Cerrar</button>
      </div>
    </div>
  );
}

const LAST_CAMERA_KEY = 'scan.lastCameraId';

export default function Scan() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const readerRef = useRef(null);
  const imgRef    = useRef(null);

  const autostart = params.get('autostart') === '1';
  const ignore    = params.get('ignore') || '';

  const [html5QrCode, setHtml5QrCode] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [started, setStarted] = useState(false);
  const [alert, setAlert] = useState('');

  const [readyAt, setReadyAt] = useState(0);         // ventana de gracia
  const readingLockRef  = useRef(false);             // evita doble navegación
  const startingLockRef = useRef(false);             // evita doble start()

  // Coloca el contenedor del lector en el hero (mismo ancho que la imagen)
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

  // Enumerar cámaras (con pre-permiso) y autostart opcional
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!window.Html5Qrcode) {
          setAlert('No se encontró Html5Qrcode. Asegúrate de incluir la librería html5-qrcode.');
          return;
        }

        // "Preflight" para permisos: pide acceso y suelta de inmediato
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          s.getTracks().forEach(t => t.stop());
        } catch {
          // si el usuario cancela, getCameras puede fallar
        }

        const cams = await window.Html5Qrcode.getCameras();
        if (!alive) return;

        setDevices(cams || []);
        if (!cams?.length) {
          setAlert('No hay cámaras disponibles en este dispositivo.');
          return;
        }

        // Elegir: última usada -> trasera -> primera
        const saved = localStorage.getItem(LAST_CAMERA_KEY);
        const back  = cams.find(d => /back|rear|environment|trás/i.test(d.label || ''));
        const chosen = cams.find(d => d.id === saved)?.id || back?.id || cams[0].id;
        setSelectedId(chosen);

        // Autostart seguro (evita re-lectura inmediata)
        if (autostart) {
          setReadyAt(Date.now() + 1200); // 1.2s de gracia
          params.delete('autostart');
          setParams(params, { replace: true });
          await handleStart(chosen);
        }
      } catch (e) {
        if (!alive) return;
        setAlert('No se pudo enumerar las cámaras. Cierra otras apps que usen la cámara y vuelve a intentar.');
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Limpieza al salir: detener y liberar cámara
  useEffect(() => {
    return () => {
      (async () => {
        try {
          if (html5QrCode?.isScanning) await html5QrCode.stop();
          if (html5QrCode) await html5QrCode.clear();
        } catch {}
      })();
    };
  }, [html5QrCode]);

  async function handleStart(preferredId) {
    if (startingLockRef.current) return;
    startingLockRef.current = true;

    try {
      placeReaderInHero();

      let h = html5QrCode;
      if (!h) {
        h = new window.Html5Qrcode('reader');
        setHtml5QrCode(h);
      } else if (h.isScanning) {
        await h.stop();
      }

      const target = (preferredId || selectedId)
        ? { deviceId: { exact: preferredId || selectedId } }
        : { facingMode: { exact: 'environment' } };

      const config = {
        fps: 15,
        qrbox: 280,
        formatsToSupport: [
          window.Html5QrcodeSupportedFormats.QR_CODE,
          window.Html5QrcodeSupportedFormats.CODE_128,
          window.Html5QrcodeSupportedFormats.EAN_13,
          window.Html5QrcodeSupportedFormats.EAN_8,
          window.Html5QrcodeSupportedFormats.UPC_A,
          window.Html5QrcodeSupportedFormats.CODE_39,
          window.Html5QrcodeSupportedFormats.ITF
        ]
      };

      await h.start(target, config, onCode, () => {});
      localStorage.setItem(LAST_CAMERA_KEY, preferredId || selectedId || '');
      setStarted(true);
      setAlert('');
    } catch (e) {
      setStarted(false);
      setAlert('No se pudo abrir la cámara. Verifica permisos y que no esté en uso.');
    } finally {
      startingLockRef.current = false;
    }
  }

  async function handleChangeCamera(e) {
    const id = e.target.value;
    setSelectedId(id);
    if (started) {
      await handleStart(id);
    }
  }

  async function onCode(text) {
    // ventana de gracia + ignora el último código para evitar rebote a Detalle
    if (Date.now() < readyAt) return;
    if (ignore && text === ignore) return;
    if (readingLockRef.current) return;
    readingLockRef.current = true;

    try {
      const payload = /^\d+$/.test(text) ? { one: 1, barcode: text } : { one: 1, referencia: text };
      const json = await apiBuscar(payload);
      const rows = (json && json.ok && Array.isArray(json.data)) ? json.data : [];
      if (!rows.length) {
        setAlert('Código no encontrado');
        readingLockRef.current = false;
        return;
      }

      // Detener escáner antes de navegar
      try { await html5QrCode?.stop(); } catch {}

      const row = rows[0];
      if (row.Referencia) nav(`/detalle?referencia=${encodeURIComponent(row.Referencia)}`);
      else if (row.CodigoBarra) nav(`/detalle?barcode=${encodeURIComponent(row.CodigoBarra)}`);
      else nav(`/detalle?referencia=${encodeURIComponent(text)}`);
    } catch {
      setAlert('Error consultando el servidor');
      readingLockRef.current = false;
    }
  }

  return (
    <>
      {alert && <Alert msg={alert} onHide={() => setAlert('')} />}

      <section id="pane-scan" className="pane is-visible" role="region" aria-label="Escanear o ingresar código">
        <div className="hero card">
          <div className="hero__body">
            <h2 className="hero__title">Apunta al código</h2>

            {/* Placeholder: será reemplazado por el lector */}
            <img
              ref={imgRef}
              className="scan-illustration"
              src="/svg/barcode.jpeg"
              alt="Ilustración: escanea el código de barras"
              style={{ width: '100%', maxWidth: 420 }}
            />

            <div className="controls" style={{ marginTop: 8 }}>
              <label className="visualmente-oculto" htmlFor="cameraSelect">Cámara</label>
              <select
                id="cameraSelect"
                title="Cámara"
                value={selectedId}
                onChange={handleChangeCamera}
              >
                {devices.length === 0 && <option value="">(No hay cámaras)</option>}
                {devices.map(d => (
                  <option key={d.id} value={d.id}>{d.label || 'Cámara'}</option>
                ))}
              </select>
              <button id="btn-torch" disabled>Linterna</button>
            </div>

            <div className="hero__actions" style={{ gap: 10, flexDirection: 'column', alignItems: 'flex-start' }}>
              <button id="btn-start" className="btn-primary" onClick={() => handleStart()}>
                {started ? 'Reiniciar escaneo' : 'Iniciar escaneo'}
              </button>

              <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 420 }}>
                <input
                  id="manual-text"
                  className="input-lg"
                  type="search"
                  inputMode="text"
                  enterKeyHint="search"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="Escribe referencia o código y presiona Enter"
                  onKeyDown={(e) => e.key === 'Enter' && onCode(e.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <button
                  id="btn-manual"
                  className="btn-primary"
                  type="button"
                  onClick={() => onCode(document.getElementById('manual-text').value)}
                >
                  Buscar
                </button>
              </div>
            </div>
          </div>
        </div>

        <div id="reader" ref={readerRef} className="card reader" hidden aria-hidden="true" />
      </section>
    </>
  );
}
