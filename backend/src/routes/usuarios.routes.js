// routes/usuarios.routes.js
// US04 — Ver y editar el perfil del usuario autenticado.
import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const COLUMNAS_PUBLICAS = "id, nombre, email, rol, fecha_creacion";
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.use(requireAuth);

// Usuario actual.
router.get("/me", async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id = $1`, [req.user.id]);
    if (rows.length === 0) return res.status(401).json({ error: "El usuario de la sesión ya no existe." });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// US04 — Editar nombre y email.
router.put("/me", async (req, res, next) => {
  try {
    const { nombre, email } = req.body || {};
    if (typeof nombre !== "string" || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es obligatorio." });
    }
    if (nombre.trim().length > 120) {
      return res.status(400).json({ error: "El nombre no puede superar los 120 caracteres." });
    }
    if (typeof email !== "string" || !REGEX_EMAIL.test(email.trim()) || email.trim().length > 160) {
      return res.status(400).json({ error: "El email no tiene un formato válido." });
    }

    try {
      const { rows } = await query(
        `UPDATE usuarios SET nombre = $1, email = $2 WHERE id = $3 RETURNING ${COLUMNAS_PUBLICAS}`,
        [nombre.trim(), email.trim().toLowerCase(), req.user.id]
      );
      if (rows.length === 0) return res.status(401).json({ error: "El usuario de la sesión ya no existe." });
      res.json(rows[0]);
    } catch (err) {
      // 23505 = unique_violation: otro usuario ya tiene ese email.
      if (err.code === "23505") {
        return res.status(409).json({ error: "Ya existe una cuenta registrada con ese email." });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

export default router;
