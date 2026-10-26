// routes/incidentes.routes.js
// Gestión de Incidentes (actividad 3.4). Cubre:
//   US13/US21/US22 listado con filtros (incluye "activos"), US14 cambio de estado con flujo,
//   US15 historial (detalle), US16 cierre y US17 severidad.
// Los incidentes los abre y resuelve el Motor de Monitoreo (monitor/incidentes.js).
// Todas las rutas exigen token y solo ven incidentes de servicios del usuario logueado:
// uno inexistente o ajeno responde siempre 404 igual.
import { Router } from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { parsearFechaIso } from "../utils/fechas.js";

const router = Router();
router.use(requireAuth);

// Flujo de estados: solo se avanza al siguiente, sin saltear ni retroceder.
const ESTADOS = ["Detectado", "Investigando", "Identificado", "Resuelto", "Cerrado"];
const SEVERIDADES = ["Crítica", "Alta", "Media", "Baja"];
const ESTADO_ACTIVOS = "activos";
const ID_MAXIMO = 2147483647;

const NO_ENCONTRADO = "Incidente no encontrado.";
const CERRADO = "Un incidente cerrado no admite más cambios.";

const columnasIncidente = `
  i.id, i.servicio_id, s.nombre AS servicio_nombre, i.estado, i.severidad,
  i.fecha_inicio, i.fecha_resolucion`;

function parsearId(texto) {
  if (!/^\d+$/.test(texto)) return null;
  const id = Number(texto);
  return id > 0 && id <= ID_MAXIMO ? id : null;
}

// Incidente (de un servicio del usuario) con su historial, o null si no existe.
// Dos consultas fijas, sin N+1. "usuario" es el nombre, o "Sistema" si usuario_id es NULL.
async function obtenerDetalle(id, usuarioId) {
  const { rows } = await query(
    `SELECT ${columnasIncidente}
     FROM incidentes i JOIN servicios s ON s.id = i.servicio_id
     WHERE i.id = $1 AND s.usuario_id = $2`,
    [id, usuarioId]
  );
  if (rows.length === 0) return null;

  const historial = await query(
    `SELECT h.id, h.incidente_id, h.estado_anterior, h.estado_nuevo, h.fecha_cambio,
            COALESCE(u.nombre, 'Sistema') AS usuario
     FROM historial_incidentes h LEFT JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.incidente_id = $1
     ORDER BY h.fecha_cambio ASC, h.id ASC`,
    [id]
  );
  return { ...rows[0], historial: historial.rows };
}

