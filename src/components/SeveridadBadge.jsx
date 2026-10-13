/**
 * Etiqueta de severidad de un incidente (US17), reutilizable en el
 * listado y en el detalle de incidentes.
 *
 * `severidad` puede ser "Crítica", "Alta", "Media" o "Baja".
 * Los colores salen de las variables de App.css.
 */
const SEVERIDADES = {
  Crítica: "badge-critica",
  Alta: "badge-alta",
  Media: "badge-media",
  Baja: "badge-baja",
};

export default function SeveridadBadge({ severidad }) {
  const clase = SEVERIDADES[severidad] || "badge-pausado";
  return <span className={`badge ${clase}`}>{severidad || "Sin datos"}</span>;
}
