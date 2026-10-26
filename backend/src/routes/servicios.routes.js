// routes/servicios.routes.js
// Módulo de Servicios (actividad 3.2). Cubre:
//   US05 alta (POST), US06 edición (PUT), US07 baja (DELETE),
//   US08 activar/desactivar (PATCH /:id/activo) y US12 historial (GET /:id/comprobaciones).
// Todas las rutas exigen token y trabajan solo sobre los servicios de req.user.id:
// un servicio inexistente o ajeno responde siempre 404 igual, para no revelar su existencia.
// Las comprobaciones las genera el Motor de Monitoreo (3.3), no esta API.
import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { parsearFechaIso } from "../utils/fechas.js";

const router = Router();
router.use(requireAuth);

const INTERVALO_DEFAULT = 60;
const INTERVALO_MINIMO = 10;
const INTERVALO_MAXIMO = 2147483647; // tope de la columna INTEGER
const LIMITE_DEFAULT = 100;
const LIMITE_MAXIMO = 500;
const INDICE_URL_UNICA = "uq_servicios_usuario_url";

const NO_ENCONTRADO = "Servicio no encontrado.";

// Devuelve el servicio con "ultimo_estado" en una sola consulta (sin N+1):
// LATERAL toma la comprobación más reciente de cada servicio. "origen" es una
// tabla o un CTE con las filas de servicios a devolver.
const columnasServicio = `
  s.id, s.usuario_id, s.nombre, s.url, s.tipo, s.intervalo_segundos, s.activo,
  s.fecha_creacion, ult.estado AS ultimo_estado`;
const joinUltimoEstado = `
  LEFT JOIN LATERAL (
    SELECT c.estado FROM comprobaciones c
    WHERE c.servicio_id = s.id
    ORDER BY c.timestamp DESC, c.id DESC
    LIMIT 1
  ) ult ON true`;

// ---------- Validaciones (cada una devuelve el mensaje de error o null) ----------

function validarNombre(nombre) {
  if (typeof nombre !== "string" || !nombre.trim()) return "El nombre es obligatorio.";
  if (nombre.trim().length > 120) return "El nombre no puede superar los 120 caracteres.";
  return null;
}

function validarUrl(url) {
  if (typeof url !== "string" || !url.trim()) return "La URL es obligatoria.";
  const limpia = url.trim();
  if (!/^https?:\/\//i.test(limpia)) return "La URL tiene que empezar con http:// o https://.";
  if (limpia.length > 255) return "La URL no puede superar los 255 caracteres.";
  try {
    const { protocol } = new URL(limpia);
    if (protocol !== "http:" && protocol !== "https:") throw new Error("esquema no permitido");
  } catch {
    return "La URL no es válida. Ejemplo: https://www.ejemplo.com";
  }
  return null;
}

function validarTipo(tipo) {
  return tipo === "HTTP" ? null : "El tipo de servicio no es válido.";
}

function validarIntervalo(intervalo) {
  if (typeof intervalo !== "number" || !Number.isInteger(intervalo) || intervalo > INTERVALO_MAXIMO) {
    return "El intervalo tiene que ser un número entero de segundos.";
  }
  if (intervalo < INTERVALO_MINIMO) return `El intervalo mínimo es de ${INTERVALO_MINIMO} segundos.`;
  return null;
}

// Valida los datos de alta/edición. tipo e intervalo son opcionales: si faltan
// se usan los valores por defecto (alta) o los actuales (edición).
function validarDatos(body) {
  const { nombre, url, tipo, intervalo_segundos: intervalo } = body;
  return (
    validarNombre(nombre) ||
    validarUrl(url) ||
    (tipo == null ? null : validarTipo(tipo)) ||
    (intervalo == null ? null : validarIntervalo(intervalo))
  );
}

// El id de la ruta tiene que ser un entero positivo que entre en INTEGER.
function parsearId(texto) {
  if (!/^\d+$/.test(texto)) return null;
  const id = Number(texto);
  return id > 0 && id <= INTERVALO_MAXIMO ? id : null;
}

function enteroPositivo(valor, porDefecto) {
  if (valor === undefined) return porDefecto;
  if (typeof valor !== "string" || !/^\d+$/.test(valor)) return null;
  const n = Number(valor);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

// ---------- Rutas ----------

// Lista los servicios del usuario, del más nuevo al más viejo.
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${columnasServicio}
       FROM servicios s ${joinUltimoEstado}
       WHERE s.usuario_id = $1
       ORDER BY s.fecha_creacion DESC, s.id DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// US05 — Alta de servicio.
router.post("/", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const errorValidacion = validarDatos(body);
    if (errorValidacion) return res.status(400).json({ error: errorValidacion });

    const { rows } = await query(
      `WITH s AS (
         INSERT INTO servicios (usuario_id, nombre, url, tipo, intervalo_segundos)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *
       )
       SELECT ${columnasServicio} FROM s ${joinUltimoEstado}`,
      [req.user.id, body.nombre.trim(), body.url.trim(), body.tipo ?? "HTTP", body.intervalo_segundos ?? INTERVALO_DEFAULT]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505" && err.constraint === INDICE_URL_UNICA) {
      return res.status(409).json({ error: "Ya registraste un servicio con esa URL." });
    }
    next(err);
  }
});

