// middleware/auth.js
// requireAuth: protege rutas que exigen sesión (US03, US04 y módulos futuros).
// Lee "Authorization: Bearer <token>", verifica el JWT y deja { id, rol } en req.user.
import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const cabecera = req.headers.authorization || "";
  const [esquema, token] = cabecera.split(" ");

  if (esquema !== "Bearer" || !token) {
    return res.status(401).json({ error: "No autenticado: falta el token." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, rol: payload.rol };
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o vencido." });
  }
}
