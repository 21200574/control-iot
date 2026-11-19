import { el, boton } from './admin-ui.js?v=11';
import { ROLES } from './auth.js?v=11';
import * as V from './admin-vistas.js?v=11';
import { vistaDemos } from './admin-demos.js?v=11';
import { vistaInvitados } from './admin-invitados.js?v=11';

// Cada rol ve solo sus secciones; el servidor vuelve a validar cada operación.
const TABS = {
  ADMIN: [
    ['resumen', 'Resumen', V.resumen], ['unidades', 'Unidades', V.unidades], ['modelos', 'Modelos', V.modelos],
    ['clientes', 'Clientes', V.clientes], ['asignaciones', 'Asignaciones', V.asignaciones],
    ['invitados', 'Invitados', vistaInvitados], ['demos', 'Demos', vistaDemos], ['auditoria', 'Auditoría', V.auditoria],
  ],
  USUARIO: [
    ['vehiculos', 'Mis vehículos', V.misVehiculos], ['demos', 'Demos', vistaDemos], ['invitados', 'Invitados', vistaInvitados],
  ],
  INVITADO: [['sesion', 'Mi sesión', V.miSesion]],
};

export function createAdmin({ contenedor, tabs, mensaje, rolEtiqueta, getUnidades, refrescarUnidades, controlar, abrirLogin }) {
  let usuario = null, activa = null, visible = false, limpiezas = [], gen = 0, tMsg = null;

  function msg(texto, tipo = 'info') {
    clearTimeout(tMsg);
    mensaje.textContent = texto;
    mensaje.className = 'adm-msg ' + (texto ? tipo : '');
    if (texto) tMsg = setTimeout(() => msg(''), 8000);
  }

  function limpiar() {
    limpiezas.forEach(f => { try { f(); } catch { /* ya liberado */ } });
    limpiezas = [];
  }

  function pintarTabs() {
    tabs.replaceChildren();
    (TABS[usuario?.rol] ?? []).forEach(([id, texto]) => {
      tabs.append(el('button', {
        type: 'button', class: 'adm-tab', role: 'tab', id: 'tab-' + id, 'aria-selected': String(id === activa),
        tabindex: id === activa ? '0' : '-1', onClick: () => ir(id),
      }, texto));
    });
  }

  function pintarSinSesion() {
    tabs.replaceChildren();
    rolEtiqueta.textContent = '';
    contenedor.replaceChildren(
      el('p', { class: 'adm-vacio' }, 'Inicia sesión para usar la administración.'),
      boton('Iniciar sesión', abrirLogin, { clase: 'prim' }),
    );
  }

  async function render() {
    limpiar();
    if (!usuario) return pintarSinSesion();
    const def = (TABS[usuario.rol] ?? []).find(t => t[0] === activa);
    if (!def) return;
    const mia = ++gen;
    const scroll = contenedor.scrollTop;
    const salida = el('div', { class: 'adm-vista adm-cuerpo-int' });
    const ctx = {
      usuario, rol: usuario.rol, msg, getUnidades, refrescarUnidades, controlar,
      refrescar: () => render(),
      cada(ms, f) { if (mia !== gen) return; const id = setInterval(f, ms); limpiezas.push(() => clearInterval(id)); },
      alLimpiar(f) { if (mia === gen) limpiezas.push(f); },
    };
    if (!contenedor.firstChild) contenedor.append(el('p', { class: 'adm-cargando' }, 'Cargando…'));
    try {
      await def[2](salida, ctx);
    } catch (e) {
      if (mia !== gen) return;
      salida.replaceChildren(
        el('p', { class: 'adm-vacio' }, e.message || 'No se pudo cargar esta sección'),
        boton('Reintentar', () => render(), { clase: 'prim' }),
      );
    }
    if (mia !== gen) return;                 // se cambió de sección mientras cargaba
    contenedor.replaceChildren(...salida.childNodes);
    contenedor.scrollTop = scroll;
  }

  function ir(id) {
    activa = id;
    msg('');
    pintarTabs();
    tabs.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    contenedor.replaceChildren(el('p', { class: 'adm-cargando' }, 'Cargando…'));
    render();
  }

  // Flechas izquierda/derecha entre pestañas (patrón WAI-ARIA de pestañas)
  tabs.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const lista = TABS[usuario?.rol] ?? [];
    const i = lista.findIndex(t => t[0] === activa);
    if (i < 0) return;
    const sig = lista[(i + (e.key === 'ArrowRight' ? 1 : lista.length - 1)) % lista.length][0];
    ir(sig);
    tabs.querySelector('[aria-selected="true"]')?.focus();
    e.preventDefault();
  });

  return {
    onSesion(u) {
      usuario = u;
      msg('');
      if (!u) { activa = null; limpiar(); gen++; if (visible) pintarSinSesion(); else tabs.replaceChildren(); return; }
      activa = TABS[u.rol]?.[0]?.[0] ?? null;
      rolEtiqueta.textContent = ROLES[u.rol] ?? u.rol;
      pintarTabs();
      if (visible) render();
    },
    activar() { visible = true; if (!usuario) pintarSinSesion(); else render(); },
    desactivar() { visible = false; limpiar(); gen++; },
    refrescarSiVisible() { if (visible && usuario) render(); },
  };
}
