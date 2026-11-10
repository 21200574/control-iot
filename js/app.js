import { CONFIG } from './config.js?v=10';
import * as api from './api.js?v=10';
import * as ui from './ui.js?v=10';
import { createCommands } from './commands.js?v=10';
import { createDemo } from './demo.js?v=10';
import { createJoystick } from './joystick.js?v=10';
import { createSocket } from './websocket.js?v=10';
import { startHealth } from './health.js?v=10';
import { createNav } from './nav.js?v=10';
import { createMonitor } from './monitor.js?v=10';

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
const encendido = { silencio: false, luz: false };   // último estado aceptado por la API
const deseado = { silencio: false, luz: false };     // estado que pide la última pulsación
const ACCION = {};                                   // clave de comando -> { grupo, valor }
for (const [grupo, e] of Object.entries(INTERRUPTORES)) {
  ACCION[e.on.clave] = { grupo, valor: true };
  ACCION[e.off.clave] = { grupo, valor: false };
}

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
}

const commands = createCommands({ onStatus, onAccepted, onDemoState: ui.setDemoBusy });
const demo = createDemo({ commands, onMsg: (t, clase) => ui.setAction(t, clase) });
const monitor = createMonitor();
const socket = createSocket({ onState: s => { ui.setIndicator('ws', s); monitor.onWsState(s); }, onEvent });
createNav({ onChange: v => (v === 'monitoreo' ? monitor.activar() : monitor.desactivar()) });

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

const dialogo = $('access');
$('open-access').addEventListener('click', () => dialogo.showModal());
$('access-close').addEventListener('click', () => dialogo.close());
$('token-form').addEventListener('submit', e => {
  e.preventDefault();
  const campo = $('token');
  const t = campo.value.trim();
  if (!t) return;
  api.setToken(t);
  socket.start(t);
  campo.value = '';
  dialogo.close();
  ui.setAction('Token en memoria. Conectando el WebSocket…');
});

async function init() {
  dialogo.showModal();
  Object.entries(INTERRUPTORES).forEach(([g, e]) => ui.setToggle(g, false, e.off));
  ui.setDemoBusy(false);
  ui.setIndicator('ws', 'desconectado');
  ui.setIndicator('api', 'comprobando');
  ui.setIndicator('db', 'sin_verificar');
  startHealth({ onApi: s => ui.setIndicator('api', s), onDb: s => ui.setIndicator('db', s) });

  // Cada consulta es independiente: si falla una, las demás siguen funcionando.
  const [veh, cmds, demos] = await Promise.allSettled([
    api.getVehiculo(CONFIG.VEHICLE_ID), api.getComandos(CONFIG.VEHICLE_ID), api.getDemos(CONFIG.VEHICLE_ID),
  ]);
  const nombreVeh = veh.status === 'fulfilled' && Array.isArray(veh.value) && veh.value[0]?.nombre ? veh.value[0].nombre : null;
  ui.setVehicle(nombreVeh ?? `Vehículo ${CONFIG.VEHICLE_ID}`);
  if (nombreVeh) monitor.setVehiculo(nombreVeh);

  // Los botones DEMO salen de la base de datos y no dependen del catálogo de comandos.
  ui.renderDemos(demos.status === 'fulfilled' && Array.isArray(demos.value) ? demos.value.filter(d => d.activo) : [], id => demo.iniciar(id));

  if (cmds.status !== 'fulfilled') {
    return ui.setAction(`No se pudo cargar el catálogo: ${cmds.reason.message}. Revisa F12 → Consola.`, 'error');
  }
  const faltan = commands.loadCatalog(cmds.value);
  ui.enableControls(true, faltan);

  const avisos = [];
  if (faltan.length) avisos.push(`sin comando en la base de datos: ${faltan.map(k => ETIQUETAS[k] ?? k).join(', ')}`);
  if (demos.status !== 'fulfilled') avisos.push(`no se cargaron las DEMO (${demos.reason.message})`);
  ui.setAction(avisos.length ? `Catálogo cargado; ${avisos.join('; ')}` : 'Listo. Escribe el token en Acceso.', 'info');
}
init();