// Detalle de un servicio propio.
router.get("/:id", async (req, res, next) => {
  try {
    const id = parsearId(req.params.id);
    if (id === null) return res.status(404).json({ error: NO_ENCONTRADO });

    const { rows } = await query(
      `SELECT ${columnasServicio}
       FROM servicios s ${joinUltimoEstado}
       WHERE s.id = $1 AND s.usuario_id = $2`,
      [id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: NO_ENCONTRADO });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// US06 — Edición. No toca id, usuario_id ni activo; el historial se conserva.
router.put("/:id", async (req, res, next) => {
  try {
    const id = parsearId(req.params.id);
    if (id === null) return res.status(404).json({ error: NO_ENCONTRADO });

    const body = req.body ?? {};
    const errorValidacion = validarDatos(body);
    if (errorValidacion) return res.status(400).json({ error: errorValidacion });

    // COALESCE: si tipo o intervalo no vienen, se conservan los actuales.
    const { rows } = await query(
      `WITH s AS (
         UPDATE servicios
         SET nombre = $3, url = $4,
             tipo = COALESCE($5, tipo),
             intervalo_segundos = COALESCE($6, intervalo_segundos)
         WHERE id = $1 AND usuario_id = $2
         RETURNING *
       )
       SELECT ${columnasServicio} FROM s ${joinUltimoEstado}`,
      [id, req.user.id, body.nombre.trim(), body.url.trim(), body.tipo ?? null, body.intervalo_segundos ?? null]
    );
    if (rows.length === 0) return res.status(404).json({ error: NO_ENCONTRADO });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505" && err.constraint === INDICE_URL_UNICA) {
      return res.status(409).json({ error: "Ya registraste un servicio con esa URL." });
    }
    next(err);
  }
});

// US07 — Baja. Las comprobaciones se borran por ON DELETE CASCADE.
router.delete("/:id", async (req, res, next) => {
  try {
    const id = parsearId(req.params.id);
    if (id === null) return res.status(404).json({ error: NO_ENCONTRADO });

    const { rowCount } = await query("DELETE FROM servicios WHERE id = $1 AND usuario_id = $2", [id, req.user.id]);
    if (rowCount === 0) return res.status(404).json({ error: NO_ENCONTRADO });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// US08 — Activar o desactivar el monitoreo. "activo" tiene que ser booleano estricto.
router.patch("/:id/activo", async (req, res, next) => {
  try {
    const id = parsearId(req.params.id);
    if (id === null) return res.status(404).json({ error: NO_ENCONTRADO });

    const activo = req.body?.activo;
    if (typeof activo !== "boolean") {
      return res.status(400).json({ error: "El campo activo tiene que ser verdadero o falso." });
    }

    const { rows } = await query(
      `WITH s AS (
         UPDATE servicios SET activo = $3 WHERE id = $1 AND usuario_id = $2 RETURNING *
       )
       SELECT ${columnasServicio} FROM s ${joinUltimoEstado}`,
      [id, req.user.id, activo]
    );
    if (rows.length === 0) return res.status(404).json({ error: NO_ENCONTRADO });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// US12 — Historial de comprobaciones (más recientes primero).
// Filtros opcionales: desde, hasta (ISO, extremos incluidos), limite (máx. 500) y pagina.
router.get("/:id/comprobaciones", async (req, res, next) => {
  try {
    const id = parsearId(req.params.id);
    if (id === null) return res.status(404).json({ error: NO_ENCONTRADO });

    // Primero se verifica que el servicio sea del usuario.
    const propio = await query("SELECT 1 FROM servicios WHERE id = $1 AND usuario_id = $2", [id, req.user.id]);
    if (propio.rowCount === 0) return res.status(404).json({ error: NO_ENCONTRADO });

    const { desde, hasta } = req.query;
    const fechaDesde = desde === undefined ? null : parsearFechaIso(desde);
    const fechaHasta = hasta === undefined ? null : parsearFechaIso(hasta);
    if ((desde !== undefined && !fechaDesde) || (hasta !== undefined && !fechaHasta)) {
      return res.status(400).json({ error: "Las fechas tienen que tener formato ISO válido." });
    }
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      return res.status(400).json({ error: "La fecha 'desde' no puede ser posterior a 'hasta'." });
    }

    const limite = enteroPositivo(req.query.limite, LIMITE_DEFAULT);
    const pagina = enteroPositivo(req.query.pagina, 1);
    if (limite === null || pagina === null) {
      return res.status(400).json({ error: "El límite y la página tienen que ser enteros positivos." });
    }
    const limiteFinal = Math.min(limite, LIMITE_MAXIMO);

    const params = [id];
    let filtros = "";
    if (fechaDesde) {
      params.push(fechaDesde.toISOString());
      filtros += ` AND timestamp >= $${params.length}::timestamptz`;
    }
    if (fechaHasta) {
      params.push(fechaHasta.toISOString());
      filtros += ` AND timestamp <= $${params.length}::timestamptz`;
    }
    params.push(limiteFinal, (pagina - 1) * limiteFinal);

    // El id desempata para que la paginación sea estable con timestamps iguales.
    const { rows } = await query(
      `SELECT id, servicio_id, timestamp, estado, status_code, tiempo_respuesta_ms
       FROM comprobaciones
       WHERE servicio_id = $1${filtros}
       ORDER BY timestamp DESC, id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
