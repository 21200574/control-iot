// Fechas: los eventos WebSocket traen zona explícita (UTC); las filas de MySQL llegan sin zona.
// Por defecto se interpretan como UTC (RDS usa UTC si no se configuró otra zona); ver DB_FECHAS_EN_UTC.
const CON_ZONA = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function parseMarca(valor, naiveEsUTC = true) {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  let s = valor.trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (!CON_ZONA.test(s) && naiveEsUTC) s += 'Z';
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

const FECHA = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
const HORA = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export const fecha = t => (t == null ? '—' : FECHA.format(t));
export const hora = t => (t == null ? '—' : HORA.format(t));
