import { http } from './api.js?v=14';
import { el, bloque, tabla, boton, botonConfirmar, campo, selector, insignia, fmt, accion, cuentaRegresiva } from './admin-ui.js?v=14';

const NO_PERMITIDOS = new Set(['DEMO', 'DETENER']);
const bonito = s => String(s ?? '').replace(/_/g, ' ');
const TIPO = { ACTIVA: 'ok', TERMINADA: '', EXPIRADA: 'warn', CANCELADA: 'warn' };

export async function vistaInvitados(out, ctx) {
  const unidades = (ctx.getUnidades() ?? []).filter(u => u.activo !== false);
  const [sesiones, invitados] = await Promise.all([http.get('/invitado/sesiones'), http.get('/invitado/invitados')]);

  const activa = s => s.estado === 'ACTIVA';
  out.append(bloque('Sesiones de invitado', tabla([
    { t: 'Unidad', f: s => s.unidad },
    { t: 'Invitado', f: s => s.invitado },
    { t: 'Inicio', clase: 'nw', f: s => fmt(s.inicio) },
    { t: 'Termina', clase: 'nw', f: s => fmt(s.fin_previsto) },
    { t: 'Restante', f: s => (activa(s) ? cuentaRegresiva(ctx, s.fin_previsto) : '—') },
    { t: 'Estado', f: s => insignia(s.estado, TIPO[s.estado]) },
    { t: '', clase: 'acc', f: s => (activa(s) ? botonConfirmar('Terminar', () => accion(ctx, null,
      () => http.post(`/invitado/sesiones/${s.id_sesion_invitado}/terminar`), 'Sesión terminada: la unidad se detuvo', { unidades: true }), { pregunta: '¿Terminar?' }) : '') },
  ], sesiones, { vacio: 'Aún no hay sesiones de invitado', etiqueta: 'Sesiones de invitado' })));

  if (!unidades.length) return;
  if (!invitados.length) {
    return out.append(el('p', { class: 'adm-vacio' }, 'No hay invitados activos. El administrador puede crear cuentas con rol Invitado en Clientes.'));
  }

  const unidad = selector(unidades.map(u => ({ valor: u.id_vehiculo, texto: u.nombre })));
  const invitado = selector(invitados.map(i => ({ valor: i.id_usuario, texto: `${i.nombre} (${i.correo})` })));
  const minutos = el('input', { type: 'number', class: 'form-control', min: 1, max: 120, value: '15', required: true });
  const checks = el('div', { class: 'd-flex flex-wrap gap-2' });
  const enviar = el('button', { type: 'submit', class: 'btn-a prim' }, 'Iniciar sesión de invitado');
  let seleccion = new Set();

  async function cargarComandos() {
    checks.replaceChildren(el('span', { class: 'adm-cargando' }, 'Cargando comandos…'));
    try {
      const cmds = (await http.get(`/vehiculos/${unidad.value}/comandos`)).filter(c => c.activo && !NO_PERMITIDOS.has(c.nombre));
      seleccion = new Set(cmds.filter(c => c.codigo >= 1 && c.codigo <= 4).map(c => c.codigo));
      checks.replaceChildren(...cmds.map(c => {
        const cb = el('input', { type: 'checkbox', checked: seleccion.has(c.codigo), class: 'form-check-input' });
        cb.addEventListener('change', () => { cb.checked ? seleccion.add(c.codigo) : seleccion.delete(c.codigo); });
        return el('label', { class: 'form-check-label d-flex gap-1 align-items-center' }, cb, bonito(c.nombre));
      }));
      if (!cmds.length) checks.replaceChildren(el('span', { class: 'adm-vacio' }, 'La unidad no tiene comandos activos'));
    } catch (e) { checks.replaceChildren(el('span', { class: 'adm-vacio' }, e.message)); }
  }
  unidad.addEventListener('change', cargarComandos);

  out.append(bloque('Nueva sesión', el('form', {
    class: 'adm-form', onSubmit: e => {
      e.preventDefault();
      if (!seleccion.size) return ctx.msg('Elige al menos un comando permitido', 'error');
      accion(ctx, enviar, () => http.post('/invitado/sesiones', {
        id_vehiculo: Number(unidad.value), id_invitado: Number(invitado.value),
        minutos: Math.round(Number(minutos.value)), comandos: [...seleccion],
      }), 'Sesión iniciada: la unidad queda reservada para el invitado', { unidades: true });
    },
  },
  campo('Unidad', unidad), campo('Invitado', invitado), campo('Minutos (1–120)', minutos),
  campo('Comandos permitidos', checks, { ancho: true }),
  el('div', { class: 'acciones' }, enviar)),
  el('p', { class: 'adm-nota' }, 'DETENER siempre está permitido y DEMO nunca. Al vencer el tiempo la unidad se detiene sola.')));
  await cargarComandos();
}
