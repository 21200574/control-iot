import { CONFIG } from './config.js';

let token = '';
export const setToken = t => { token = String(t).trim(); };

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const amigable = (status, datos) => ({
  400: 'Solicitud no válida',
  403: 'Token inválido',
  404: 'No encontrado',
  409: typeof datos?.detail === 'string' ? datos.detail : 'Operación en conflicto',
  503: 'Servicio no disponible',
}[status] || `Error HTTP ${status}`);

async function request(path, { method = 'GET', body, auth = false, timeout = CONFIG.TIMEOUT_MS } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth) {
    if (!token) throw new ApiError('Falta el token de acceso', 401);
    headers['X-Admin-Token'] = token;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(CONFIG.API_BASE + path, {
      method, headers, signal: ctrl.signal,
      body: body ? JSON.stringify(body) : undefined,
    });
    let datos = null;
    try { datos = await res.json(); } catch { /* respuesta sin JSON */ }
    if (!res.ok) throw new ApiError(amigable(res.status, datos), res.status);
    return datos;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e.name === 'AbortError' ? 'Tiempo de espera agotado' : 'Error de red', 0);
  } finally {
    clearTimeout(timer);
  }
}

export const ping = (path, timeout = 5000) => request(path, { timeout });
export const getVehiculo = id => request(`/vehiculos/${id}`);
export const getComandos = id => request(`/vehiculos/${id}/comandos`);
export const getEstado = id => request(`/vehiculos/${id}/estado`);
export const getHistorial = id => request(`/vehiculos/${id}/historial`);
export const getDemos = id => request(`/vehiculos/${id}/demos`);
export const getMovimientosDemo = id => request(`/demos/${id}/movimientos`);
export const postMovimiento = (idVehiculo, idComando) =>
  request('/movimiento', { method: 'POST', auth: true, body: { id_vehiculo: idVehiculo, id_comando: idComando } });
export const postIniciarDemo = idDemo => request(`/demos/${idDemo}/ejecutar`, { method: 'POST', auth: true });
export const postCancelarDemo = idVehiculo => request(`/vehiculos/${idVehiculo}/demos/cancelar`, { method: 'POST', auth: true });
