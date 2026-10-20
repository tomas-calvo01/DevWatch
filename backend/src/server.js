// server.js
// Punto de arranque del servidor. Valida las variables de entorno obligatorias
// antes de cargar el resto de la aplicación.
import "dotenv/config";

const faltantes = ["JWT_SECRET", "DATABASE_URL"].filter((v) => !process.env[v]);
if (faltantes.length > 0) {
  console.error(
    `Error de configuración: falta(n) la(s) variable(s) de entorno ${faltantes.join(", ")}. ` +
      "Copiá .env.example como .env y completá los valores."
  );
  process.exit(1);
}

// Import dinámico: db.js y las rutas leen process.env al cargarse.
const { default: app } = await import("./app.js");
const { pool } = await import("./db.js");

const puerto = Number(process.env.PORT) || 3000;

try {
  await pool.query("SELECT 1");
} catch (err) {
  console.error(`No se pudo conectar a PostgreSQL: ${err.message}`);
  process.exit(1);
}

app.listen(puerto, () => {
  console.log(`DevWatch API escuchando en http://localhost:${puerto}`);
});
