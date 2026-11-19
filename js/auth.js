import * as api from './api.js?v=11';

// Sesión en memoria: al recargar la página se vuelve a iniciar sesión.
let sesion = null;
let temporizador = null;
const oyentes = new Set();
const avisar = (motivo = '') => oyentes.forEach(f => f(sesion, motivo));

export const onChange = f => { oyentes.add(f); };
export const usuario = () => sesion?.usuario ?? null;
export const rol = () => sesion?.usuario?.rol ?? null;
export const token = () => sesion?.token ?? '';

export const ROLES = { ADMIN: 'Administrador', USUARIO: 'Usuario', INVITADO: 'Invitado' };

function programarExpiracion(iso) {
  clearTimeout(temporizador);
  const ms = Date.parse(iso) - Date.now();
  if (Number.isFinite(ms) && ms > 0) {
    temporizador = setTimeout(() => cerrarLocal('Tu sesión expiró. Inicia sesión de nuevo.'), Math.min(ms, 2 ** 31 - 1));
  }
}

export async function login(correo, password) {
  const r = await api.login(String(correo).trim(), password);
  api.setToken(r.token);
  sesion = { token: r.token, usuario: r.usuario, expira_en: r.expira_en };
  programarExpiracion(r.expira_en);
  avisar('login');
  return sesion.usuario;
}

export function cerrarLocal(motivo = '') {
  if (!sesion) return;
  clearTimeout(temporizador);
  api.setToken('');
  sesion = null;
  avisar(motivo);
}

export async function logout() {
  if (!sesion) return;
  try { await api.logout(); } catch { /* si el servidor no responde, igual se cierra aquí */ }
  cerrarLocal('Sesión cerrada');
}

// Cualquier 401 de la API cierra la sesión local.
api.onSesionExpirada(() => cerrarLocal('Tu sesión expiró. Inicia sesión de nuevo.'));
