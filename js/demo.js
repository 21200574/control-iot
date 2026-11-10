import * as api from './api.js';

// Solo inicia DEMO existentes; la secuencia la ejecuta el servidor. DETENER la cancela.
export function createDemo({ commands, onMsg }) {
  let iniciando = false, temporizador = null;

  // Respaldo: si el WebSocket no avisa el fin de la DEMO, el botón se libera al cumplirse su duración.
  async function programarLiberacion(idDemo) {
    clearTimeout(temporizador);
    try {
      const pasos = await api.getMovimientosDemo(idDemo);
      const total = (Array.isArray(pasos) ? pasos : [])
        .reduce((t, p) => t + Number(p.duracion_ms || 0) + Number(p.pausa_ms || 0), 0);
      if (total > 0) temporizador = setTimeout(() => commands.setDemo(false), total + 2000);
    } catch { /* sin duración conocida: se libera con el evento final o con DETENER */ }
  }

  return {
    async iniciar(idDemo) {
      if (iniciando || !Number.isInteger(idDemo) || idDemo <= 0) return;
      iniciando = true;
      onMsg('Solicitando DEMO…', 'solicitado');
      try {
        const r = await api.postIniciarDemo(idDemo);
        commands.setDemo(true, idDemo);
        onMsg(`DEMO aceptada por la API (${Number(r?.movimientos) || '?'} movimientos)`, 'aceptado');
        programarLiberacion(idDemo);
      } catch (e) { onMsg(e.message, 'error'); }
      finally { iniciando = false; }
    },
  };
}
