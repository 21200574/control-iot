// Sin secretos: el token se escribe en la interfaz y vive solo en memoria.
export const CONFIG = {
  API_BASE: 'https://iot.leonardoalvarezperez.com',
  WS_BASE: 'wss://iot.leonardoalvarezperez.com',
  VEHICLE_ID: 1,
  HEALTH_PATH: '/',        // única ruta ligera existente en tu API (GET /)
  DB_HEALTH_PATH: null,    // el backend no expone diagnóstico de RDS: se muestra «Sin verificar»
  HEALTH_EVERY_MS: 15000,
  DB_FECHAS_EN_UTC: true,  // las fechas de MySQL llegan sin zona; RDS usa UTC por defecto. Si salen desfasadas, cambia a false
  TIMEOUT_MS: 8000,
};

// Nombres del catálogo aceptados para cada acción. Se comparan sin acentos, en minúsculas
// y con «_» como espacio (AVANZAR, GIRAR_IZQUIERDA, SUBIR_BRAZO...).
export const NOMBRES = {
  adelante: ['avanzar', 'adelante'],
  atras: ['retroceder', 'atras'],
  izquierda: ['girar izquierda', 'giro izquierda', 'izquierda'],
  derecha: ['girar derecha', 'giro derecha', 'derecha'],
  brazo_arriba: ['subir brazo'],
  brazo_abajo: ['bajar brazo'],
  pala_abrir: ['abrir pala'],
  pala_cerrar: ['cerrar pala'],
  silencio_on: ['silencio activar'],
  silencio_off: ['silencio desactivar'],
  luz_on: ['luz encender'],
  luz_off: ['luz apagar'],
  detener: ['detener'],
};
