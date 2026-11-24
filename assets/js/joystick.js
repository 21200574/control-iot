const ZONA_NEUTRA = 0.35;
const TECLAS = { ArrowUp: 'arriba', ArrowDown: 'abajo', ArrowLeft: 'izquierda', ArrowRight: 'derecha' };

// claves: dirección geométrica -> clave de comando (cada joystick tiene las suyas).
export function createJoystick(el, { claves, onDirection, onRelease }) {
  const knob = el.querySelector('.knob');
  let activo = false, actual = null, emitio = false;

  const liberar = () => { if (emitio) { emitio = false; onRelease(); } };

  // Solo emite al cambiar el comando efectivo, no por cada píxel.
  function cambiar(dir) {
    if (dir === actual) return;
    actual = dir;
    el.dataset.dir = dir ?? '';
    if (dir) { emitio = true; onDirection(claves[dir]); } else liberar();
  }

  function mover(e) {
    const r = el.getBoundingClientRect(), R = r.width / 2;
    let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
    if (m < ZONA_NEUTRA) return cambiar(null);
    cambiar(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'derecha' : 'izquierda') : (dy > 0 ? 'abajo' : 'arriba'));
  }

  function soltar() {
    if (!activo) return;
    activo = false; actual = null;
    el.dataset.dir = '';
    knob.style.transform = '';
    liberar();
  }

  el.addEventListener('pointerdown', e => { activo = true; el.setPointerCapture(e.pointerId); mover(e); });
  el.addEventListener('pointermove', e => { if (activo) mover(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, soltar));
  el.addEventListener('keydown', e => { const d = TECLAS[e.key]; if (d) { e.preventDefault(); cambiar(d); } });
  el.addEventListener('keyup', e => { if (TECLAS[e.key]) { actual = null; el.dataset.dir = ''; liberar(); } });
}
