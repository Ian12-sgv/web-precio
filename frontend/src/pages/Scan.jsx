// src/pages/Scan.jsx (o donde lo uses)
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

export default function Scan() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const readerRef = useRef(null);
  const imgRef = useRef(null);

  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [html5QrCode, setHtml5QrCode] = useState(null);
  const [started, setStarted] = useState(false);
  const [alert, setAlert] = useState('');
  const scanningLockRef = useRef(false); // evita múltiples navegaciones

  const hasAutoStart = params.get('autostart') === '1';

  // Enumerar cámaras al montar
  useEffect(() => {
    (async () => {
      try {
        if (!window.Html5Qrcode) {
          setAlert('No se encontró Html5Qrcode. Asegúrate de incluir la librería html5-qrcode.');
          return;
        }
        const cams = await window.Html5Qrcode.getCameras();
        setDevices(cams || []);
        if (!cams || cams.length === 0) {
          setAlert('No hay cámaras disponibles en este dispositivo.');
          return;
        }
        // Elige trasera si existe
        const back = cams.find(d => /back|trás|rear|environment/i.test(d.label || ''));
        setSelectedId(back ? back.id : cams[0].id);
      } catch (e) {
        setAlert(`No se pudieron listar cámaras: ${e?.message || e}`);
      }
    })();
  }, []);

  // Autostart (si viene ?autostart=1)
  useEffect(() => {
    if (!hasAutoStart) return;
    params.delete('autostart');
    setParams(params, { replace: true });
    handleStart().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAutoStart]);

  // Limpieza al desmontar: detener cámara si queda activa
  useEffect(() => {
    return () => {
      (async () => {
        try {
          if (html5QrCode?.isScanning) {
            await html5QrCode.stop();
          }
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

  async function startCamera(preferredTarget) {
    placeReaderInHero();

    let h = html5QrCode;
    if (!h) {
      h = new window.Html5Qrcode('reader');
      setHtml5QrCode(h);
    } else if (h.isScanning) {
      await h.stop();
    }

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

    // Secuencia de intentos:
    // 1) id directo si lo tenemos
    // 2) facing trasera
    // 3) facing frontal
    const attempts = [];
    if (preferredTarget) attempts.push(preferredTarget); // deviceId string
    attempts.push({ facingMode: 'environment' });
    attempts.push({ facingMode: 'user' });

    let firstError = null;
    for (const target of attempts) {
      try {
        await h.start(target, config, onCode, () => {});
        setStarted(true);
        setAlert('');
        return; // listo
      } catch (e) {
        if (!firstError) firstError = e;
      }
    }
    setStarted(false);
    setAlert(`No se pudo abrir la cámara: ${firstError?.message || firstError || 'error desconocido'}`);
  }

  async function onCode(text) {
    if (scanningLockRef.current) return;
    scanningLockRef.current = true; // evita doble navegación
    try {
      const payload = /^\d+$/.test(text) ? { one: 1, barcode: text } : { one: 1, referencia: text };
      const json = await apiBuscar(payload);
      const rows = (json && json.ok && Array.isArray(json.data)) ? json.data : [];
      if (!rows.length) {
        setAlert('Código no encontrado');
        scanningLockRef.current = false;
        return;
      }
      const row = rows[0];
      if (row.Referencia) nav(`/detalle?referencia=${encodeURIComponent(row.Referencia)}`);
      else if (row.CodigoBarra) nav(`/detalle?barcode=${encodeURIComponent(row.CodigoBarra)}`);
      else nav(`/detalle?referencia=${encodeURIComponent(text)}`);
    } catch {
      setAlert('Error consultando el servidor');
      scanningLockRef.current = false;
    }
  }

  async function handleStart() {
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      setAlert('La cámara requiere HTTPS. Abre el sitio con https://');
      return;
    }
    await startCamera(selectedId || undefined);
  }

  async function handleChangeCamera(e) {
    const id = e.target.value;
    setSelectedId(id);
    if (!started) return;
    try {
      await startCamera(id);
    } catch {
      setAlert('No se pudo cambiar la cámara');
    }
  }

  async function handleManualSearch(value) {
    const texto = (value || '').trim();
    if (!texto) return;
    try {
      const payload = /^\d+$/.test(texto) ? { one: 1, barcode: texto } : { one: 1, referencia: texto };
      const json = await apiBuscar(payload);
      const rows = (json && json.ok && Array.isArray(json.data)) ? json.data : [];
      if (!rows.length) return setAlert('No se encontró la referencia/código.');
      const row = rows[0];
      if (row.Referencia) nav(`/detalle?referencia=${encodeURIComponent(row.Referencia)}`);
      else if (row.CodigoBarra) nav(`/detalle?barcode=${encodeURIComponent(row.CodigoBarra)}`);
    } catch {
      setAlert('Error consultando el servidor');
    }
  }

  return (
    <>
      {alert && <Alert msg={alert} onHide={() => setAlert('')} />}

      <section id="pane-scan" className="pane is-visible" role="region" aria-label="Escanear o ingresar código">
        <div className="hero card">
          <div className="hero__body">
            <h2 className="hero__title">Apunta al código</h2>

            {/* Imagen placeholder: será reemplazada por el contenedor del lector */}
            <img
              ref={imgRef}
              className="scan-illustration"
              src="/svg/barcode.jpeg"
              alt="Ilustración: escanea el código de barras"
              style={{ width: '100%', maxWidth: 420 }}
            />

            <div className="controls" style={{ marginTop: 8 }}>
              <label className="visually-hidden" htmlFor="cameraSelect">Cámara</label>
              <select
                id="cameraSelect"
                title="Cámara"
                value={selectedId}
                onChange={handleChangeCamera}
                ref={undefined}
              >
                {devices.length === 0 && <option value="">(No hay cámaras)</option>}
                {devices.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.label || 'Cámara'}
                  </option>
                ))}
              </select>

              {/* Botón de linterna: habilitar si luego implementas torch via applyConstraints */}
              <button id="btn-torch" disabled>Linterna</button>
            </div>

            <div className="hero__actions" style={{ gap: 10, flexDirection: 'column', alignItems: 'flex-start' }}>
              <button id="btn-start" className="btn-primary" onClick={handleStart}>
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
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSearch(e.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <button
                  id="btn-manual"
                  className="btn-primary"
                  type="button"
                  onClick={() => handleManualSearch(document.getElementById('manual-text').value)}
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
