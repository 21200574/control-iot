const VISTAS = ['control', 'monitoreo', 'administracion'];
const TITULOS = { control: 'Control IoT', monitoreo: 'Monitoreo IoT', administracion: 'Administración IoT' };

// Navegación por hash (#control / #monitoreo / #administracion): funciona en la subruta de GitHub Pages.
export function createNav({ onChange }) {
  const app = document.querySelector('.app');
  const enlaces = document.querySelectorAll('.nav-vistas a');

  function aplicar() {
    const pedida = location.hash.slice(1);
    const vista = VISTAS.includes(pedida) ? pedida : 'control';
    app.dataset.vista = vista;
    document.title = TITULOS[vista];
    enlaces.forEach(a => {
      if (a.getAttribute('href') === '#' + vista) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    onChange(vista);
  }

  window.addEventListener('hashchange', aplicar);
  aplicar();
}
