import { CONFIG } from './config.js?v=10';
import * as api from './api.js?v=10';
import { parseMarca } from './format.js?v=10';
import * as vista from './monitor-ui.js?v=10';

const MAX_FILAS = 10;
const ESPERA_MS = 150;   // agrupa ráfagas de eventos en una sola consulta

// REST para la carga inicial y la recuperación; WebSocket solo dispara las actualizaciones (sin polling).
export function createMonitor(ui = vista) {
  let ultimo = null, nombre = '', cargado = false;
  let ver = 0;                         // sube con cada evento WSS aplicado al último movimiento
  let ultimaMarcaWS = 0, ultimaHuella = '';
  let enVuelo = false, repetir = null, pend = null, temporizador = null;
  let visible = false, wsEnLinea = false;

  const mostrar = u => { ultimo = u; ui.renderUltimo(u, nombre); };

  function aplicarEstado(filas) {
    const e = Array.isArray(filas) ? filas[0] : null;
    if (e?.vehiculo) nombre = String(e.vehiculo);
    if (!e || e.id_comando == null || !e.comando) return mostrar(null);
    mostrar({ comando: e.comando, codigo: e.codigo, marca: parseMarca(e.fecha_actualizacion, CONFIG.DB_FECHAS_EN_UTC), fuente: 'consulta REST (estado en RDS)' });
  }

  function aplicarHistorial(filas) {
    const lista = (Array.isArray(filas) ? filas : [])
      .filter(f => f && Number.isInteger(f.id_historial) && f.id_vehiculo === CONFIG.VEHICLE_ID)
      .sort((a, b) => b.id_historial - a.id_historial)
      .slice(0, MAX_FILAS)
      .map(f => ({ id: f.id_historial, comando: f.comando ?? '(comando eliminado)', marca: parseMarca(f.fecha_hora, CONFIG.DB_FECHAS_EN_UTC) }));
    ui.renderTabla(lista);
  }

  async function sync({ estado = true } = {}) {
    if (enVuelo) { repetir = { estado: Boolean(repetir?.estado || estado) }; return; }
    enVuelo = true;
    const v0 = ver;
    let fallo = false;
    ui.setSync('cargando');
    try {
      const [rEstado, rHistorial] = await Promise.all([
        estado ? api.getEstado(CONFIG.VEHICLE_ID) : null,
        api.getHistorial(CONFIG.VEHICLE_ID),
      ]);
      if (estado && ver === v0) aplicarEstado(rEstado);     // si llegó un evento mientras tanto, no se pisa
      aplicarHistorial(rHistorial);
      cargado = true;
      ui.setSync('ok');
      if (ver !== v0) repetir = { estado: Boolean(repetir?.estado) };   // el evento llegó durante la consulta
    } catch (e) {
      fallo = true;
      ui.setSync('error', e.message);
      if (!cargado) ui.mensajeTabla('No se pudo cargar el historial');
    } finally {
      enVuelo = false;
      const r = repetir;
      repetir = null;
      if (r && !fallo) sync(r);
    }
  }

  function pedir(opts) {
    pend = { estado: Boolean(pend?.estado || opts.estado) };
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      const o = pend; pend = null;
      if (visible) sync(o);          // oculto: se sincroniza al abrir MONITOREO
    }, ESPERA_MS);
  }

  function onEvent(m) {
    if (!m || m.id_vehiculo !== CONFIG.VEHICLE_ID) return;                  // otro vehículo
    if (m.tipo !== 'movimiento_manual' && m.tipo !== 'demo_movimiento') return;
    const marca = parseMarca(m.fecha_hora);                                 // los eventos WSS traen zona (UTC)
    const huella = `${m.tipo}|${m.fecha_hora}|${m.id_comando}`;
    if (huella === ultimaHuella) return;                                    // duplicado
    if (marca !== null && marca < ultimaMarcaWS) return;                    // llegó fuera de orden
    ultimaHuella = huella;
    if (marca !== null) ultimaMarcaWS = marca;
    ver++;

    if (m.tipo === 'demo_movimiento') {
      // Paso interno de una DEMO: actualiza el último estado, pero no se guarda en el historial individual.
      return mostrar({ comando: m.comando, codigo: m.codigo, marca, fuente: `evento WebSocket · paso ${Number(m.orden)} de una DEMO (no entra al historial)` });
    }
    const e = Array.isArray(m.estado) ? m.estado[0] : null;
    if (e?.comando) mostrar({ comando: e.comando, codigo: e.codigo, marca, fuente: 'evento WebSocket' });
    pedir({ estado: !e?.comando });                                        // el historial confirmado viene de la API
  }

  function onWsState(estado) {
    const antes = wsEnLinea;
    wsEnLinea = estado === 'en_linea';
    ui.setVigencia(wsEnLinea);
    if (wsEnLinea && !antes) sync({ estado: true });                        // tras (re)conectar se recupera lo perdido
  }

  return {
    activar() { visible = true; ui.setVigencia(wsEnLinea); sync({ estado: true }); },
    desactivar() { visible = false; },
    setVehiculo(n) { nombre = String(n); if (cargado) ui.renderUltimo(ultimo, nombre); },
    onEvent,
    onWsState,
  };
}
