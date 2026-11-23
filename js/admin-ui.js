import { CONFIG } from './config.js?v=13';
import { parseMarca, fecha, hora } from './format.js?v=13';

// Todo el texto (propio o remoto) entra con textContent / createTextNode: nunca innerHTML.
let contador = 0;
export const uid = () => `a${++contador}`;

export function el(tag, props = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) {
    if (h == null || h === false) continue;
    e.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return e;
}

export const marcaMs = v => parseMarca(v, CONFIG.DB_FECHAS_EN_UTC);
export const fmt = v => { const t = marcaMs(v); return t == null ? '—' : `${fecha(t)} ${hora(t)}`; };
export const insignia = (texto, tipo = '') => el('span', { class: 'insignia ' + tipo }, texto);
export const boton = (texto, onClick, { clase = '', titulo, deshabilitado = false } = {}) =>
  el('button', { type: 'button', class: 'btn-a ' + clase, title: titulo, disabled: deshabilitado, onClick }, texto);

// Acción destructiva: el primer clic pide confirmar (3,5 s); el segundo la ejecuta.
export function botonConfirmar(texto, onConfirmar, { clase = 'peligro mini', pregunta = '¿Seguro?' } = {}) {
  let t = null;
  const b = boton(texto, async () => {
    if (t === null) {
      b.textContent = pregunta;
      b.classList.add('confirmar');
      t = setTimeout(reiniciar, 3500);
      return;
    }
    reiniciar();
    await onConfirmar();
  }, { clase });
  function reiniciar() { clearTimeout(t); t = null; b.textContent = texto; b.classList.remove('confirmar'); }
  return b;
}

export function campo(etiqueta, control, { ancho = false } = {}) {
  if (!control.id) control.id = uid();
  return el('div', { class: 'campo' + (ancho ? ' ancho' : '') }, el('label', { for: control.id }, etiqueta), control);
}

export function selector(opciones, valor, props = {}) {
  const s = el('select', { class: 'form-select', ...props },
    opciones.map(o => el('option', { value: String(o.valor) }, o.texto)));
  if (valor !== undefined && valor !== null) s.value = String(valor);
  return s;
}

export function tabla(columnas, filas, { vacio = 'Sin registros', claseFila, etiqueta = 'Tabla' } = {}) {
  if (!filas.length) return el('p', { class: 'adm-vacio' }, vacio);
  return el('div', { class: 'adm-tabla', tabindex: 0, role: 'region', 'aria-label': etiqueta },
    el('table', {},
      el('thead', {}, el('tr', {}, columnas.map(c => el('th', { scope: 'col' }, c.t)))),
      el('tbody', {}, filas.map(f =>
        el('tr', { class: claseFila ? claseFila(f) : '' }, columnas.map(c => el('td', { class: c.clase }, c.f(f))))))));
}

export const bloque = (titulo, ...hijos) =>
  el('section', { class: 'adm-bloque' }, titulo ? el('h3', {}, titulo) : null, hijos);

export const kpi = (valor, etiqueta) => el('div', { class: 'kpi' }, el('b', {}, valor), el('span', {}, etiqueta));

// Ejecuta una acción del formulario/tabla: deshabilita el botón, avisa y recarga la vista.
export async function accion(ctx, boton_, tarea, okMsg, { unidades = false } = {}) {
  if (boton_) boton_.disabled = true;
  try {
    await tarea();
    ctx.msg(okMsg, 'ok');
    if (unidades) await ctx.refrescarUnidades();
    ctx.refrescar();
  } catch (e) {
    ctx.msg(e.message, 'error');
    if (boton_) boton_.disabled = false;
  }
}

