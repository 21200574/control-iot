import { fecha, hora } from './format.js?v=10';

const $ = id => document.getElementById(id);
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ').trim().toLowerCase();

// Símbolo y color por comando (solo presentación; el nombre real sale de la API).
const ICONOS = {
  'avanzar': ['▲', 'mov'], 'retroceder': ['▼', 'mov'], 'girar izquierda': ['◀', 'mov'], 'girar derecha': ['▶', 'mov'],
  'subir brazo': ['▲', 'brazo'], 'bajar brazo': ['▼', 'brazo'], 'cerrar pala': ['◀', 'brazo'], 'abrir pala': ['▶', 'brazo'],
  'luz encender': ['✦', 'fun'], 'luz apagar': ['✧', 'fun'], 'silencio activar': ['♪', 'fun'], 'silencio desactivar': ['♫', 'fun'],
  'detener': ['■', 'stop'], 'demo': ['★', 'fun'],
};

// Todo el texto remoto entra con textContent.
export function renderUltimo(u, vehiculo) {
  $('ult-vehiculo').textContent = vehiculo || '—';
  if (!u) {
    $('ult-icono').textContent = '–';
    $('ult-icono').className = 'ult-icono';
    $('ult-nombre').textContent = 'Sin movimientos';
    $('ult-fecha').textContent = '—';
    $('ult-hora').textContent = '—';
    $('ult-fuente').textContent = '';
    return;
  }
  const [glifo, grupo] = ICONOS[norm(u.comando)] ?? ['●', 'fun'];
  $('ult-icono').textContent = glifo;
  $('ult-icono').className = 'ult-icono ic-' + grupo;
  $('ult-nombre').textContent = String(u.comando).replace(/_/g, ' ');
  $('ult-fecha').textContent = fecha(u.marca);
  $('ult-hora').textContent = hora(u.marca);
  $('ult-fuente').textContent = `${u.codigo != null ? 'Código ' + u.codigo + ' · ' : ''}Fuente: ${u.fuente}`;
}

export function setVigencia(vigente) {
  $('ult-aviso').textContent = vigente ? '' : 'Sin datos actualizados: WebSocket sin conexión. Se muestra el último valor conocido.';
}

export function setSync(estado, detalle = '') {
  const el = $('hist-estado');
  el.className = 'hist-estado' + (estado === 'error' ? ' error' : '');
  el.textContent = estado === 'cargando' ? 'Sincronizando…'
    : estado === 'ok' ? `Última consulta ${hora(Date.now())} · REST`
    : `Error: ${detalle}`;
}

let firmaTabla = null;

export function mensajeTabla(texto) {
  firmaTabla = null;
  const cuerpo = $('hist-cuerpo');
  cuerpo.replaceChildren();
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 4;
  td.className = 'vacio';
  td.textContent = texto;
  tr.append(td);
  cuerpo.append(tr);
}

// filas: [{ id, comando, marca }] ya ordenadas y limitadas a 10. Solo se redibuja si cambian.
export function renderTabla(filas) {
  const firma = filas.map(f => f.id).join(',');
  if (firma === firmaTabla) return;
  if (!filas.length) { mensajeTabla('Sin registros'); firmaTabla = ''; return; }
  firmaTabla = firma;
  const cuerpo = $('hist-cuerpo');
  cuerpo.replaceChildren();
  filas.forEach((f, i) => {
    const tr = document.createElement('tr');
    if (i === 0) tr.className = 'nueva';
    [String(i + 1), String(f.comando).replace(/_/g, ' '), fecha(f.marca), hora(f.marca)].forEach(texto => {
      const td = document.createElement('td');
      td.textContent = texto;
      tr.append(td);
    });
    cuerpo.append(tr);
  });
}
