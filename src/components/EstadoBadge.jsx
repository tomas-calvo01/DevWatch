/**
 * Etiqueta de estado reutilizable del Módulo de Servicios (actividad 2.2)
 * y del Dashboard (actividad 2.3). La usan el listado (US08: estado /
 * "Pausado"), la cabecera del detalle, la tabla del historial de
 * comprobaciones (US12) y la tabla de servicios del Dashboard (US18).
 *
 * `estado` puede ser el de una comprobación ("UP", "DOWN", "TIMEOUT"), el
 * de un servicio en el Dashboard ("Activo", "Degradado", "Caído") o
 * "PAUSADO" / "Pausado". Si no hay comprobaciones todavía (null) se
 * muestra "Sin datos".
 * Los colores salen de las variables de App.css.
 */
const ESTADOS = {
  UP: { texto: "UP", clase: "badge-up" },
  DOWN: { texto: "DOWN", clase: "badge-down" },
  TIMEOUT: { texto: "TIMEOUT", clase: "badge-down" },
  PAUSADO: { texto: "Pausado", clase: "badge-pausado" },
  Activo: { texto: "Activo", clase: "badge-up" },
  Degradado: { texto: "Degradado", clase: "badge-degradado" },
  Caído: { texto: "Caído", clase: "badge-down" },
  Pausado: { texto: "Pausado", clase: "badge-pausado" },
};

export default function EstadoBadge({ estado }) {
  const { texto, clase } = ESTADOS[estado] || { texto: "Sin datos", clase: "badge-pausado" };
  return <span className={`badge ${clase}`}>{texto}</span>;
}
