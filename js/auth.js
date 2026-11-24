import * as api from './api.js?v=14';

// Sesión en memoria: al recargar la página se vuelve a iniciar sesión.
let sesion = null;
let temporizador = null;
const oyentes = new Set();
const avisar = (motivo = '') => oyentes.forEach(f => f(sesion, motivo));

export const onChange = f => { oyentes.add(f); };
export const usuario = () => sesion?.usuario ?? null;
export const rol = () => sesion?.usuario?.rol ?? null;
export const token = () => sesion?.token ?? '';

export const ROL_LOGIN = { ADMIN: 'Administrador', USUARIO: 'Cliente', INVITADO: 'Invitado' };
export const ROLES = { ADMIN: 'Administrador', USUARIO: 'Usuario', INVITADO: 'Invitado' };

function programarExpiracion(iso) {
  clearTimeout(temporizador);
  const ms = Date.parse(iso) - Date.now();
  if (Number.isFinite(ms) && ms > 0) {
    temporizador = setTimeout(() => cerrarLocal('Tu sesión expiró. Inicia sesión de nuevo.'), Math.min(ms, 2 ** 31 - 1));
  }
}

// rolEsperado (opcional): el tipo de cuenta que la persona eligió en la pantalla de acceso.
export async function login(correo, password, rolEsperado) {
  const r = await api.login(String(correo).trim(), password);
  api.setToken(r.token);
  if (rolEsperado && r.usuario.rol !== rolEsperado) {
    try { await api.logout(); } catch { /* el token caduca solo */ }
    api.setToken('');
    throw new Error(`Esa cuenta es de ${ROL_LOGIN[r.usuario.rol] ?? r.usuario.rol}, no de ${ROL_LOGIN[rolEsperado] ?? rolEsperado}. Elige el tipo de cuenta correcto.`);
  }
  sesion = { token: r.token, usuario: r.usuario, expira_en: r.expira_en };
  programarExpiracion(r.expira_en);
  avisar('login');
  return sesion.usuario;
}

// Invitado sin cuenta: el servidor crea una sesión temporal y devuelve su token.
export async function entrarInvitado() {
  const r = await api.entrarInvitado();
  api.setToken(r.token);
  sesion = { token: r.token, usuario: r.usuario, expira_en: r.expira_en, idSesionInvitado: r.sesion?.id_sesion_invitado ?? null };
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
  // Si es invitado, se libera la excavadora para la siguiente persona.
  if (sesion.idSesionInvitado) { try { await api.terminarSesionInvitado(sesion.idSesionInvitado); } catch { /* ya terminó */ } }
  try { await api.logout(); } catch { /* si el servidor no responde, igual se cierra aquí */ }
  cerrarLocal('Sesión cerrada');
}

// Cualquier 401 de la API cierra la sesión local.
api.onSesionExpirada(() => cerrarLocal('Tu sesión expiró. Inicia sesión de nuevo.'));
