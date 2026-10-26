// utils/fechas.js
// Validación de fechas ISO 8601 de los filtros de las rutas (historial de
// comprobaciones, listado de incidentes). Compartido entre módulos.

// Fecha ISO 8601 estricta (con día/mes/hora reales: 2026-02-30 se rechaza).
const REGEX_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

// Devuelve un Date o null si el valor no es una fecha ISO válida.
// Una fecha sin hora (2026-01-31) se toma como medianoche UTC.
export function parsearFechaIso(valor) {
  if (typeof valor !== "string") return null;
  const m = REGEX_ISO.exec(valor);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const calendario = new Date(Date.UTC(anio, mes - 1, dia));
  if (calendario.getUTCFullYear() !== anio || calendario.getUTCMonth() !== mes - 1 || calendario.getUTCDate() !== dia) {
    return null;
  }
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}
