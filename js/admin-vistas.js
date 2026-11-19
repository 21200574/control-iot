import { http } from './api.js?v=11';
import {
  el, bloque, tabla, boton, botonConfirmar, campo, selector, insignia, kpi, fmt,
  accion, pedir, graficaBarras, ranking, cuentaRegresiva,
} from './admin-ui.js?v=11';

const si = (v, ok = 'Sí', no = 'No') => insignia(v ? ok : no, v ? 'ok' : '');
const ROL_TIPO = { ADMIN: 'acc', USUARIO: 'orq', INVITADO: 'warn' };
const diaCorto = iso => { const [, m, d] = String(iso).split('-'); return `${d}/${m}`; };

// ================================================================ RESUMEN (solo ADMIN)
export async function resumen(out, ctx) {
  const zona = el('div', { class: 'adm-bloque' });
  out.append(zona);

  const pintar = d => {
    const rol = n => d.usuarios_por_rol.find(r => r.rol === n) ?? { activos: 0, total: 0 };
    const aud = Object.fromEntries(d.auditoria_24h.map(a => [a.resultado, a.total]));
    zona.replaceChildren(
      el('div', { class: 'kpis' },
        kpi(`${d.unidades.activas}/${d.unidades.total}`, 'Unidades activas'),
        kpi(d.unidades.sin_propietario, 'Unidades sin propietario'),
        kpi(rol('USUARIO').activos, 'Clientes activos'),
        kpi(rol('INVITADO').activos, 'Invitados activos'),
        kpi(d.asignaciones_activas, 'Asignaciones activas'),
        kpi(d.sesiones_invitado_activas, 'Sesiones de invitado'),
        kpi(d.comandos_24h, 'Comandos en 24 h'),
        kpi(d.demos_en_ejecucion, 'DEMO en ejecución'),
        kpi(d.clientes_websocket, 'Conexiones WebSocket'),
        kpi(d.sesiones_login_activas, 'Sesiones iniciadas'),
      ),
      el('div', { class: 'graficas' },
        el('div', { class: 'grafica' }, el('h3', {}, 'Comandos por día (últimos 7 días)'),
          graficaBarras(
            d.comandos_por_dia.map(x => ({ etiqueta: diaCorto(x.dia), valor: x.total })),
            'Comandos manuales registrados por día durante los últimos siete días',
          ),
          el('p', { class: 'adm-nota' }, 'Solo movimientos individuales; los pasos de una DEMO no entran al historial.')),
        el('div', { class: 'grafica' }, el('h3', {}, 'Comandos más usados (7 días)'),
          ranking(d.comandos_mas_usados_7d.map(c => ({ nombre: String(c.nombre).replace(/_/g, ' '), valor: c.total })))),
        el('div', { class: 'grafica' }, el('h3', {}, 'Origen de los comandos (7 días)'),
          ranking(d.comandos_por_origen_7d.map(o => ({ nombre: String(o.origen), valor: o.total })))),
        el('div', { class: 'grafica' }, el('h3', {}, 'Auditoría (últimas 24 h)'),
          el('div', { class: 'aud-tres' },
            insignia(`✔ OK: ${aud.OK ?? 0}`, 'ok'),
            insignia(`⛔ Denegados: ${aud.DENEGADO ?? 0}`, 'warn'),
            insignia(`✖ Errores: ${aud.ERROR ?? 0}`, 'bad')),
          el('p', { class: 'adm-nota' }, 'Cada login, movimiento, demo, sesión de invitado y acceso denegado queda registrado.')),
      ),
      el('p', { class: 'adm-nota' }, 'Se actualiza solo cada 20 segundos. Los indicadores de conectividad (WSS, API y RDS) están arriba.'),
    );
  };

  pintar(await http.get('/admin/dashboard'));
  ctx.cada(20000, async () => { try { pintar(await http.get('/admin/dashboard')); } catch { /* el siguiente ciclo reintenta */ } });
}

