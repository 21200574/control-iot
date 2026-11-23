import { CONFIG } from './config.js?v=13';

// El navegador no puede enviar encabezados en un WebSocket: el token de sesión se ofrece como
// subprotocolo («auth.<base64url>»). El backend lo valida y comprueba el acceso a la unidad.
const b64url = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function createSocket({ onState, onEvent, onFalla = () => {} }) {
  let ws = null, intentos = 0, timer = null, token = '', detenido = true, abrio = false, fallas = 0, gen = 0;

  function descartar() {
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = null;
    try { ws.close(); } catch { /* ya cerrado */ }
    ws = null;
  }

  function programar() {
    intentos++;
    timer = setTimeout(conectar, Math.min(1000 * 2 ** intentos, 15000));
  }

  function conectar() {
    clearTimeout(timer);
    if (!token || detenido) return onState('desconectado');
    onState(intentos ? 'reconectando' : 'conectando');
    const mia = ++gen;
    abrio = false;
    try {
      ws = new WebSocket(`${CONFIG.WS_BASE}/ws/vehiculos/${CONFIG.VEHICLE_ID}`, ['iot.v1', 'auth.' + b64url(token)]);
    } catch { return programar(); }
    ws.onopen = () => { if (mia !== gen) return; intentos = 0; fallas = 0; abrio = true; onState('en_linea'); };
    ws.onmessage = e => {
      if (mia !== gen) return;
      try { const m = JSON.parse(e.data); if (m && typeof m.tipo === 'string') onEvent(m); } catch { /* mensaje no válido */ }
    };
    ws.onclose = e => {
      if (mia !== gen) return;
      ws = null;
      if (detenido) return onState('desconectado');
      // El servidor rechaza sin acceso (sesión de invitado terminada, unidad ya no asignada...).
      // Un rechazo antes de abrir llega como cierre 1006: tras 2 fallas se pide revisar el acceso.
      if (!abrio && ++fallas === 2) onFalla();
      if (e.code === 1008) { detenido = true; return onState('desconectado'); }
      onState('reconectando');
      programar();
    };
  }

  return {
    // Conecta (o reconecta de inmediato, p. ej. al cambiar de unidad)
    start(t) { token = t; detenido = false; intentos = 0; fallas = 0; descartar(); conectar(); },
    stop() { detenido = true; clearTimeout(timer); gen++; descartar(); onState('desconectado'); },
  };
}
