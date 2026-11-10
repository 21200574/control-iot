import { CONFIG } from './config.js?v=10';

// El navegador no puede enviar encabezados en un WebSocket: el token se ofrece como
// subprotocolo («auth.<base64url>»). El backend debe aceptarlo (cambio pendiente de autorizar).
const b64url = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function createSocket({ onState, onEvent }) {
  let ws = null, intentos = 0, timer = null, token = '', detenido = false;

  function programar() {
    intentos++;
    timer = setTimeout(conectar, Math.min(1000 * 2 ** intentos, 15000));
  }

  function conectar() {
    clearTimeout(timer);
    if (!token) return onState('desconectado');
    onState(intentos ? 'reconectando' : 'conectando');
    try {
      ws = new WebSocket(`${CONFIG.WS_BASE}/ws/vehiculos/${CONFIG.VEHICLE_ID}`, ['iot.v1', 'auth.' + b64url(token)]);
    } catch { return programar(); }
    ws.onopen = () => { intentos = 0; onState('en_linea'); };
    ws.onmessage = e => {
      try { const m = JSON.parse(e.data); if (m && typeof m.tipo === 'string') onEvent(m); } catch { /* mensaje no válido */ }
    };
    ws.onclose = () => {
      ws = null;
      if (detenido) return onState('desconectado');
      onState('reconectando');
      programar();
    };
  }

  return {
    start(t) { token = t; detenido = false; intentos = 0; ws ? ws.close() : conectar(); },
    stop() { detenido = true; clearTimeout(timer); ws?.close(); onState('desconectado'); },
  };
}
