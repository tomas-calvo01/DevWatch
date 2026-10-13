/**
 * formatoFecha.js
 *
 * Formato único de fechas para todas las pantallas (historial de
 * comprobaciones de US12, incidentes de US13–US17 y notificaciones de
 * US23–US24), para que todas muestren la hora igual: 24 horas, es-AR.
 */
const FORMATO = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

// Devuelve por ejemplo "13/10/2026, 18:05:09". Si no hay fecha, "—".
export function formatearFecha(iso) {
  if (!iso) return "—";
  return FORMATO.format(new Date(iso));
}

// Los <input type="date"> devuelven "AAAA-MM-DD": se convierten al inicio
// y al fin de ese día en hora local, para que el rango sea inclusivo.
export function armarRango(desde, hasta) {
  return {
    desde: desde ? new Date(`${desde}T00:00:00`) : null,
    hasta: hasta ? new Date(`${hasta}T23:59:59.999`) : null,
  };
}
