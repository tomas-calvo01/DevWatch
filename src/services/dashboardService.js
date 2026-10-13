/**
 * dashboardService.js
 *
 * Calcula los indicadores del Dashboard (actividad 2.3 de la EDT, parte 2).
 * No guarda nada propio: arma todo a partir de serviciosService.js e
 * incidentesService.js, así que cuando exista el Backend real este cálculo
 * pasa a ser un endpoint y la pantalla no cambia.
 *
 * Historias de usuario que cubre:
 * - US18 — Estado actual de cada servicio (activo, degradado, caído).
 * - US19 — Uptime sobre un período configurable.
 * - US20 — MTTR (tiempo medio de resolución) calculado automáticamente.
 * - US21 — Contador de incidentes activos.
 * - US22 — Historial básico de incidentes.
 */
import { listarIncidentes } from "./incidentesService";
import { listarServicios, obtenerComprobaciones } from "./serviciosService";

const MS_POR_MINUTO = 60 * 1000;
const MS_POR_DIA = 24 * 60 * MS_POR_MINUTO;
// Un servicio que responde está 'Degradado' si falló alguna de sus
// últimas comprobaciones.
const COMPROBACIONES_DEGRADADO = 5;
const CANTIDAD_INCIDENTES_RECIENTES = 5;

function promedio(valores) {
  if (valores.length === 0) return null;
  return valores.reduce((suma, v) => suma + v, 0) / valores.length;
}

function redondear(valor, decimales = 0) {
  if (valor === null) return null;
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

// US18 — El estado sale de las comprobaciones más recientes del servicio
// (ordenadas de la más nueva a la más vieja), sin importar el período.
function estadoDe(servicio, comprobaciones) {
  if (!servicio.activo) return "Pausado";
  if (comprobaciones.length === 0) return null;
  if (comprobaciones[0].estado !== "UP") return "Caído";
  const recientes = comprobaciones.slice(0, COMPROBACIONES_DEGRADADO);
  return recientes.some((c) => c.estado !== "UP") ? "Degradado" : "Activo";
}

// Serie del gráfico: promedio de tiempo de respuesta por día (o por hora
// si el período es de un día o menos, para que no quede en uno o dos
// puntos). Incluye los días sin datos, con promedio null.
function armarSerie(comprobaciones, desdeMs, hastaMs, porHora) {
  const inicioDeTramo = (ms) => {
    const fecha = new Date(ms);
    if (porHora) {
      fecha.setMinutes(0, 0, 0);
    } else {
      fecha.setHours(0, 0, 0, 0);
    }
    return fecha;
  };

  const tramos = new Map();
  const cursor = inicioDeTramo(desdeMs);
  while (cursor.getTime() <= hastaMs) {
    tramos.set(cursor.getTime(), []);
    if (porHora) {
      cursor.setHours(cursor.getHours() + 1);
    } else {
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const c of comprobaciones) {
    if (c.tiempo_respuesta_ms == null) continue;
    const tramo = tramos.get(inicioDeTramo(new Date(c.timestamp).getTime()).getTime());
    if (tramo) tramo.push(c.tiempo_respuesta_ms);
  }

  return Array.from(tramos, ([ms, tiempos]) => ({
    fecha: new Date(ms).toISOString(),
    tiempo_respuesta_promedio: redondear(promedio(tiempos)),
  }));
}

/**
 * Devuelve los datos del Dashboard del usuario logueado para los últimos
 * `dias` días:
 * - servicios: { id, nombre, estado, uptime, ultima_comprobacion,
 *   tiempo_respuesta_promedio } por cada servicio.
 * - resumen: conteos por estado, uptime promedio, incidentes y MTTR.
 * - serie: tiempo de respuesta promedio por día (`serie_por_hora` indica
 *   si los tramos son horas en vez de días).
 * - incidentes_recientes: los últimos incidentes, sin importar el período.
 * Los valores que no se pueden calcular por falta de datos vienen en null.
 */
export async function obtenerDashboard({ dias = 7 } = {}) {
  const hastaMs = Date.now();
  const desdeMs = hastaMs - dias * MS_POR_DIA;
  const enPeriodo = (iso) => new Date(iso).getTime() >= desdeMs;

  const [serviciosUsuario, incidentes] = await Promise.all([listarServicios(), listarIncidentes()]);
  // Se piden todas las comprobaciones (vienen de la más reciente a la más
  // antigua): el estado usa las últimas y los indicadores, las del período.
  const historiales = await Promise.all(serviciosUsuario.map((s) => obtenerComprobaciones(s.id)));

  const comprobacionesPeriodo = [];
  const servicios = serviciosUsuario.map((servicio, i) => {
    const todas = historiales[i];
    const delPeriodo = todas.filter((c) => enPeriodo(c.timestamp));
    comprobacionesPeriodo.push(...delPeriodo);

    const cantidadUp = delPeriodo.filter((c) => c.estado === "UP").length;
    const tiempos = delPeriodo.filter((c) => c.tiempo_respuesta_ms != null).map((c) => c.tiempo_respuesta_ms);

    return {
      id: servicio.id,
      nombre: servicio.nombre,
      estado: estadoDe(servicio, todas),
      // US19: comprobaciones UP / comprobaciones totales del período × 100.
      uptime: delPeriodo.length > 0 ? redondear((cantidadUp / delPeriodo.length) * 100, 1) : null,
      ultima_comprobacion: todas.length > 0 ? todas[0].timestamp : null,
      tiempo_respuesta_promedio: redondear(promedio(tiempos)),
    };
  });

  const incidentesPeriodo = incidentes.filter((i) => enPeriodo(i.fecha_inicio));
  // US20: promedio de (fecha_resolucion − fecha_inicio) de los resueltos.
  const duraciones = incidentesPeriodo
    .filter((i) => (i.estado === "Resuelto" || i.estado === "Cerrado") && i.fecha_resolucion)
    .map((i) => (new Date(i.fecha_resolucion) - new Date(i.fecha_inicio)) / MS_POR_MINUTO);
  const contar = (estado) => servicios.filter((s) => s.estado === estado).length;

  return {
    dias,
    desde: new Date(desdeMs).toISOString(),
    hasta: new Date(hastaMs).toISOString(),
    servicios,
    resumen: {
      servicios_activos: contar("Activo"),
      servicios_degradados: contar("Degradado"),
      servicios_caidos: contar("Caído"),
      servicios_pausados: contar("Pausado"),
      uptime_promedio: redondear(promedio(servicios.filter((s) => s.uptime !== null).map((s) => s.uptime)), 1),
      // US21: los que no están Resueltos ni Cerrados, sean o no del período.
      incidentes_activos: incidentes.filter((i) => i.estado !== "Resuelto" && i.estado !== "Cerrado").length,
      cantidad_incidentes: incidentesPeriodo.length,
      mttr_minutos: redondear(promedio(duraciones)),
    },
    serie: armarSerie(comprobacionesPeriodo, desdeMs, hastaMs, dias <= 1),
    serie_por_hora: dias <= 1,
    // US22: listarIncidentes ya los devuelve del más reciente al más antiguo.
    incidentes_recientes: incidentes.slice(0, CANTIDAD_INCIDENTES_RECIENTES),
  };
}