// ================================================================ UNIDADES (solo ADMIN)
export async function unidades(out, ctx) {
  const [lista, modelos] = await Promise.all([http.get('/admin/unidades'), http.get('/admin/modelos')]);
  const activos = modelos.filter(m => m.activo);

  const cambiarEstado = u => accion(ctx, null, () => http.put(`/admin/unidades/${u.id_vehiculo}`, {
    nombre: u.nombre, id_modelo: u.id_modelo, numero_serie: u.numero_serie, descripcion: u.descripcion,
    microcontrolador: u.microcontrolador, activo: !u.activo,
  }), u.activo ? 'Unidad desactivada' : 'Unidad activada', { unidades: true });

  out.append(bloque('Unidades', tabla([
    { t: 'ID', f: u => u.id_vehiculo },
    { t: 'Unidad', f: u => u.nombre },
    { t: 'Modelo', f: u => u.modelo ?? '—' },
    { t: 'Serie', f: u => u.numero_serie ?? '—' },
    { t: 'Propietario', f: u => u.propietario ?? insignia('Sin propietario', 'warn') },
    { t: 'Actividad', f: u => (u.conectado ? insignia('Con actividad', 'ok') : insignia('Sin actividad')) },
    { t: 'Comandos', f: u => u.comandos },
    { t: 'Estado', f: u => si(u.activo, 'Activa', 'Inactiva') },
    { t: '', clase: 'acc', f: u => (u.activo
      ? botonConfirmar('Desactivar', () => cambiarEstado(u), { pregunta: '¿Desactivar?' })
      : boton('Activar', () => cambiarEstado(u), { clase: 'mini', deshabilitado: !u.id_modelo, titulo: u.id_modelo ? '' : 'Asigna un modelo primero' })) },
  ], lista, { claseFila: u => (u.activo ? '' : 'inactiva'), etiqueta: 'Unidades' })));

  if (!activos.length) {
    return out.append(el('p', { class: 'adm-vacio' }, 'Crea primero un modelo activo para poder dar de alta unidades.'));
  }

  const nombre = el('input', { type: 'text', class: 'form-control', required: true, minLength: 2, maxLength: 80 });
  const modelo = selector(activos.map(m => ({ valor: m.id_modelo, texto: m.nombre })));
  const serie = el('input', { type: 'text', class: 'form-control', maxLength: 50, placeholder: 'EXC-0002' });
  const desc = el('input', { type: 'text', class: 'form-control', maxLength: 255 });
  const micro = el('input', { type: 'text', class: 'form-control', maxLength: 50, value: 'ESP32' });
  const clonar = selector([{ valor: '', texto: 'No copiar' }, ...lista.map(u => ({ valor: u.id_vehiculo, texto: `Copiar de «${u.nombre}»` }))], lista[0]?.id_vehiculo ?? '');
  const enviar = el('button', { type: 'submit', class: 'btn-a prim' }, 'Crear unidad');

  out.append(bloque('Nueva unidad',
    el('form', {
      class: 'adm-form', onSubmit: e => {
        e.preventDefault();
        accion(ctx, enviar, () => http.post('/admin/unidades', {
          nombre: nombre.value.trim(), id_modelo: Number(modelo.value), numero_serie: serie.value.trim() || null,
          descripcion: desc.value.trim() || null, microcontrolador: micro.value.trim() || 'ESP32',
          clonar_de: clonar.value ? Number(clonar.value) : null,
        }), 'Unidad creada', { unidades: true });
      },
    },
    campo('Nombre', nombre), campo('Modelo', modelo), campo('Número de serie', serie),
    campo('Microcontrolador', micro), campo('Descripción', desc), campo('Comandos y demos de fábrica', clonar),
    el('div', { class: 'acciones' }, enviar)),
    el('p', { class: 'adm-nota' }, 'Una unidad nueva nace sin comandos: copiarlos de otra unidad le da el catálogo y las demos de fábrica.')));
}

