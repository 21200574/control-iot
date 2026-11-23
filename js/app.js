import { CONFIG } from './config.js?v=13';
import * as api from './api.js?v=13';
import * as auth from './auth.js?v=13';
import * as ui from './ui.js?v=13';
import { createCommands } from './commands.js?v=13';
import { createDemo } from './demo.js?v=13';
import { createJoystick } from './joystick.js?v=13';
import { createSocket } from './websocket.js?v=13';
import { startHealth } from './health.js?v=13';
import { createNav } from './nav.js?v=13';
import { createMonitor } from './monitor.js?v=13';
import { createAdmin } from './admin.js?v=13';

const $ = id => document.getElementById(id);
const FASES = { solicitado: 'Solicitado', aceptado: 'Aceptado por la API', evento: 'Evento recibido por WebSocket', error: 'Error' };
const ETIQUETAS = {
  adelante: 'Avanzar', atras: 'Retroceder', izquierda: 'Girar izquierda', derecha: 'Girar derecha',
  brazo_arriba: 'Subir brazo', brazo_abajo: 'Bajar brazo', pala_abrir: 'Abrir pala', pala_cerrar: 'Cerrar pala',
  silencio_on: 'Activar silencio', silencio_off: 'Desactivar silencio', luz_on: 'Encender luz', luz_off: 'Apagar luz', detener: 'DETENER',
};

// Silencio y Luz son interruptores con un comando distinto para cada estado, así el WebSocket los diferencia.
const INTERRUPTORES = {
  silencio: {
    on:  { clave: 'silencio_on',  nm: 'Silencio activado',    st: '● Toca para desactivar' },
    off: { clave: 'silencio_off', nm: 'Silencio desactivado', st: '○ Toca para activar' },
  },
  luz: {
    on:  { clave: 'luz_on',  nm: 'Luz encendida', st: '● Toca para apagar' },
    off: { clave: 'luz_off', nm: 'Luz apagada',   st: '○ Toca para encender' },
  },
};
// La excavadora arranca con la luz ENCENDIDA y el sonido ACTIVO (silencio desactivado).
const INICIAL = { silencio: false, luz: true };
const encendido = { ...INICIAL };   // último estado aceptado por la API
const deseado = { ...INICIAL };     // estado que pide la última pulsación
const textoToggle = g => INTERRUPTORES[g][INICIAL[g] ? 'on' : 'off'];
const ACCION = {};                                   // clave de comando -> { grupo, valor }
for (const [grupo, e] of Object.entries(INTERRUPTORES)) {
  ACCION[e.on.clave] = { grupo, valor: true };
  ACCION[e.off.clave] = { grupo, valor: false };
}

let vistaActual = 'control';
let unidades = [];           // lo que la API dice que esta persona puede ver (GET /mis-vehiculos)

function onStatus(fase, clave, detalle = '') {
  if (fase === 'info') return ui.setAction(detalle, 'info');
  const a = ACCION[clave];
  if (fase === 'error' && a) deseado[a.grupo] = encendido[a.grupo];   // si falló, el botón no cambia de estado
  ui.setAction(`${FASES[fase]}: ${ETIQUETAS[clave] ?? clave}${detalle ? ' — ' + detalle : ''}`, fase);
  ui.markButton(clave, fase);
}

function onAccepted(clave) {
  const a = ACCION[clave];
  if (!a) return;
  encendido[a.grupo] = a.valor;
  ui.setToggle(a.grupo, a.valor, INTERRUPTORES[a.grupo][a.valor ? 'on' : 'off']);
}

function onEvent(m) {
  commands.onEvent(m);
  monitor.onEvent(m);
  const textos = { demo_inicio: 'DEMO iniciada', demo_fin: 'DEMO finalizada', demo_cancelada: 'DEMO cancelada', demo_error: 'Error en la DEMO' };
  if (textos[m.tipo]) ui.setAction(textos[m.tipo], 'evento');
  if (m.tipo === 'demo_movimiento') ui.setAction(`DEMO paso ${Number(m.orden)}: ${String(m.comando)}`, 'evento');

  // Sesiones de invitado (práctica 4.3)
  if (m.tipo === 'sesion_invitado_inicio' && auth.rol() !== 'INVITADO') {
    ui.setAction('Un invitado inició una sesión en esta unidad: solo puedes DETENER.', 'info');
    admin.refrescarSiVisible();
  }
  if (m.tipo === 'sesion_invitado_fin') {
    ui.setAction(`Sesión de invitado finalizada: ${String(m.motivo ?? '')}`, 'info');
    if (auth.rol() === 'INVITADO') refrescarUnidades();      // pierde el acceso a la unidad
    else admin.refrescarSiVisible();
  }
}

