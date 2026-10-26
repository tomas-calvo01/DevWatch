// monitor/incidentes.js
// Creación y resolución automática de incidentes (actividad 3.4, US13).
// El hook alResultado del Motor de Monitoreo llama a evaluarComprobacion después de
// guardar cada comprobación. No guarda contadores en memoria: cuenta las fallas
// consecutivas leyendo la base, así que sobrevive a reinicios del worker.
//
// Puntos donde la actividad 3.5 (Alertas) se va a enganchar:
//   1. Apertura de incidente  -> dentro de abrirIncidente, después del COMMIT.
//   2. Resolución de incidente -> dentro de resolverIncidente, después del COMMIT.
import { pool } from "../db.js";
import { leerEnteroPositivo } from "./config.js";

// Fallas seguidas (DOWN o TIMEOUT) para abrir un incidente.
export const FALLOS_CONSECUTIVOS = leerEnteroPositivo("INCIDENTE_FALLOS_CONSECUTIVOS", 2);

async function enTransaccion(trabajo) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await trabajo(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (err) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

// Una racha son las comprobaciones fallidas posteriores a la última UP y a la
// última resolución de un incidente del servicio (si un operador lo resolvió a
// mano con el servicio todavía caído, hacen falta N fallas nuevas para otro incidente).
// fecha_inicio es el timestamp de la primera falla de la racha. La inserción del
// incidente y de su primera entrada de historial es una sola transacción; si ya
// hay un incidente activo, el índice único parcial lo rechaza (23505) y se ignora.
async function abrirIncidente(servicio) {
  return enTransaccion(async (cliente) => {
    await cliente.query("SAVEPOINT apertura");
    try {
      const { rows } = await cliente.query(
        `WITH limite AS (
           SELECT GREATEST(
             COALESCE((SELECT max(timestamp) FROM comprobaciones WHERE servicio_id = $1 AND estado = 'UP'), '-infinity'::timestamp),
             COALESCE((SELECT max(fecha_resolucion) FROM incidentes WHERE servicio_id = $1), '-infinity'::timestamp)
           ) AS desde
         ),
         racha AS (
           SELECT count(*)::int AS fallos, min(c.timestamp) AS primera
           FROM comprobaciones c, limite
           WHERE c.servicio_id = $1 AND c.timestamp > limite.desde
         ),
         nuevo AS (
           INSERT INTO incidentes (servicio_id, fecha_inicio)
           SELECT $1, primera FROM racha WHERE fallos >= $2
           RETURNING id, fecha_inicio
         )
         INSERT INTO historial_incidentes (incidente_id, estado_anterior, estado_nuevo, fecha_cambio, usuario_id)
         SELECT id, NULL, 'Detectado', fecha_inicio, NULL FROM nuevo
         RETURNING incidente_id`,
        [servicio.id, FALLOS_CONSECUTIVOS]
      );
      if (rows.length > 0) {
        console.log(`[incidentes] Servicio #${servicio.id} ${servicio.nombre}: incidente #${rows[0].incidente_id} abierto.`);
        // 3.5: acá se dispara la alerta de caída.
      }
    } catch (err) {
      if (err.code !== "23505") throw err;
      // Ya había un incidente activo (carrera entre dos evaluaciones): no es un error.
      await cliente.query("ROLLBACK TO SAVEPOINT apertura");
    }
  });
}

// Pasa a Resuelto el incidente activo del servicio, sea cual sea su estado actual
// (es la única excepción al flujo paso a paso: la hace el Sistema). La fecha de
// resolución y la del historial son el timestamp de la comprobación UP.
async function resolverIncidente(servicio, comprobacion) {
  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT id, estado FROM incidentes
       WHERE servicio_id = $1 AND estado NOT IN ('Resuelto','Cerrado')
       FOR UPDATE`,
      [servicio.id]
    );
    if (rows.length === 0) return;
    const { id, estado } = rows[0];

    await cliente.query(
      `UPDATE incidentes
       SET estado = 'Resuelto', fecha_resolucion = (SELECT timestamp FROM comprobaciones WHERE id = $2)
       WHERE id = $1`,
      [id, comprobacion.id]
    );
    await cliente.query(
      `INSERT INTO historial_incidentes (incidente_id, estado_anterior, estado_nuevo, fecha_cambio, usuario_id)
       VALUES ($1, $2, 'Resuelto', (SELECT timestamp FROM comprobaciones WHERE id = $3), NULL)`,
      [id, estado, comprobacion.id]
    );
    console.log(`[incidentes] Servicio #${servicio.id} ${servicio.nombre}: incidente #${id} resuelto.`);
    // 3.5: acá se dispara la alerta de recuperación.
  });
}

// Punto de entrada. Nunca lanza: un error de incidentes se loguea y el Motor de
// Monitoreo sigue con el resto de los servicios.
export async function evaluarComprobacion(servicio, comprobacion) {
  try {
    if (comprobacion.estado === "UP") {
      await resolverIncidente(servicio, comprobacion);
    } else {
      // Con un incidente activo no hay nada que hacer; si no, se mira la racha.
      await abrirIncidente(servicio);
    }
  } catch (err) {
    console.error(`[incidentes] Error al evaluar el servicio #${servicio?.id}: ${err.message}`);
  }
}
