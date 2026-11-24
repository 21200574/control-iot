import { http } from './api.js?v=14';
import { el, bloque, tabla, boton, botonConfirmar, campo, selector, insignia, accion } from './admin-ui.js?v=14';

// Mismos límites que el servidor (demos_router.py); el servidor vuelve a validar todo.
const MAX_PASOS = 50, MIN_DUR = 200, MAX_DUR = 10000, MAX_PAUSA = 10000, MAX_TOTAL = 300000;
const NO_PASO = new Set(['DEMO', 'DETENER']);
const bonito = s => String(s ?? '').replace(/_/g, ' ');

export async function vistaDemos(out, ctx) {
  const unidades = (ctx.getUnidades() ?? []).filter(u => u.activo !== false);
  if (!unidades.length) return out.append(el('p', { class: 'adm-vacio' }, 'No hay unidades disponibles para editar demos.'));

  let idU = Number(sessionStorageSafe('demoUnidad')) || unidades[0].id_vehiculo;
  if (!unidades.some(u => u.id_vehiculo === idU)) idU = unidades[0].id_vehiculo;

  const sel = selector(unidades.map(u => ({ valor: u.id_vehiculo, texto: u.nombre })), idU);
  const zona = el('div', { class: 'adm-bloque' });
  sel.addEventListener('change', () => { idU = Number(sel.value); guardarSafe('demoUnidad', idU); cargar(); });
  out.append(bloque('Demos', el('div', { class: 'adm-form' }, campo('Unidad', sel)), zona));
  await cargar();

  async function cargar() {
    zona.replaceChildren(el('p', { class: 'adm-cargando' }, 'Cargando…'));
    try {
      const [demos, comandos] = await Promise.all([http.get(`/vehiculos/${idU}/demos`), http.get(`/vehiculos/${idU}/comandos`)]);
      pintar(demos, comandos.filter(c => c.activo && !NO_PASO.has(c.nombre)));
    } catch (e) { zona.replaceChildren(el('p', { class: 'adm-vacio' }, e.message)); }
  }

  function puedeEditar(d) { return ctx.rol === 'ADMIN' || (d.tipo === 'PRIVADA' && d.id_propietario === ctx.usuario.id_usuario); }

  function pintar(demos, pasosPosibles) {
    const editor = el('div', { class: 'adm-bloque' });
    zona.replaceChildren(
      tabla([
        { t: 'Demo', f: d => d.nombre },
        { t: 'Tipo', f: d => insignia(d.tipo === 'FABRICA' ? 'Fábrica' : 'Privada', d.tipo === 'FABRICA' ? 'acc' : 'orq') },
        { t: 'Descripción', f: d => d.descripcion ?? '—' },
        { t: '', clase: 'acc', f: d => (puedeEditar(d) ? [
          boton('Editar', () => abrir(d), { clase: 'mini' }),
          botonConfirmar('Eliminar', () => accion(ctx, null, () => http.del(`/demos/${d.id_demo}`), 'Demo eliminada')),
        ] : '') },
      ], demos, { vacio: 'Esta unidad aún no tiene demos', etiqueta: 'Demos de la unidad' }),
      boton('+ Nueva demo', () => abrir(null), { clase: 'prim' }),
      editor,
    );

    async function abrir(demo) {
      editor.replaceChildren(el('p', { class: 'adm-cargando' }, 'Cargando…'));
      let pasos = [];
      if (demo) {
        try {
          const movs = await http.get(`/demos/${demo.id_demo}/movimientos`);
          pasos = movs.sort((a, b) => a.orden - b.orden)
            .map(m => ({ id_comando: m.id_comando, duracion_ms: m.duracion_ms, pausa_ms: m.pausa_ms }));
        } catch (e) { return ctx.msg(e.message, 'error'); }
      } else pasos = [{ id_comando: pasosPosibles[0]?.id_comando, duracion_ms: 1000, pausa_ms: 500 }];
      editorDemo(editor, demo, pasos, pasosPosibles);
    }
  }

  function editorDemo(editor, demo, pasos, posibles) {
    if (!posibles.length) return editor.replaceChildren(el('p', { class: 'adm-vacio' }, 'La unidad no tiene comandos activos para usar como pasos.'));
    const nombre = el('input', { type: 'text', class: 'form-control', required: true, minLength: 2, maxLength: 80, value: demo?.nombre ?? '' });
    const desc = el('input', { type: 'text', class: 'form-control', maxLength: 255, value: demo?.descripcion ?? '' });
    const tipo = ctx.rol === 'ADMIN' && !demo
      ? selector([{ valor: 'FABRICA', texto: 'De fábrica (todas las cuentas autorizadas)' }, { valor: 'PRIVADA', texto: 'Privada (solo para mí)' }]) : null;
    const lista = el('div', { class: 'pasos' });
    const total = el('p', { class: 'adm-nota', 'aria-live': 'polite' });
    const err = el('p', { class: 'adm-msg error', role: 'alert' });
    const enviar = el('button', { type: 'submit', class: 'btn-a prim' }, demo ? 'Guardar cambios' : 'Crear demo');

    function validar() {
      const ms = pasos.reduce((a, p) => a + p.duracion_ms + p.pausa_ms, 0);
      total.textContent = `${pasos.length} paso(s) · duración total ${(ms / 1000).toFixed(1)} s (máx. ${MAX_TOTAL / 1000} s)`;
      let m = '';
      if (!pasos.length) m = 'Agrega al menos un paso';
      else if (pasos.length > MAX_PASOS) m = `Máximo ${MAX_PASOS} pasos`;
      else if (ms > MAX_TOTAL) m = `La demo no puede durar más de ${MAX_TOTAL / 1000} s`;
      else if (pasos.some(p => !(p.duracion_ms >= MIN_DUR && p.duracion_ms <= MAX_DUR))) m = `Cada duración debe estar entre ${MIN_DUR} y ${MAX_DUR} ms`;
      else if (pasos.some(p => !(p.pausa_ms >= 0 && p.pausa_ms <= MAX_PAUSA))) m = `Cada pausa debe estar entre 0 y ${MAX_PAUSA} ms`;
      err.textContent = m;
      enviar.disabled = Boolean(m);
    }

    function num(valor, p, k) {
      const i = el('input', { type: 'number', class: 'form-control', value: String(valor), step: 100, min: 0, 'aria-label': k });
      i.addEventListener('input', () => { p[k] = Math.round(Number(i.value)); validar(); });
      return i;
    }

    function pintarPasos() {
      lista.replaceChildren(...pasos.map((p, i) => {
        const cmd = selector(posibles.map(c => ({ valor: c.id_comando, texto: bonito(c.nombre) })), p.id_comando, { 'aria-label': `Comando del paso ${i + 1}` });
        cmd.addEventListener('change', () => { p.id_comando = Number(cmd.value); });
        if (![...cmd.options].some(o => Number(o.value) === p.id_comando)) {
          cmd.prepend(el('option', { value: String(p.id_comando) }, `Comando ${p.id_comando} (no disponible)`));
          cmd.value = String(p.id_comando);
        }
        return el('div', { class: 'paso' },
          el('span', { class: 'n' }, String(i + 1)),
          el('div', { class: 'campo cmd' }, el('label', {}, 'Comando'), cmd),
          el('div', { class: 'campo' }, el('label', {}, 'Duración (ms)'), num(p.duracion_ms, p, 'duracion_ms')),
          el('div', { class: 'campo' }, el('label', {}, 'Pausa (ms)'), num(p.pausa_ms, p, 'pausa_ms')),
          el('div', { class: 'btns' },
            boton('↑', () => mover(i, -1), { clase: 'mini', titulo: 'Subir', deshabilitado: i === 0 }),
            boton('↓', () => mover(i, 1), { clase: 'mini', titulo: 'Bajar', deshabilitado: i === pasos.length - 1 }),
            boton('✕', () => { pasos.splice(i, 1); pintarPasos(); }, { clase: 'mini peligro', titulo: 'Quitar paso' })));
      }));
      validar();
    }
    function mover(i, d) { [pasos[i], pasos[i + d]] = [pasos[i + d], pasos[i]]; pintarPasos(); }
    pintarPasos();

    editor.replaceChildren(el('form', {
      class: 'adm-form-col', onSubmit: e => {
        e.preventDefault();
        validar();
        if (enviar.disabled) return;
        const cuerpo = { nombre: nombre.value.trim(), descripcion: desc.value.trim() || null, pasos };
        if (tipo) cuerpo.tipo = tipo.value;
        accion(ctx, enviar,
          () => (demo ? http.put(`/demos/${demo.id_demo}`, cuerpo) : http.post(`/vehiculos/${idU}/demos`, cuerpo)),
          demo ? 'Demo actualizada' : 'Demo creada');
        // recarga CONTROL para que muestre los botones de la demo
        // CONTROL recarga las demos al volver a esa pestaña
      },
    },
    el('h3', {}, demo ? `Editar «${demo.nombre}»` : 'Nueva demo'),
    el('div', { class: 'adm-form' }, campo('Nombre', nombre), campo('Descripción', desc), tipo ? campo('Tipo', tipo) : null),
    lista,
    boton('+ Agregar paso', () => { if (pasos.length < MAX_PASOS) { pasos.push({ id_comando: posibles[0].id_comando, duracion_ms: 1000, pausa_ms: 500 }); pintarPasos(); } }),
    total, err,
    el('div', { class: 'acciones d-flex gap-2' }, enviar, boton('Cancelar', () => editor.replaceChildren())),
    el('p', { class: 'adm-nota' }, 'DETENER y DEMO no pueden ser pasos. La demo se valida otra vez en el servidor.')));
  }
}

function sessionStorageSafe(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function guardarSafe(k, v) { try { sessionStorage.setItem(k, String(v)); } catch { /* sin almacenamiento */ } }
