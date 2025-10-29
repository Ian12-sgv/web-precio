import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiBuscar } from '../lib/api';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

function Alert({ msg, kind = 'error', onHide }) {
  if (!msg) return null;
  const icon =
    kind === 'ok' ? '✅' :
    kind === 'warn' ? '⚠️' :
    '❌';

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
        gap: 10,
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
  const [starting, setStarting] = useState(false);

  const [alertMsg, setAlertMsg] = useState('');
  const [alertKind, setAlertKind] = useState('error');

  const hasAutoStart = params.get('autostart') === '1';

  // ---- Helpers de alertas ----
  const showAlert = (msg, kind = 'error') => { setAlertMsg(msg); setAlertKind(kind); };
  const hideAlert = () => setAlertMsg('');

  // Mapear errores de la API a mensajes de negocio
  function mapApiProblem(json) {
    // Señales típicas de error de DB que podrías devolver en tu backend
    const dbDown =
      json?.db === 'down' ||
      /db|database|sql|sqlserver|mssql/i.test(json?.error || json?.message || '');

    if (dbDown) return 'Fallo al consultar la base de datos';
    return 'Fallo en la consulta al servidor';
  }

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

  useEffect(() => {
    if (!hasAutoStart) return;
    params.delete('autostart');
    setParams(params, { replace: true });
    handleStart().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const container = document.getElementById('reader');
    if (!container) throw new Error('Contenedor #reader no encontrado');

    let h = html5QrCode;
    if (!h) {
      h = new Html5Qrcode(container);
      setHtml5QrCode(h);
    } else {
      try { if (h.isScanning) await h.stop(); } catch {}
      try { await h.clear(); } catch {}
    }

    const cameraSelector =
      (typeof deviceId === 'string' && deviceId)
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
      () => {} // onScanFailure ignorado para no saturar
    );
    setStarted(true);
  }

  async function onCode(text) {
    try {
      const payload = /^\d+$/.test(text) ? { barcode: text } : { referencia: text };
      const json = await apiBuscar({ one: 1, ...payload });

      if (!json || json.ok === false) {
        // back devolvió error (o no devolvió nada)
        showAlert(mapApiProblem(json || {}), 'error');
        return;
      }

      const rows = Array.isArray(json.data) ? json.data : [];
      if (!rows.length) {
        showAlert('Código de barra no encontrado', 'warn');
        return;
      }

      const row = rows[0];
      if (row.Referencia) nav(`/detalle?referencia=${encodeURIComponent(row.Referencia)}`);
      else if (row.CodigoBarra) nav(`/detalle?barcode=${encodeURIComponent(row.CodigoBarra)}`);
      else nav(`/detalle?referencia=${encodeURIComponent(text)}`);
    } catch (e) {
      console.error('apiBuscar error:', e);
      showAlert('Fallo en la consulta al servidor', 'error');
    }
  }

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    hideAlert();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador requiere HTTPS/permiso para la cámara');
      }
      const sel = selectRef.current;
      await startCamera(sel?.value);
    } catch (e) {
      console.error('startCamera error:', e);
      showAlert(`No se pudo iniciar la cámara: ${e.name || e.message || 'Error'}`, 'error');
    } finally {
      setStarting(false);
    }
  }

  async function handleChangeCamera(e) {
    if (!started) return;
    try { await startCamera(e.target.value); }
    catch { showAlert('No se pudo cambiar la cámara', 'warn'); }
  }

  async function handleManualSearch(value) {
    const texto = (value || '').trim();
    if (!texto) return;
    try {
      const payload = /^\d+$/.test(texto) ? { barcode: texto } : { referencia: texto };
      const json = await apiBuscar({ one: 1, ...payload });

      if (!json || json.ok === false) {
        showAlert(mapApiProblem(json || {}), 'error');
        return;
      }

      const rows = Array.isArray(json.data) ? json.data : [];
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
      <Alert msg={alertMsg} kind={alertKind} onHide={hideAlert} />

      <section id="pane-scan" className="pane is-visible" role="region" aria-label="Escanear o ingresar código">
        <div className="hero card">
          <div className="hero__body">
            <h2 className="hero__title">Apunta al código</h2>

            <img
              ref={imgRef}
              className="scan-illustration"
              src="/svg/barcode.jpeg"
              alt="Ilustración: escanea el código de barras"
            />

            <div className="controls" style={{ marginTop: 8 }}>
              <label className="visualmente-oculto" htmlFor="cameraSelect">Cámara</label>
              <select id="cameraSelect" ref={selectRef} onChange={handleChangeCamera} title="Cámara" />
              <button id="btn-torch" disabled>Linterna</button>
            </div>

            <div className="hero__actions" style={{ gap: 10, flexDirection: 'column', alignItems: 'flex-start' }}>
              <button id="btn-start" className="btn-primary" onClick={handleStart} disabled={starting}>
                {starting ? 'Iniciando…' : 'Iniciar escaneo'}
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

        <div id="reader" ref={readerRef} className="card reader" hidden aria-hidden="true"></div>
      </section>
    </>
  );
}
