import { CONFIG } from './config.js';
import { ping } from './api.js';

export function startHealth({ onApi, onDb }) {
  let ultimo = '';
  async function comprobar() {
    if (ultimo !== 'disponible') onApi('comprobando');
    try { await ping(CONFIG.HEALTH_PATH); ultimo = 'disponible'; }
    catch { ultimo = 'no_disponible'; }
    onApi(ultimo);
    if (ultimo !== 'disponible' || !CONFIG.DB_HEALTH_PATH) return onDb('sin_verificar');
    try { await ping(CONFIG.DB_HEALTH_PATH); onDb('disponible'); } catch { onDb('no_disponible'); }
  }
  comprobar();
  setInterval(comprobar, CONFIG.HEALTH_EVERY_MS);
}