const commands = createCommands({ onStatus, onAccepted, onDemoState: ui.setDemoBusy });
const demo = createDemo({ commands, onMsg: (t, clase) => ui.setAction(t, clase) });
const monitor = createMonitor();
const socket = createSocket({
  onState: s => { ui.setIndicator('ws', s); monitor.onWsState(s); },
  onEvent,
  onFalla: () => revisarAcceso(),
});

const admin = createAdmin({
  contenedor: $('adm-cuerpo'),
  tabs: $('adm-tabs'),
  mensaje: $('adm-msg'),
  rolEtiqueta: $('adm-rol'),
  getUnidades: () => unidades,
  refrescarUnidades: () => refrescarUnidades(true),
  controlar: id => irAControl(id),
  abrirLogin: () => abrirDialogo(),
});

const nav = createNav({
  onChange: v => {
    vistaActual = v;
    if (v === 'monitoreo') monitor.activar(); else monitor.desactivar();
    if (v === 'administracion') admin.activar(); else admin.desactivar();
    if (v === 'control') recargarDemos();       // por si se editaron demos en ADMINISTRACIÓN
  },
});

// Botones (Silencio, Luz, DETENER): cada pulsación envía su comando. Joysticks: solo al cambiar de dirección.
document.querySelectorAll('.cmd[data-cmd]').forEach(b => b.addEventListener('click', () => commands.send(b.dataset.cmd)));
document.querySelectorAll('.cmd[data-toggle]').forEach(b => b.addEventListener('click', () => {
  const g = b.dataset.toggle;
  deseado[g] = !deseado[g];
  commands.send(INTERRUPTORES[g][deseado[g] ? 'on' : 'off'].clave);
}));
const joystick = claves => ({ claves, onDirection: c => commands.send(c, true), onRelease: () => commands.stop(false) });
createJoystick($('stick-mov'), joystick({ arriba: 'adelante', abajo: 'atras', izquierda: 'izquierda', derecha: 'derecha' }));
createJoystick($('stick-brazo'), joystick({ arriba: 'brazo_arriba', abajo: 'brazo_abajo', izquierda: 'pala_cerrar', derecha: 'pala_abrir' }));

// ---------------------------------------------------------------- acceso (inicio y cierre de sesión)
const dialogo = $('access');

function abrirDialogo() {
  const u = auth.usuario();
  $('login-form').hidden = Boolean(u);
  $('sesion-info').hidden = !u;
  if (u) {
    $('si-nombre').textContent = String(u.nombre);
    $('si-correo').textContent = String(u.correo);
    $('si-rol').textContent = auth.ROLES[u.rol] ?? String(u.rol);
  } else {
    $('login-error').textContent = '';
  }
  if (!dialogo.open) dialogo.showModal();
}

document.querySelectorAll('[data-cerrar-dialogo]').forEach(b => b.addEventListener('click', () => dialogo.close()));
$('open-access').addEventListener('click', abrirDialogo);
$('logout-btn').addEventListener('click', async () => { dialogo.close(); await auth.logout(); });

// Tipo de cuenta elegido en la pantalla de acceso
let rolElegido = 'ADMIN';
const EJEMPLO = { ADMIN: 'admin@excavadora.local', USUARIO: 'cliente@excavadora.local', INVITADO: 'invitado@excavadora.local' };
document.querySelectorAll('.rol-op').forEach(b => b.addEventListener('click', () => {
  rolElegido = b.dataset.rol;
  document.querySelectorAll('.rol-op').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  $('login-correo').placeholder = EJEMPLO[rolElegido];
  $('login-error').textContent = '';
  $('login-correo').focus();
}));
$('login-correo').placeholder = EJEMPLO[rolElegido];

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const boton = $('login-enviar');
  boton.disabled = true;
  $('login-error').textContent = '';
  try {
    await auth.login($('login-correo').value, $('login-pass').value, rolElegido);
    $('login-pass').value = '';
  } catch (err) {
    $('login-error').textContent = err.message;
  } finally {
    boton.disabled = false;
  }
});

