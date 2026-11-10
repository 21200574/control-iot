const $ = id => document.getElementById(id);

const INDICADORES = {
  ws: { en_linea: ['✔', 'En línea', 'ok'], conectando: ['…', 'Conectando', 'warn'],
        reconectando: ['↻', 'Reconectando', 'warn'], desconectado: ['✖', 'Desconectado', 'bad'] },
  api: { disponible: ['✔', 'Disponible', 'ok'], comprobando: ['…', 'Comprobando', 'warn'],
         no_disponible: ['✖', 'No disponible', 'bad'] },
  db: { disponible: ['✔', 'Disponible', 'ok'], no_disponible: ['✖', 'No disponible', 'bad'],
        sin_verificar: ['?', 'Sin verificar', 'muted'] },
};

// Todo el texto remoto entra con textContent: nunca innerHTML con datos de la API.
export function setIndicator(tipo, estado) {
  const d = INDICADORES[tipo]?.[estado];
  if (!d) return;
  const el = $('ind-' + tipo);
  el.className = 'chip ' + d[2];
  el.querySelector('.ind-state').textContent = `${d[0]} ${d[1]}`;
}

export const setVehicle = nombre => { $('vehicle-name').textContent = String(nombre); };

// Los radares giran solo mientras hay una solicitud en vuelo o una DEMO activa.
let enVuelo = false, demoOn = false;
const refrescar = () => document.body.classList.toggle('busy', enVuelo || demoOn);

// Marca el botón de la DEMO en curso (id) o limpia todos (v = false).
export function setDemoBusy(v, id) {
  demoOn = v;
  const activaId = v && id !== undefined ? Number(id) : null;
  document.querySelectorAll('.demo-btn').forEach(b => {
    const activa = activaId !== null && Number(b.dataset.demo) === activaId;
    b.classList.toggle('activa', activa);
    b.setAttribute('aria-pressed', String(activa));
    b.querySelector('.st').textContent = activa ? '● En curso' : b.dataset.desc;
  });
  refrescar();
}

// Un botón por cada DEMO activa de la base de datos (nombre y descripción vienen de la API).
export function renderDemos(lista, onClick) {
  const cont = $('demos');
  cont.replaceChildren();
  const datos = Array.isArray(lista) ? lista : [];
  if (!datos.length) {
    const p = document.createElement('p');
    p.className = 'sin-demos';
    p.textContent = 'Sin DEMO disponibles';
    cont.append(p);
    return;
  }
  cont.style.setProperty('--n', String(Math.min(datos.length, 3)));
  datos.forEach(d => {
    const desc = d.descripcion ? String(d.descripcion) : 'Iniciar';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'key demo-btn';
    b.dataset.demo = String(d.id_demo);
    b.dataset.desc = desc;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg><span class="nm"></span><span class="st"></span>';
    b.querySelector('.nm').textContent = String(d.nombre);
    b.querySelector('.st').textContent = desc;
    b.addEventListener('click', () => onClick(Number(d.id_demo)));
    cont.append(b);
  });
}

function marcarPaso(fase) {
  const pasos = [1, 2, 3].map(n => $('st-' + n));
  if (fase === 'solicitado') pasos.forEach(p => { p.className = ''; });
  const i = { solicitado: 0, aceptado: 1, evento: 2 }[fase];
  if (i !== undefined) pasos[i].className = 'on';
  if (fase === 'error') pasos.find(p => p.className !== 'on')?.classList.add('err');
}

export function setAction(texto, clase = '') {
  const a = $('action');
  a.textContent = texto;
  a.title = texto;
  a.className = 'action ' + clase;
  if (clase === 'solicitado') enVuelo = true;
  if (clase === 'aceptado' || clase === 'error' || clase === 'info') enVuelo = false;
  marcarPaso(clase);
  refrescar();
}

const ESTADOS = ['solicitado', 'aceptado', 'evento', 'error'];
const clavesDe = b => (b.dataset.keys || b.dataset.cmd || '').split(' ');

export function markButton(clave, fase) {
  document.querySelectorAll('.cmd').forEach(b => {
    b.classList.remove(...ESTADOS);
    if (clavesDe(b).includes(clave)) b.classList.add(fase);
  });
  document.querySelectorAll('.stick').forEach(s => {
    const joy = s.querySelector('.joystick');
    joy.classList.remove(...ESTADOS);
    if (s.dataset.keys.split(' ').includes(clave)) joy.classList.add(fase);
  });
}

// Interruptor (Silencio, Luz): el estado se lee en el texto y el símbolo, no solo en el color.
export function setToggle(grupo, activo, textos) {
  const b = document.querySelector(`.cmd[data-toggle="${grupo}"]`);
  if (!b) return;
  b.setAttribute('aria-pressed', String(activo));
  b.querySelector('.nm').textContent = textos.nm;
  b.querySelector('.st').textContent = textos.st;
}

// faltan: claves que no existen en el catálogo; su botón queda deshabilitado (DETENER siempre funciona).
export function enableControls(on, faltan = []) {
  document.querySelectorAll('.cmd').forEach(b => {
    const incompleto = b.dataset.cmd !== 'detener' && clavesDe(b).some(k => faltan.includes(k));
    b.disabled = !on || incompleto;
  });
}
