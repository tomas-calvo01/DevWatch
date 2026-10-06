/**
 * Etiqueta de estado reutilizable del Módulo de Servicios (actividad 2.2).
 * La usan el listado (US08: estado / "Pausado"), la cabecera del detalle
 * y la tabla del historial de comprobaciones (US12).
 *
 * `estado` puede ser "UP", "DOWN", "TIMEOUT" o "PAUSADO". Si no hay
 * comprobaciones todavía (null) se muestra "Sin datos".
 * Los colores salen de las variables de App.css.
 */
const ESTADOS = {
  UP: { texto: "UP", clase: "badge-up" },
  DOWN: { texto: "DOWN", clase: "badge-down" },
  TIMEOUT: { texto: "TIMEOUT", clase: "badge-down" },
  PAUSADO: { texto: "Pausado", clase: "badge-pausado" },
};

export default function EstadoBadge({ estado }) {
  const { texto, clase } = ESTADOS[estado] || { texto: "Sin datos", clase: "badge-pausado" };
  return <span className={`badge ${clase}`}>{texto}</span>;
}
