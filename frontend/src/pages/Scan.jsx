import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiBuscar } from '../lib/api';

function Alert({msg, kind='error', onHide}) {
  if (!msg) return null;
  return (
    <div className={`alert ${kind==='ok'?'alert--ok':'alert--error'}`} role="alert">
      {msg}
      <div style={{marginTop:6}}>
        <button className="btn-ghost" onClick={onHide}>Cerrar</button>
      </div>
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
  const [alert, setAlert] = useState('');

  const hasAutoStart = params.get('autostart') === '1';

  useEffect(() => {
    (async () => {
      try {
        const devices = await window.Html5Qrcode.getCameras();
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
      }
    })();
  }, []);

  useEffect(() => {
    if (!hasAutoStart) return;
    params.delete('autostart');
    setParams(params, { replace:true });
    handleStart().catch(()=>{});
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
    reader.setAttribute('aria-hidden','false');
  }

  async function startCamera(deviceId) {
    placeReaderInHero();
    let h = html5QrCode;
    if (!h) {
      h = new window.Html5Qrcode('reader');
      setHtml5QrCode(h);
    } else if (h.isScanning) {
      await h.stop();
    }

    // 🔧 IMPORTANTE: para html5-qrcode usa cameraId (string) o { facingMode: "environment" }
    const cameraSelector = deviceId && typeof deviceId === 'string'
      ? deviceId
      : { facingMode: "environment" };

    await h.start(
      cameraSelector,
      {
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
      },
      onCode,
      _err => {}
    );
    setStarted(true);
  }

  async function onCode(text) {
    try {
      const json = await apiBuscar({ one:1, ...( /^\d+$/.test(text) ? {barcode:text} : {referencia:text} ) });
      const rows = (json && json.ok && Array.isArray(json.data)) ? json.data : [];
      if (!rows.length) {
        setAlert('Código no encontrado');
        return;
      }
      const row = rows[0];
      if (row.Referencia) nav(`/detalle?referencia=${encodeURIComponent(row.Referencia)}`);
      else if (row.CodigoBarra) nav(`/detalle?barcode=${encodeURIComponent(row.CodigoBarra)}`);
      else nav(`/detalle?referencia=${encodeURIComponent(text)}`);
    } catch {
      setAlert('Error consultando el servidor');
    }
  }

  async function handleStart() {
    const sel = selectRef.current;
    try {
      await startCamera(sel?.value);
    } catch (e) {
      console.error('startCamera error:', e);
      setAlert(`No se pudo iniciar la cámara: ${e.name||'Error'}`);
    }
  }

  async function handleChangeCamera(e) {
    if (!started) return;
    try { await startCamera(e.target.value); }
    catch { setAlert('No se pudo cambiar la cámara'); }
  }

  async function handleManualSearch(value) {
    const texto = (value||'').trim();
    if (!texto) return;
    try {
      const json = await apiBuscar({ one:1, ...( /^\d+$/.test(texto) ? {barcode:texto} : {referencia:texto} ) });
      const rows = json?.data || [];
      if (!rows.length) return setAlert('No se encontró la referencia/código.');
      const row = rows[0];
      if (row.Referencia) nav(`/detalle?referencia=${encodeURIComponent(row.Referencia)}`);
      else if (row.CodigoBarra) nav(`/detalle?barcode=${encodeURIComponent(row.CodigoBarra)}`);
    } catch { setAlert('Error consultando el servidor'); }
  }

  return (
    <>
      {alert && <Alert msg={alert} onHide={()=>setAlert('')} />}
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
              <button id="btn-start" className="btn-primary" onClick={handleStart}>Iniciar escaneo</button>

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
