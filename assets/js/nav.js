const VISTAS = ['control', 'monitoreo', 'administracion'];
const TITULOS = { control: 'Control IoT', monitoreo: 'Monitoreo IoT', administracion: 'Administración IoT' };

// Navegación por hash (#control / #monitoreo / #administracion): funciona en la subruta de GitHub Pages.
export function createNav({ onChange }) {
  const app = document.querySelector('.app');
  const enlaces = document.querySelectorAll('.nav-vistas a');
  let permitidas = VISTAS;

  function aplicar() {
    const pedida = location.hash.slice(1);
    const vista = permitidas.includes(pedida) ? pedida : 'control';
    if (pedida && pedida !== vista) history.replaceState(null, '', '#' + vista);
    app.dataset.vista = vista;
    document.title = TITULOS[vista];
    enlaces.forEach(a => {
      a.hidden = !permitidas.includes(a.getAttribute('href').slice(1));
      if (a.getAttribute('href') === '#' + vista) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    onChange(vista);
  }

  window.addEventListener('hashchange', aplicar);
  aplicar();
  // Vistas que la persona actual puede abrir (el invitado solo tiene CONTROL).
  return { permitir(lista) { permitidas = lista; aplicar(); } };
}