// Lista los incidentes de los servicios del usuario, del más reciente al más antiguo.
// Filtros opcionales: servicio_id, estado (del flujo o "activos"), desde y hasta
// (ISO, inclusivos, contra fecha_inicio).
router.get("/", async (req, res, next) => {
  try {
    const { servicio_id: servicioIdTexto, estado, desde, hasta } = req.query;

    if (estado !== undefined && estado !== ESTADO_ACTIVOS && !ESTADOS.includes(estado)) {
      return res.status(400).json({ error: "El filtro de estado no es válido." });
    }
    const fechaDesde = desde === undefined ? null : parsearFechaIso(desde);
    const fechaHasta = hasta === undefined ? null : parsearFechaIso(hasta);
    if ((desde !== undefined && !fechaDesde) || (hasta !== undefined && !fechaHasta)) {
      return res.status(400).json({ error: "Las fechas tienen que tener formato ISO válido." });
    }
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      return res.status(400).json({ error: "La fecha 'desde' no puede ser posterior a 'hasta'." });
    }
    let servicioId = null;
    if (servicioIdTexto !== undefined) {
      servicioId = typeof servicioIdTexto === "string" ? parsearId(servicioIdTexto) : null;
      if (servicioId === null) return res.status(400).json({ error: "El filtro de servicio no es válido." });
    }

    const params = [req.user.id];
    let filtros = "";
    if (servicioId !== null) {
      params.push(servicioId);
      filtros += ` AND i.servicio_id = $${params.length}`;
    }
    if (estado === ESTADO_ACTIVOS) {
      filtros += " AND i.estado NOT IN ('Resuelto','Cerrado')";
    } else if (estado !== undefined) {
      params.push(estado);
      filtros += ` AND i.estado = $${params.length}`;
    }
    if (fechaDesde) {
      params.push(fechaDesde.toISOString());
      filtros += ` AND i.fecha_inicio >= $${params.length}::timestamptz`;
    }
    if (fechaHasta) {
      params.push(fechaHasta.toISOString());
      filtros += ` AND i.fecha_inicio <= $${params.length}::timestamptz`;
    }

    const { rows } = await query(
      `SELECT ${columnasIncidente}
       FROM incidentes i JOIN servicios s ON s.id = i.servicio_id
       WHERE s.usuario_id = $1${filtros}
       ORDER BY i.fecha_inicio DESC, i.id DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// US15 — Detalle con historial.
router.get("/:id", async (req, res, next) => {
  try {
    const id = parsearId(req.params.id);
    if (id === null) return res.status(404).json({ error: NO_ENCONTRADO });

    const incidente = await obtenerDetalle(id, req.user.id);
    if (!incidente) return res.status(404).json({ error: NO_ENCONTRADO });
    res.json(incidente);
  } catch (err) {
    next(err);
  }
});

// Ejecuta "cambiar" con el incidente bloqueado (FOR UPDATE), para que un cambio
// manual no se pise con la resolución automática del monitor. "cambiar" recibe el
// cliente y la fila, y devuelve un mensaje de error { status, error } o null si
// ya hizo el cambio. Devuelve el resultado de "cambiar", o null si no existe.
async function modificarIncidente(id, usuarioId, cambiar) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const { rows } = await cliente.query(
      `SELECT i.id, i.estado, i.fecha_resolucion
       FROM incidentes i JOIN servicios s ON s.id = i.servicio_id
       WHERE i.id = $1 AND s.usuario_id = $2
       FOR UPDATE OF i`,
      [id, usuarioId]
    );
    if (rows.length === 0) {
      await cliente.query("ROLLBACK");
      return null;
    }
    const fallo = await cambiar(cliente, rows[0]);
    await cliente.query(fallo ? "ROLLBACK" : "COMMIT");
    return fallo ?? {};
  } catch (err) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

// US14 / US16 — Avanza al estado siguiente del flujo y lo registra en el historial
// con el usuario logueado.
router.patch("/:id/estado", async (req, res, next) => {
  try {
    const id = parsearId(req.params.id);
    if (id === null) return res.status(404).json({ error: NO_ENCONTRADO });

    const estado = req.body?.estado;
    const resultado = await modificarIncidente(id, req.user.id, async (cliente, actual) => {
      if (typeof estado !== "string" || !ESTADOS.includes(estado)) {
        return { status: 400, error: "El estado no es válido." };
      }
      const permitido = ESTADOS[ESTADOS.indexOf(actual.estado) + 1];
      if (!permitido) return { status: 409, error: CERRADO };
      if (estado !== permitido) {
        return { status: 409, error: `Desde "${actual.estado}" solo se puede pasar a "${permitido}".` };
      }

      await cliente.query(
        `UPDATE incidentes
         SET estado = $2::varchar, fecha_resolucion = CASE WHEN $2::varchar = 'Resuelto' THEN COALESCE(fecha_resolucion, now()) ELSE fecha_resolucion END
         WHERE id = $1`,
        [id, estado]
      );
      await cliente.query(
        `INSERT INTO historial_incidentes (incidente_id, estado_anterior, estado_nuevo, usuario_id)
         VALUES ($1, $2, $3, $4)`,
        [id, actual.estado, estado, req.user.id]
      );
      return null;
    });

    if (resultado === null) return res.status(404).json({ error: NO_ENCONTRADO });
    if (resultado.error) return res.status(resultado.status).json({ error: resultado.error });
    res.json(await obtenerDetalle(id, req.user.id));
  } catch (err) {
    next(err);
  }
});

// US17 — Cambia la severidad (no se restringe por rol).
router.patch("/:id/severidad", async (req, res, next) => {
  try {
    const id = parsearId(req.params.id);
    if (id === null) return res.status(404).json({ error: NO_ENCONTRADO });

    const severidad = req.body?.severidad;
    const resultado = await modificarIncidente(id, req.user.id, async (cliente, actual) => {
      if (typeof severidad !== "string" || !SEVERIDADES.includes(severidad)) {
        return { status: 400, error: `La severidad tiene que ser una de: ${SEVERIDADES.join(", ")}.` };
      }
      if (actual.estado === "Cerrado") return { status: 409, error: CERRADO };

      await cliente.query("UPDATE incidentes SET severidad = $2 WHERE id = $1", [id, severidad]);
      return null;
    });

    if (resultado === null) return res.status(404).json({ error: NO_ENCONTRADO });
    if (resultado.error) return res.status(resultado.status).json({ error: resultado.error });
    res.json(await obtenerDetalle(id, req.user.id));
  } catch (err) {
    next(err);
  }
});

export default router;
