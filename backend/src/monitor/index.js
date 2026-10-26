// monitor/index.js
// Punto de entrada del Motor de Monitoreo (actividad 3.3). Es un proceso worker
// independiente del API: no levanta Express, solo comprueba servicios y guarda resultados.
// Uso: npm run monitor
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  console.error(
    "Error de configuración: falta la variable de entorno DATABASE_URL. " +
      "Copiá .env.example como .env y completá los valores."
  );
  process.exit(1);
}

// Import dinámico: db.js y la configuración del monitor leen process.env al cargarse.
const { pool } = await import("../db.js");
const { crearScheduler, TICK_SECONDS, MAX_CONCURRENTES } = await import("./scheduler.js");
const { TIMEOUT_MS } = await import("./checker.js");

const ESPERA_APAGADO_MS = 10000;

// Un cliente inactivo del pool que pierde la conexión emite "error": sin este
// manejador el proceso se cae. Se loguea y el pool reconecta en la próxima query.
pool.on("error", (err) => {
  console.error(`[monitor] Error en la conexión a PostgreSQL: ${err.message}`);
});

process.on("unhandledRejection", (motivo) => {
  console.error("[monitor] Promesa rechazada sin manejar:", motivo);
});

try {
  await pool.query("SELECT 1");
} catch (err) {
  console.error(`No se pudo conectar a PostgreSQL: ${err.message}`);
  process.exit(1);
}

const scheduler = crearScheduler();
scheduler.iniciar();
console.log(
  `DevWatch Monitor iniciado (tick ${TICK_SECONDS} s, timeout ${TIMEOUT_MS} ms, ` +
    `máx. ${MAX_CONCURRENTES} checks concurrentes).`
);

let apagando = false;

async function apagar(senal) {
  if (apagando) return;
  apagando = true;
  console.log(`\n[monitor] ${senal} recibido: deteniendo el monitor...`);

  scheduler.detener();
  if (scheduler.cantidadEnCurso > 0) {
    console.log(`[monitor] Esperando ${scheduler.cantidadEnCurso} comprobación(es) en curso...`);
  }
  const terminaron = await scheduler.esperarEnCurso(ESPERA_APAGADO_MS);
  if (!terminaron) {
    console.warn("[monitor] Algunas comprobaciones no terminaron a tiempo; se descartan.");
  }

  try {
    await pool.end();
  } catch (err) {
    console.error(`[monitor] Error al cerrar la conexión a PostgreSQL: ${err.message}`);
  }
  console.log("[monitor] Monitor detenido.");
  process.exit(0);
}

process.on("SIGINT", () => apagar("SIGINT"));
process.on("SIGTERM", () => apagar("SIGTERM"));
