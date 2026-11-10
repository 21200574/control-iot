# Control IoT — Etapa 1

Frontend modular (HTML5, CSS3, Bootstrap 5, JavaScript ES6+) para controlar el vehículo 1 mediante la API existente en AWS. No incluye backend.

## Interfaz
Pantalla única sin desplazamiento (celular vertical y horizontal, tableta y escritorio). Dos joysticks tipo radar: **Movimiento** (AVANZAR, RETROCEDER, GIRAR_IZQUIERDA, GIRAR_DERECHA) y **Brazo y pala** (SUBIR_BRAZO, BAJAR_BRAZO, CERRAR_PALA a la izquierda, ABRIR_PALA a la derecha). Entre ellos (en horizontal) o debajo (en vertical) están los botones: **Silencio** y **Luz** (interruptores: cada pulsación alterna entre dos comandos distintos, SILENCIO_ACTIVAR / SILENCIO_DESACTIVAR y LUZ_ENCENDER / LUZ_APAGAR, para que el WebSocket distinga cada acción; ver `comandos_luz_silencio.sql`), **un botón por cada DEMO** de la base de datos (un clic la ejecuta; hoy: DEMO 1 con los pasos del joystick de movimiento y DEMO 2 con los del joystick de brazo y pala; ver `limpieza_demos.sql`) y **DETENER** (cancela la DEMO y envía el comando DETENER). Seguimiento de la última acción (solicitado, aceptado por la API, evento WebSocket) y tres indicadores: WebSocket WSS, Servidor AWS y Amazon RDS. El token se escribe en «Acceso».

El estado de Silencio y Luz lo lleva la pantalla (la base solo guarda el último comando) y se reinicia al recargar. Los comandos se enlazan por nombre con `GET /vehiculos/1/comandos` (ver `NOMBRES` en `js/config.js`). Al soltar un joystick se envía DETENER.

## Estructura
`index.html` · `css/styles.css` · `assets/favicon.svg` · `servidor.py` (pruebas locales) · `js/`: `config`, `api` (Fetch), `commands` (único envío de comandos y prioridad de DETENER), `joystick`, `demo`, `websocket`, `health`, `ui`, `app`.

## Ejecución local
`python servidor.py` dentro de esta carpeta y abrir `http://localhost:8080`.

## Integración con la API
- GET sin token: `/vehiculos/1`, `/vehiculos/1/comandos`, `/vehiculos/1/demos`, `/demos/{id}/movimientos`, `GET /` (comprobación de la API).
- POST con encabezado `X-Admin-Token`: `/movimiento`, `/demos/{id}/ejecutar`, `/vehiculos/1/demos/cancelar`. El token solo vive en memoria.
- WebSocket `wss://…/ws/vehiculos/1`: el navegador ofrece el token como subprotocolo `auth.<base64url>`.
- Amazon RDS aparece como «Sin verificar» mientras el backend no exponga un diagnóstico propio (`DB_HEALTH_PATH`).

## Publicación
GitHub Pages desde la rama `main`, carpeta raíz. Todas las rutas son relativas.

## Alcance
Un evento WebSocket confirma la publicación por el backend, no el movimiento físico. No hay monitoreo, administración ni control del ESP.
