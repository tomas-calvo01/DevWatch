// routes/auth.routes.js
// US01 (registro), US02 (login) y US03 (logout).
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const COLUMNAS_PUBLICAS = "id, nombre, email, rol, fecha_creacion";
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Devuelve { error } si hay un problema o null si los datos son válidos.
function validarRegistro({ nombre, email, password }) {
  if (typeof nombre !== "string" || !nombre.trim()) return "El nombre es obligatorio.";
  if (nombre.trim().length > 120) return "El nombre no puede superar los 120 caracteres.";
  if (typeof email !== "string" || !REGEX_EMAIL.test(email.trim())) return "El email no tiene un formato válido.";
  if (email.trim().length > 160) return "El email no puede superar los 160 caracteres.";
  if (typeof password !== "string" || password.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
  return null;
}

// US01 — Registrar un usuario nuevo. Rol por defecto: administrador.
router.post("/registro", async (req, res, next) => {
  try {
    const errorValidacion = validarRegistro(req.body || {});
    if (errorValidacion) return res.status(400).json({ error: errorValidacion });

    const nombre = req.body.nombre.trim();
    const email = req.body.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(req.body.password, 10);

    // ON CONFLICT evita la carrera entre "consultar y luego insertar".
    const { rows } = await query(
      `INSERT INTO usuarios (nombre, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING ${COLUMNAS_PUBLICAS}`,
      [nombre, email, passwordHash]
    );

    if (rows.length === 0) {
      return res.status(409).json({ error: "Ya existe una cuenta registrada con ese email." });
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// US02 — Iniciar sesión. Devuelve { token, usuario }.
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return res.status(400).json({ error: "Email y contraseña son obligatorios." });
    }

    const { rows } = await query(
      `SELECT ${COLUMNAS_PUBLICAS}, password_hash FROM usuarios WHERE email = $1`,
      [email.trim().toLowerCase()]
    );
    const fila = rows[0];

    // Mismo mensaje si el email no existe o la contraseña es incorrecta.
    if (!fila || !(await bcrypt.compare(password, fila.password_hash))) {
      return res.status(401).json({ error: "Email o contraseña incorrectos." });
    }

    const token = jwt.sign({ id: fila.id, rol: fila.rol }, process.env.JWT_SECRET, { expiresIn: "8h" });
    const { password_hash: _hash, ...usuario } = fila;
    res.json({ token, usuario });
  } catch (err) {
    next(err);
  }
});

// US03 — Cerrar sesión. Con JWT sin estado el cierre real es descartar el token
// en el cliente; el endpoint existe por coherencia con el diseño y exige token.
router.post("/logout", requireAuth, (req, res) => {
  res.json({ mensaje: "Sesión cerrada." });
});

export default router;
