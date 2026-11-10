# Control IoT — Etapa 1

Frontend modular (HTML5, CSS3, Bootstrap 5, JavaScript ES6+) para controlar el vehículo 1 mediante la API existente en AWS. No incluye backend.

## Interfaz
Pantalla única sin desplazamiento (celular vertical y horizontal, tableta y escritorio). Dos joysticks tipo radar: **Movimiento** (AVANZAR, RETROCEDER, GIRAR_IZQUIERDA, GIRAR_DERECHA) y **Brazo y pala** (SUBIR_BRAZO, BAJAR_BRAZO, CERRAR_PALA a la izquierda, ABRIR_PALA a la derecha). Entre ellos (en horizontal) o debajo (en vertical) están los botones: **Silencio** y **Luz** (interruptores: cada pulsación alterna entre dos comandos distintos, SILENCIO_ACTIVAR / SILENCIO_DESACTIVAR y LUZ_ENCENDER / LUZ_APAGAR, para que el WebSocket distinga cada acción; ver `comandos_luz_silencio.sql`), **un botón por cada DEMO** de la base de datos (un clic la ejecuta; hoy: DEMO 1 con los pasos del joystick de movimiento y DEMO 2 con los del joystick de brazo y pala; ver `limpieza_demos.sql`) y **DETENER** (cancela la DEMO y envía el comando DETENER). Seguimiento de la última acción (solicitado, aceptado por la API, evento WebSocket) y tres indicadores: WebSocket WSS, Servidor AWS y Amazon RDS. El token se escribe en «Acceso».

El estado de Silencio y Luz lo lleva la pantalla (la base solo guarda el último comando) y se reinicia al recargar. Los comandos se enlazan por nombre con `GET /vehiculos/1/comandos` (ver `NOMBRES` en `js/config.js`). Al soltar un joystick se envía DETENER.

## Monitoreo (práctica 4.2)
La misma aplicación tiene dos vistas, **CONTROL** y **MONITOREO**, con navegación por `#control` / `#monitoreo` (mismo repositorio y mismo GitHub Pages). MONITOREO muestra la tarjeta del **último movimiento** y la tabla de los **10 movimientos individuales más recientes** (# · Movimiento · Fecha · Hora), con los mismos tres indicadores de conectividad.

- **Carga inicial y recuperación (REST):** `GET /vehiculos/1/estado` y `GET /vehiculos/1/historial` (la API ya devuelve los 10 más recientes, del más nuevo al más antiguo). Se repite al abrir MONITOREO y al reconectar el WebSocket.
- **Tiempo real (WSS):** una sola conexión compartida por ambas vistas. `movimiento_manual` actualiza la tarjeta y dispara una consulta del historial confirmado; `demo_movimiento` actualiza solo la tarjeta, porque los pasos de una DEMO no se guardan en el historial. No hay polling del historial.
- **Orden y duplicados:** se ignoran eventos de otro vehículo, repetidos o fuera de orden; una respuesta REST atrasada no sobrescribe un evento más nuevo; la tabla se ordena por `id_historial` y se limita a 10.
- **Fechas:** los eventos WSS traen zona (UTC); las filas de MySQL llegan sin zona y se interpretan como UTC (`DB_FECHAS_EN_UTC` en `js/config.js`). Se muestran en la hora local del dispositivo.
- **Módulos nuevos:** `nav.js` (vistas), `monitor.js` (estado, REST y eventos), `monitor-ui.js` (DOM seguro) y `format.js` (fecha y hora).
- Un evento recibido confirma que el backend lo publicó; no que el vehículo se haya movido.

## Estructura
`index.html` · `css/styles.css` · `assets/favicon.svg` · `servidor.py` (pruebas locales) · `js/`: `config`, `api` (Fetch), `commands` (único envío de comandos y prioridad de DETENER), `joystick`, `demo`, `websocket`, `health`, `ui`, `app`.

## Ejecución local
`python servidor.py` dentro de esta carpeta y abrir `http://localhost:8080`.

## Integración con la API
- GET sin token: `/vehiculos/1`, `/vehiculos/1/comandos`, `/vehiculos/1/demos`, `/demos/{id}/movimientos`, `GET /` (comprobación de la API).
- POST con encabezado `X-Admin-Token`: `/movimiento`, `/demos/{id}/ejecutar`, `/vehiculos/1/demos/cancelar`. El token solo vive en memoria.
- WebSocket `wss://…/ws/vehiculos/1`: el navegador ofrece el token como subprotocolo `auth.<base64url>`.
- Amazon RDS aparece como «Sin verificar» mientras el backend no exponga un diagnóstico propio (`DB_HEALTH_PATH`).

## Versión de los archivos
Para que el navegador no mezcle archivos viejos con nuevos (caché), el CSS y los módulos JS se cargan con `?v=10`. Al publicar cambios, sustituye ese número en `index.html` y en los `import` de la carpeta `js/` (con buscar y reemplazar en todo el proyecto, por ejemplo `?v=10` por `?v=11`).

## Publicación
GitHub Pages desde la rama `main`, carpeta raíz. Todas las rutas son relativas.

## Alcance
Un evento WebSocket confirma la publicación por el backend, no el movimiento físico. No hay monitoreo, administración ni control del ESP.
