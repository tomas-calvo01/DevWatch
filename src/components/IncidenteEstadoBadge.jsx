/**
 * Etiqueta de estado de un incidente, reutilizable en el listado (US13),
 * el detalle y la línea de tiempo del historial (US14, US15, US16).
 *
 * `estado` es uno del flujo: "Detectado", "Investigando", "Identificado",
 * "Resuelto" o "Cerrado". Los colores salen de las variables de App.css.
 */
const ESTADOS = {
  Detectado: "badge-down",
  Investigando: "badge-investigando",
  Identificado: "badge-identificado",
  Resuelto: "badge-up",
  Cerrado: "badge-pausado",
};

export default function IncidenteEstadoBadge({ estado }) {
  const clase = ESTADOS[estado] || "badge-pausado";
  return <span className={`badge ${clase}`}>{estado || "Sin datos"}</span>;
}