auth.onChange(async (sesion, motivo) => {
  ui.setUsuario(sesion?.usuario ?? null, auth.ROLES[sesion?.usuario?.rol] ?? '');
  if (sesion) {
    if (dialogo.open) dialogo.close();
    const invitado = sesion.usuario.rol === 'INVITADO';
    nav.permitir(invitado ? ['control'] : ['control', 'monitoreo', 'administracion']);   // el invitado solo tiene CONTROL
    if (invitado) location.hash = '#control';
    ui.setAction('Sesión iniciada. Cargando tus vehículos…', 'info');
    admin.onSesion(sesion.usuario);
    await cargarUnidades();
    vigilarInvitado();
    return;
  }
  // Sin sesión: se corta todo y se pide iniciar de nuevo
  detenerVigilante();
  nav.permitir(['control', 'monitoreo', 'administracion']);
  socket.stop();
  unidades = [];
  limpiarControl();
  admin.onSesion(null);
  const expiro = motivo && motivo !== 'Sesión cerrada';
  ui.setAction(expiro ? motivo : 'Inicia sesión desde Acceso para controlar el vehículo.', expiro ? 'error' : 'info');
  abrirDialogo();
});

// ---------------------------------------------------------------- unidades
function limpiarControl() {
  Object.entries(INTERRUPTORES).forEach(([g, e]) => {
    encendido[g] = INICIAL[g];
    deseado[g] = INICIAL[g];
    ui.setToggle(g, INICIAL[g], textoToggle(g));
  });
  ui.renderUnidades([], 0, () => {});
  ui.setVehicle('Control IoT');
  ui.renderDemos([], () => {});
  ui.setDemoBusy(false);
  ui.enableControls(false);
  commands.loadCatalog([]);
  monitor.reiniciar();
}