// ================================================================ MODELOS (solo ADMIN)
export async function modelos(out, ctx) {
  const lista = await http.get('/admin/modelos');

  const guardar = (m, activo) => accion(ctx, null,
    () => http.put(`/admin/modelos/${m.id_modelo}`, { nombre: m.nombre, descripcion: m.descripcion, activo }),
    activo ? 'Modelo activado' : 'Modelo desactivado');

  out.append(bloque('Modelos', tabla([
    { t: 'ID', f: m => m.id_modelo },
    { t: 'Modelo', f: m => m.nombre },
    { t: 'Descripción', f: m => m.descripcion ?? '—' },
    { t: 'Unidades', f: m => m.unidades },
    { t: 'Estado', f: m => si(m.activo, 'Activo', 'Inactivo') },
    { t: '', clase: 'acc', f: m => [
      m.activo ? botonConfirmar('Desactivar', () => guardar(m, false), { pregunta: '¿Desactivar?' }) : boton('Activar', () => guardar(m, true), { clase: 'mini' }),
      botonConfirmar('Eliminar', () => accion(ctx, null, () => http.del(`/admin/modelos/${m.id_modelo}`), 'Modelo eliminado')),
    ] },
  ], lista, { claseFila: m => (m.activo ? '' : 'inactiva'), vacio: 'Aún no hay modelos', etiqueta: 'Modelos' })));

  const nombre = el('input', { type: 'text', class: 'form-control', required: true, minLength: 2, maxLength: 80 });
  const desc = el('input', { type: 'text', class: 'form-control', maxLength: 255 });
  const enviar = el('button', { type: 'submit', class: 'btn-a prim' }, 'Crear modelo');
  out.append(bloque('Nuevo modelo', el('form', {
    class: 'adm-form', onSubmit: e => {
      e.preventDefault();
      accion(ctx, enviar, () => http.post('/admin/modelos', { nombre: nombre.value.trim(), descripcion: desc.value.trim() || null }), 'Modelo creado');
    },
  }, campo('Nombre', nombre), campo('Descripción', desc), el('div', { class: 'acciones' }, enviar))));
}

// ================================================================ CLIENTES (solo ADMIN)
export async function clientes(out, ctx) {
  const lista = await http.get('/admin/clientes');

  const cambiar = (c, activo, password) => accion(ctx, null,
    () => http.put(`/admin/clientes/${c.id_usuario}`, { nombre: c.nombre, activo, ...(password ? { password } : {}) }),
    password ? 'Contraseña actualizada (sus sesiones se cerraron)' : (activo ? 'Cuenta activada' : 'Cuenta desactivada'));

  out.append(bloque('Clientes e invitados', tabla([
    { t: 'ID', f: c => c.id_usuario },
    { t: 'Nombre', f: c => c.nombre },
    { t: 'Correo', f: c => c.correo },
    { t: 'Rol', f: c => insignia(c.rol, ROL_TIPO[c.rol]) },
    { t: 'Unidades', f: c => c.unidades },
    { t: 'Estado', f: c => si(c.activo, 'Activo', 'Inactivo') },
    { t: '', clase: 'acc', f: c => (c.rol === 'ADMIN' ? '' : [
      c.activo ? botonConfirmar('Desactivar', () => cambiar(c, false), { pregunta: '¿Desactivar?' }) : boton('Activar', () => cambiar(c, true), { clase: 'mini' }),
      boton('Contraseña', async () => {
        const nueva = await pedir({ titulo: `Nueva contraseña de ${c.nombre}`, etiqueta: 'Mínimo 8 caracteres' });
        if (nueva) cambiar(c, c.activo, nueva);
      }, { clase: 'mini' }),
    ]) },
  ], lista, { claseFila: c => (c.activo ? '' : 'inactiva'), etiqueta: 'Clientes' })));

  const nombre = el('input', { type: 'text', class: 'form-control', required: true, minLength: 2, maxLength: 80 });
  const correo = el('input', { type: 'email', class: 'form-control', required: true, maxLength: 120, autocomplete: 'off' });
  const pass = el('input', { type: 'password', class: 'form-control', required: true, minLength: 8, maxLength: 200, autocomplete: 'new-password' });
  const rol = selector([{ valor: 'USUARIO', texto: 'Usuario (compra una excavadora)' }, { valor: 'INVITADO', texto: 'Invitado (sesiones temporales)' }]);
  const enviar = el('button', { type: 'submit', class: 'btn-a prim' }, 'Crear cuenta');
  out.append(bloque('Nueva cuenta', el('form', {
    class: 'adm-form', onSubmit: e => {
      e.preventDefault();
      accion(ctx, enviar, () => http.post('/admin/clientes', { nombre: nombre.value.trim(), correo: correo.value.trim(), password: pass.value, rol: rol.value }), 'Cuenta creada');
    },
  }, campo('Nombre', nombre), campo('Correo', correo), campo('Contraseña inicial', pass), campo('Rol', rol), el('div', { class: 'acciones' }, enviar)),
  el('p', { class: 'adm-nota' }, 'Las cuentas de administrador no se crean desde la aplicación.')));
}

