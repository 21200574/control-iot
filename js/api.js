import { CONFIG } from './config.js?v=13';

// La sesión vive solo en memoria (nunca en localStorage). Se envía como «Authorization: Bearer».
let token = '';
let alExpirar = () => {};
export const setToken = t => { token = String(t || '').trim(); };
export const hayToken = () => Boolean(token);
export const onSesionExpirada = fn => { alExpirar = fn; };

export class ApiError extends Error {
  constructor(message, status, detail = '') { super(message); this.status = status; this.detail = detail; }
}

// FastAPI devuelve «detail» como texto, o como lista cuando falla la validación (422).
function detalleDe(datos) {
  const d = datos?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d.length) {
    const campo = Array.isArray(d[0]?.loc) ? d[0].loc.filter(x => x !== 'body').join('.') : '';
    return `${campo ? campo + ': ' : ''}${d[0]?.msg ?? 'dato no válido'}`;
  }
  return '';
}

const amigable = (status, detalle) => ({
  400: detalle || 'Solicitud no válida',
  401: detalle || 'Sesión no válida o expirada',
  403: detalle || 'No tienes permiso para esta operación',
  404: detalle || 'No encontrado',
  409: detalle || 'Operación en conflicto',
  422: detalle || 'Datos no válidos',
  429: detalle || 'Demasiados intentos; espera unos minutos',
  503: 'Servicio no disponible',
}[status] || `Error HTTP ${status}`);

// anon: no envía ni revalida la sesión (login). auth: exige tener sesión.
async function request(path, { method = 'GET', body, auth = false, anon = false, timeout = CONFIG.TIMEOUT_MS } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!anon) {
    if (auth && !token) throw new ApiError('Inicia sesión para continuar', 401);
    if (token) headers.Authorization = 'Bearer ' + token;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(CONFIG.API_BASE + path, {
      method, headers, signal: ctrl.signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let datos = null;
    try { datos = await res.json(); } catch { /* respuesta sin JSON */ }
    if (!res.ok) {
      const detalle = detalleDe(datos);
      if (res.status === 401 && !anon && token) alExpirar();
      throw new ApiError(amigable(res.status, detalle), res.status, detalle);
    }
    return datos;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e.name === 'AbortError' ? 'Tiempo de espera agotado' : 'Error de red', 0);
  } finally {
    clearTimeout(timer);
  }
}

// Acceso genérico para la pestaña ADMINISTRACIÓN.
export const http = {
  get: (path, timeout = 15000) => request(path, { timeout }),
  post: (path, body) => request(path, { method: 'POST', auth: true, body, timeout: 15000 }),
  put: (path, body) => request(path, { method: 'PUT', auth: true, body, timeout: 15000 }),
  del: path => request(path, { method: 'DELETE', auth: true, timeout: 15000 }),
};

// Sesión
export const login = (correo, password) =>
  request('/auth/login', { method: 'POST', anon: true, body: { correo, password } });
export const logout = () => request('/auth/logout', { method: 'POST', auth: true });
export const yo = () => request('/auth/yo', { auth: true });
export const misVehiculos = () => request('/mis-vehiculos', { auth: true });

// Control y monitoreo (prácticas 4.1 y 4.2)
export const ping = (path, timeout = 5000) => request(path, { timeout, anon: true });
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