// Cuenta regresiva hasta fin_previsto (la hora la manda el servidor; esto es solo informativo).
export function cuentaRegresiva(ctx, fin) {
  const t = marcaMs(fin);
  const s = el('span', { class: 'cuenta' });
  const pintar = () => {
    const r = t == null ? 0 : Math.max(0, Math.round((t - Date.now()) / 1000));
    s.textContent = r > 0 ? `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}` : 'Vencida';
  };
  pintar();
  ctx.cada(1000, pintar);
  return s;
}

// Diálogo para pedir un texto (p. ej. una contraseña nueva). Devuelve el texto o null.
export function pedir({ titulo, etiqueta, tipo = 'password', minimo = 8 }) {
  return new Promise(resolver => {
    const id = uid();
    let valor = null;
    const entrada = el('input', { id, type: tipo, class: 'form-control', required: true, minLength: minimo, autocomplete: 'new-password' });
    const dlg = el('dialog', { class: 'adm-dlg', 'aria-label': titulo },
      el('form', { onSubmit: e => { e.preventDefault(); valor = entrada.value; dlg.close(); } },
        el('h2', {}, titulo),
        el('label', { for: id, class: 'form-label' }, etiqueta),
        entrada,
        el('div', { class: 'd-flex gap-2 mt-3' },
          el('button', { type: 'submit', class: 'key go' }, 'Guardar'),
          el('button', { type: 'button', class: 'key go quiet', onClick: () => dlg.close() }, 'Cancelar'))));
    dlg.addEventListener('close', () => { dlg.remove(); resolver(valor); });
    document.body.append(dlg);
    dlg.showModal();
    entrada.focus();
  });
}

// ---------------------------------------------------------------- gráficas (SVG, un solo color)
const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...hijos) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  hijos.forEach(h => e.append(h));
  return e;
}

// Barras verticales de una sola serie: valor rotulado sobre cada barra (son pocas), base recta y
// extremo superior redondeado de 4 px. El título nombra la serie, por eso no lleva leyenda.
export function graficaBarras(datos, descripcion) {
  const W = 320, H = 150, ml = 8, mr = 8, mt = 18, mb = 22;
  const base = H - mb, alto = base - mt;
  const max = Math.max(1, ...datos.map(d => d.valor));
  const paso = (W - ml - mr) / Math.max(1, datos.length);
  const ancho = Math.min(28, paso * 0.62);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': descripcion });
  svg.append(s('line', { class: 'g-linea', x1: ml, x2: W - mr, y1: base, y2: base }));
  datos.forEach((d, i) => {
    const x = ml + paso * i + (paso - ancho) / 2;
    const cx = x + ancho / 2;
    const h = d.valor > 0 ? Math.max(3, (d.valor / max) * alto) : 0;
    const y = base - h;
    if (h) {
      const r = Math.min(4, ancho / 2, h);
      svg.append(s('path', {
        class: 'g-barra',
        d: `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + ancho - r} Q${x + ancho},${y} ${x + ancho},${y + r} V${base} Z`,
      }, s('title', {}, document.createTextNode(`${d.etiqueta}: ${d.valor}`))));
    }
    svg.append(s('text', { class: d.valor ? 'g-val' : 'g-txt', x: cx, y: (h ? y : base) - 4 }, document.createTextNode(String(d.valor))));
    svg.append(s('text', { class: 'g-txt', x: cx, y: H - 6 }, document.createTextNode(d.etiqueta)));
  });
  return svg;
}

// Ranking horizontal (HTML): nombre, barra proporcional y valor.
export function ranking(items) {
  if (!items.length) return el('p', { class: 'adm-vacio' }, 'Sin datos todavía');
  const max = Math.max(1, ...items.map(i => i.valor));
  return el('div', { class: 'rank' }, items.map(i =>
    el('div', { class: 'rank-fila' },
      el('span', { class: 'rank-nom', title: i.nombre }, i.nombre),
      el('div', { class: 'rank-pista' }, el('div', { class: 'rank-barra', style: `width:${(i.valor / max) * 100}%` })),
      el('span', { class: 'rank-val' }, i.valor))));
}
