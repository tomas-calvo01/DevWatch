// app.js
// Configura Express: CORS (solo FRONTEND_URL), JSON, rutas y manejo de errores.
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import usuariosRoutes from "./routes/usuarios.routes.js";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ estado: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/usuarios", usuariosRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

// Manejo de errores: JSON mal formado => 400; el resto => 500 sin detalles internos.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es un JSON válido." });
  }
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});

export default app;
