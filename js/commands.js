import * as api from './api.js?v=10';
import { CONFIG, NOMBRES } from './config.js?v=10';

const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ').trim().toLowerCase();

// Único punto de envío de comandos: lo usan el joystick y los botones.
export function createCommands({ onStatus, onAccepted = () => {}, onDemoState = () => {} }) {
  const idPorClave = {}, clavePorId = {};
  let enVuelo = false, pendiente = null, ultimo = null, actual = null, gen = 0, demoActiva = false;

  function loadCatalog(lista) {
    const activos = Array.isArray(lista) ? lista.filter(c => c.activo) : [];
    const faltan = [];
    for (const [clave, alias] of Object.entries(NOMBRES)) {
      const c = activos.find(x => alias.includes(norm(x.nombre)));
      if (c) { idPorClave[clave] = c.id_comando; clavePorId[c.id_comando] = clave; }
      else faltan.push(clave);
    }
    return faltan;
  }

  function send(clave, dedupe = false) {
    if (clave === 'detener') return stop(true);
    if (!(clave in idPorClave)) return onStatus('error', clave, Object.keys(idPorClave).length ? 'No existe en el catálogo' : 'El catálogo aún no se cargó');
    if (dedupe && clave === ultimo) return;       // solo los joysticks evitan repetir el mismo comando
    if (demoActiva) return onStatus('error', clave, 'Hay una DEMO en ejecución');
    ultimo = clave; pendiente = clave; drain();
  }

  // DETENER tiene prioridad: reemplaza cualquier comando pendiente.
  // force=false (soltar el joystick) omite la repetición si ya está detenido.
  function stop(force = false) {
    if (!('detener' in idPorClave)) return detenerSinComando(force);
    if (!force && (ultimo === null || ultimo === 'detener')) return;
    gen++; ultimo = 'detener'; pendiente = 'detener'; drain();
  }

  // El catálogo aún no tiene DETENER: se frena lo pendiente y, con el botón, se cancela la DEMO.
  async function detenerSinComando(force) {
    if (!Object.keys(idPorClave).length) return;   // sin catálogo ya se avisó el error
    gen++; pendiente = null; ultimo = null;
    if (!force) return onStatus('info', 'detener', 'Joystick liberado. El catálogo no tiene DETENER: no se envía comando de parada.');
    try { await cancelar(); onStatus('info', 'detener', 'Cancelación de DEMO enviada. El catálogo no tiene un comando DETENER.'); }
    catch (e) { onStatus('error', 'detener', e.message); }
  }

  async function cancelar() {
    try { await api.postCancelarDemo(CONFIG.VEHICLE_ID); }
    catch (e) { if (e.status !== 404) throw e; }        // 404: no había DEMO activa
    demoActiva = false;
    onDemoState(false);
  }

  async function enviar(clave) {
    const id = idPorClave[clave];
    if (clave === 'detener' && demoActiva) await cancelar();
    try { return await api.postMovimiento(CONFIG.VEHICLE_ID, id); }
    catch (e) {
      if (clave === 'detener' && e.status === 409) {    // DEMO activa: cancelar y reintentar
        await cancelar();
        return api.postMovimiento(CONFIG.VEHICLE_ID, id);
      }
      throw e;
    }
  }

  // Una sola solicitud en vuelo; las respuestas tardías de comandos anteriores se ignoran.
  async function drain() {
    if (enVuelo) return;
    enVuelo = true;
    try {
      while (pendiente) {
        const clave = pendiente; pendiente = null;
        actual = clave;                                 // última acción pedida
        const g = gen;
        onStatus('solicitado', clave);
        try {
          await enviar(clave);
          onAccepted(clave);
          if (g === gen) onStatus('aceptado', clave);
        } catch (e) {
          if (e.status === 409 && clave !== 'detener') { demoActiva = true; onDemoState(true); }
          if (g === gen) onStatus('error', clave, e.message);
        }
      }
    } finally { enVuelo = false; }
  }

  function onEvent(m) {
    if (m.id_vehiculo !== CONFIG.VEHICLE_ID) return;
    if (m.tipo === 'demo_inicio') { demoActiva = true; onDemoState(true, m.id_demo); }
    if (['demo_fin', 'demo_cancelada', 'demo_error'].includes(m.tipo)) { demoActiva = false; onDemoState(false); }
    if (m.tipo === 'movimiento_manual') {
      const k = clavePorId[m.id_comando];
      if (k && k === actual) onStatus('evento', k);   // eventos de acciones anteriores no pisan la última
    }
  }

  return { loadCatalog, send, stop, cancelar, onEvent, setDemo: (v, id) => { demoActiva = v; onDemoState(v, id); } };
}