// Invitado: la sesión la inicia otra persona en cualquier momento; se revisa cada 8 s para conectar solo.
let vigilante = null, cuenta = null, finSesion = 0;
function detenerVigilante() {
  clearInterval(vigilante); clearInterval(cuenta);
  vigilante = cuenta = null; finSesion = 0;
}
function vigilarInvitado() {
  detenerVigilante();
  if (auth.rol() !== 'INVITADO') return;
  vigilante = setInterval(() => {
    const hay = unidades.some(u => u.activo && u.sesion_invitado);
    if (!hay) cargarUnidades();                 // aún sin sesión: reintenta y conecta en cuanto exista
    else refrescarUnidades(true);               // con sesión: detecta si terminó
  }, 8000);
}
// Cuenta regresiva de la sesión del invitado, junto al nombre de la unidad.
function mostrarCuenta(u) {
  clearInterval(cuenta); cuenta = null;
  const fin = u?.sesion_invitado?.fin_previsto;
  if (!fin || auth.rol() !== 'INVITADO') return;
  const t = Date.parse(CONFIG.DB_FECHAS_EN_UTC && !/[zZ]|[+-]\d\d:?\d\d$/.test(fin) ? fin + 'Z' : fin);
  if (!Number.isFinite(t)) return;
  const pintar = () => {
    const s = Math.max(0, Math.round((t - Date.now()) / 1000));
    ui.setVehicle(`${u.nombre} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    if (s === 0) { clearInterval(cuenta); cuenta = null; setTimeout(() => refrescarUnidades(true), 1500); }
  };
  pintar();
  cuenta = setInterval(pintar, 1000);
}

function sinUnidad() {
  socket.stop();
  limpiarControl();
  clearInterval(cuenta); cuenta = null;
  ui.setAction(
    auth.rol() === 'INVITADO'
      ? 'Aún no tienes una sesión activa. Pide al administrador o al cliente que la inicie: esta pantalla se conecta sola.'
      : 'No tienes vehículos asignados. Pide al administrador que te asigne uno.',
    'info',
  );
}

// Lista (o recarga) las unidades y elige una. preferida: id a conservar si sigue disponible.
async function cargarUnidades(preferida) {
  try {
    unidades = await api.misVehiculos();
  } catch (e) {
    unidades = [];
    ui.setAction(`No se pudieron cargar tus vehículos: ${e.message}`, 'error');
  }
  const activas = unidades.filter(u => u.activo);
  const elegida = activas.find(u => u.id_vehiculo === (preferida ?? CONFIG.VEHICLE_ID)) ?? activas[0];
  if (!elegida) return sinUnidad();
  ui.renderUnidades(activas, elegida.id_vehiculo, id => seleccionarUnidad(id));
  await seleccionarUnidad(elegida.id_vehiculo);
}

// Recarga la lista sin tocar la unidad actual, salvo que ya no tenga acceso a ella.
async function refrescarUnidades(silencioso = false) {
  try {
    unidades = await api.misVehiculos();
  } catch (e) {
    if (!silencioso) ui.setAction(`No se pudieron actualizar tus vehículos: ${e.message}`, 'error');
    return;
  }
  const activas = unidades.filter(u => u.activo);
  if (!activas.some(u => u.id_vehiculo === CONFIG.VEHICLE_ID)) return cargarUnidades();
  ui.renderUnidades(activas, CONFIG.VEHICLE_ID, id => seleccionarUnidad(id));
}

// El WebSocket fue rechazado varias veces seguidas: ¿se perdió el acceso a la unidad?
async function revisarAcceso() {
  try {
    const lista = await api.misVehiculos();
    if (!lista.some(u => u.activo && u.id_vehiculo === CONFIG.VEHICLE_ID)) await cargarUnidades();
  } catch { /* sin red o sesión vencida: lo resuelven el reintento y el cierre de sesión */ }
}

async function seleccionarUnidad(id) {
  CONFIG.VEHICLE_ID = id;
  ui.setUnidadActiva(id);
  Object.keys(INTERRUPTORES).forEach(g => { encendido[g] = INICIAL[g]; deseado[g] = INICIAL[g]; ui.setToggle(g, INICIAL[g], textoToggle(g)); });
  ui.setDemoBusy(false);
  monitor.reiniciar();
  const u = unidades.find(x => x.id_vehiculo === id);
  ui.setVehicle(u?.nombre ?? `Vehículo ${id}`);
  mostrarCuenta(u);
  if (u?.nombre) monitor.setVehiculo(u.nombre);
  socket.start(auth.token());
  await cargarCatalogo(id);
  if (vistaActual === 'monitoreo') monitor.activar();
}

async function recargarDemos() {
  const id = CONFIG.VEHICLE_ID;
  if (!auth.usuario() || !id || auth.rol() === 'INVITADO') return;
  try {
    const demos = await api.getDemos(id);
    if (id === CONFIG.VEHICLE_ID && auth.rol() !== 'INVITADO') ui.renderDemos(demos.filter(d => d.activo), idDemo => demo.iniciar(idDemo));
  } catch { /* se conserva la lista actual */ }
}

function irAControl(id) {
  location.hash = '#control';
  if (id !== CONFIG.VEHICLE_ID) seleccionarUnidad(id);
}

async function cargarCatalogo(id) {
  // Cada consulta es independiente: si falla una, las demás siguen funcionando.
  const [cmds, demos] = await Promise.allSettled([api.getComandos(id), api.getDemos(id)]);
  if (id !== CONFIG.VEHICLE_ID) return;        // se cambió de unidad mientras se consultaba

  // Los botones DEMO salen de la base de datos y no dependen del catálogo de comandos.
  ui.renderDemos(auth.rol() !== 'INVITADO' && demos.status === 'fulfilled' && Array.isArray(demos.value) ? demos.value.filter(d => d.activo) : [], idDemo => demo.iniciar(idDemo));   // el invitado no ejecuta DEMO

  if (cmds.status !== 'fulfilled') {
    return ui.setAction(`No se pudo cargar el catálogo: ${cmds.reason.message}.`, 'error');
  }
  const faltan = commands.loadCatalog(cmds.value);
  ui.enableControls(true, faltan);

  const avisos = [];
  if (faltan.length) {
    avisos.push(auth.rol() === 'INVITADO'
      ? 'tu sesión no incluye todos los comandos (los botones sin permiso están deshabilitados)'
      : `sin comando en la base de datos: ${faltan.map(k => ETIQUETAS[k] ?? k).join(', ')}`);
  }
  if (demos.status !== 'fulfilled') avisos.push(`no se cargaron las DEMO (${demos.reason.message})`);
  ui.setAction(avisos.length ? `Catálogo cargado; ${avisos.join('; ')}` : 'Listo para controlar.', 'info');
}

// ---------------------------------------------------------------- inicio
function init() {
  Object.keys(INTERRUPTORES).forEach(g => ui.setToggle(g, INICIAL[g], textoToggle(g)));
  ui.setDemoBusy(false);
  ui.enableControls(false);
  ui.setIndicator('ws', 'desconectado');
  ui.setIndicator('api', 'comprobando');
  ui.setIndicator('db', 'sin_verificar');
  ui.setUsuario(null);
  ui.setAction('Inicia sesión para controlar el vehículo.', 'info');
  startHealth({ onApi: s => ui.setIndicator('api', s), onDb: s => ui.setIndicator('db', s) });
  abrirDialogo();
}
init();