// ================================================================ ASIGNACIONES (solo ADMIN)
export async function asignaciones(out, ctx) {
  const [lista, cls, uns] = await Promise.all([
    http.get('/admin/asignaciones'), http.get('/admin/clientes?rol=USUARIO'), http.get('/admin/unidades'),
  ]);

  out.append(bloque('Asignaciones', tabla([
    { t: 'ID', f: a => a.id_asignacion },
    { t: 'Cliente', f: a => a.cliente },
    { t: 'Unidad', f: a => a.unidad },
    { t: 'Inicio', clase: 'nw', f: a => fmt(a.inicio) },
    { t: 'Fin', clase: 'nw', f: a => (a.fin ? fmt(a.fin) : insignia('Vigente', 'ok')) },
    { t: '', clase: 'acc', f: a => (a.fin ? '' : botonConfirmar('Finalizar', () => accion(ctx, null,
      () => http.post(`/admin/asignaciones/${a.id_asignacion}/finalizar`), 'Asignación finalizada', { unidades: true }), { pregunta: '¿Finalizar?' })) },
  ], lista, { vacio: 'Aún no hay asignaciones', etiqueta: 'Asignaciones' })));

  const clientes = cls.filter(c => c.activo);
  const libres = uns.filter(u => u.activo && !u.id_propietario);
  if (!clientes.length || !libres.length) {
    return out.append(el('p', { class: 'adm-vacio' }, !clientes.length
      ? 'No hay clientes activos con rol Usuario: créalos en Clientes.'
      : 'No hay unidades libres: finaliza una asignación o crea una unidad nueva.'));
  }
  const cliente = selector(clientes.map(c => ({ valor: c.id_usuario, texto: `${c.nombre} (${c.correo})` })));
  const unidad = selector(libres.map(u => ({ valor: u.id_vehiculo, texto: u.nombre })));
  const enviar = el('button', { type: 'submit', class: 'btn-a prim' }, 'Asignar');
  out.append(bloque('Nueva asignación', el('form', {
    class: 'adm-form', onSubmit: e => {
      e.preventDefault();
      accion(ctx, enviar, () => http.post('/admin/asignaciones', { id_usuario: Number(cliente.value), id_vehiculo: Number(unidad.value) }), 'Unidad asignada', { unidades: true });
    },
  }, campo('Cliente', cliente), campo('Unidad libre', unidad), el('div', { class: 'acciones' }, enviar)),
  el('p', { class: 'adm-nota' }, 'Cada unidad tiene un solo propietario vigente; para cambiarlo, finaliza la asignación y crea otra.')));
}

// ================================================================ AUDITORÍA (solo ADMIN)
export async function auditoria(out, ctx) {
  const LIM = 25;
  let desde = 0;
  const filtro = selector([{ valor: '', texto: 'Todos los resultados' }, { valor: 'OK', texto: 'OK' }, { valor: 'DENEGADO', texto: 'Denegados' }, { valor: 'ERROR', texto: 'Errores' }]);
  const zona = el('div', { class: 'adm-bloque' });
  const TIPO = { OK: 'ok', DENEGADO: 'warn', ERROR: 'bad' };

  async function cargar() {
    const q = new URLSearchParams({ limite: String(LIM), desde: String(desde) });
    if (filtro.value) q.set('resultado', filtro.value);
    try {
      const r = await http.get('/admin/auditoria?' + q);
      const hasta = Math.min(desde + LIM, r.total);
      zona.replaceChildren(
        tabla([
          { t: '#', f: a => a.id_auditoria },
          { t: 'Fecha', clase: 'nw', f: a => fmt(a.fecha) },
          { t: 'Usuario', f: a => a.usuario ?? '—' },
          { t: 'Acción', f: a => a.accion },
          { t: 'Recurso', f: a => (a.recurso ? `${a.recurso} ${a.id_recurso ?? ''}` : '—') },
          { t: 'Resultado', f: a => insignia(a.resultado, TIPO[a.resultado]) },
          { t: 'Detalle', f: a => a.detalle ?? '' },
          { t: 'IP', f: a => a.ip ?? '' },
        ], r.registros, { vacio: 'Sin registros con ese filtro', etiqueta: 'Registro de auditoría' }),
        el('div', { class: 'acciones d-flex gap-2 align-items-center flex-wrap' },
          boton('← Más recientes', () => { desde = Math.max(0, desde - LIM); cargar(); }, { deshabilitado: desde === 0 }),
          boton('Más antiguos →', () => { desde += LIM; cargar(); }, { deshabilitado: desde + LIM >= r.total }),
          el('span', { class: 'adm-nota' }, r.total ? `${desde + 1}–${hasta} de ${r.total}` : '0 registros')),
      );
    } catch (e) { ctx.msg(e.message, 'error'); }
  }

  filtro.addEventListener('change', () => { desde = 0; cargar(); });
  out.append(bloque('Auditoría', el('div', { class: 'adm-form' }, campo('Filtrar', filtro)), zona,
    el('p', { class: 'adm-nota' }, 'Solo se agrega: los registros no se editan ni se borran desde la aplicación.')));
  await cargar();
}

// ================================================================ MIS VEHÍCULOS (USUARIO)
export async function misVehiculos(out, ctx) {
  const lista = await http.get('/mis-vehiculos');
  out.append(bloque('Mis vehículos', tabla([
    { t: 'Unidad', f: u => u.nombre },
    { t: 'Modelo', f: u => u.modelo ?? '—' },
    { t: 'Serie', f: u => u.numero_serie ?? '—' },
    { t: 'Último comando', f: u => (u.ultimo_comando ? String(u.ultimo_comando).replace(/_/g, ' ') : '—') },
    { t: 'Última actividad', clase: 'nw', f: u => (u.fecha_actualizacion ? fmt(u.fecha_actualizacion) : '—') },
    { t: 'Estado', f: u => si(u.activo, 'Activa', 'Inactiva') },
    { t: '', clase: 'acc', f: u => boton('Controlar', () => ctx.controlar(u.id_vehiculo), { clase: 'mini prim', deshabilitado: !u.activo }) },
  ], lista, { vacio: 'Aún no tienes vehículos asignados. Pide al administrador que te asigne uno.', etiqueta: 'Mis vehículos' })));
}

// ================================================================ MI SESIÓN (INVITADO)
export async function miSesion(out, ctx) {
  const sesiones = await http.get('/invitado/sesiones?solo_activas=true');
  const s = sesiones[0];
  if (!s) {
    return out.append(el('p', { class: 'adm-vacio' }, 'No tienes una sesión activa. Pide a quien te invitó que la inicie.'));
  }
  const comandos = await http.get(`/vehiculos/${s.id_vehiculo}/comandos`);

  out.append(
    bloque('Tu sesión de invitado',
      el('div', { class: 'kpis' },
        kpi(s.unidad, 'Unidad reservada'),
        el('div', { class: 'kpi' }, el('b', {}, cuentaRegresiva(ctx, s.fin_previsto)), el('span', {}, 'Tiempo restante')),
        kpi(fmt(s.fin_previsto).slice(-8), 'Termina a las')),
      el('div', { class: 'acciones d-flex gap-2 flex-wrap' },
        boton('Ir a CONTROL', () => ctx.controlar(s.id_vehiculo), { clase: 'prim' }),
        botonConfirmar('Terminar mi sesión', () => accion(ctx, null,
          () => http.post(`/invitado/sesiones/${s.id_sesion_invitado}/terminar`), 'Sesión terminada', { unidades: true }), { clase: 'peligro', pregunta: '¿Terminar ahora?' }))),
    bloque('Comandos permitidos',
      el('div', { class: 'd-flex flex-wrap gap-2' }, comandos.filter(c => c.activo && c.nombre !== 'DEMO').map(c => insignia(String(c.nombre).replace(/_/g, ' '), c.nombre === 'DETENER' ? 'bad' : 'acc'))),
      el('p', { class: 'adm-nota' }, 'DETENER siempre está disponible. Al terminar el tiempo, la unidad se detiene sola y tu sesión se cierra.')),
  );
}
