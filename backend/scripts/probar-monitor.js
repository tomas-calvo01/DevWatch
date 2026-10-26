// scripts/probar-monitor.js
// Prueba de humo del Motor de Monitoreo (actividad 3.3). No usa internet: levanta
// servidores HTTP locales, crea datos de prueba en la base, corre el scheduler
// ~15 s y verifica las comprobaciones guardadas. Al final borra los datos de prueba.
// Requiere PostgreSQL con schema.sql aplicado y DATABASE_URL en .env.
// Detené "npm run monitor" antes de correrla: si no, también comprobaría estos servicios.
// Uso: npm run probar-monitor
import "dotenv/config";
import http from "node:http";

// Configuración de la prueba (antes de importar el monitor, que la lee al cargarse).
process.env.MONITOR_TIMEOUT_MS = "1500";
process.env.MONITOR_TICK_SECONDS = "1";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Copiá .env.example como .env y completá los valores.");
  process.exit(1);
}

const { pool, query } = await import("../src/db.js");
const { crearScheduler } = await import("../src/monitor/scheduler.js");

const DURACION_MS = 15000;
const DEMORA_LENTO_MS = 3000; // mayor que el timeout de la prueba

let fallos = 0;

function caso(nombre, condicion, detalle = "") {
  if (condicion) {
    console.log(`OK     ${nombre}`);
  } else {
    fallos++;
    console.log(`FALLÓ  ${nombre} ${detalle}`);
  }
}

// Servidor local de prueba. Lleva la cuenta de peticiones y del máximo de
// peticiones simultáneas por ruta (para detectar checks superpuestos).
function crearServidor(responder) {
  const stats = {};
  const servidor = http.createServer((req, res) => {
    const s = (stats[req.url] ??= { total: 0, activas: 0, maxActivas: 0 });
    s.total++;
    s.activas++;
    s.maxActivas = Math.max(s.maxActivas, s.activas);
    res.on("close", () => s.activas--);
    responder(req, res);
  });
  return new Promise((resolve) => {
    servidor.listen(0, "127.0.0.1", () => {
      resolve({ servidor, stats, url: `http://127.0.0.1:${servidor.address().port}` });
    });
  });
}

function cerrar({ servidor }) {
  servidor.closeAllConnections();
  return new Promise((resolve) => servidor.close(resolve));
}

// Puerto libre sin nadie escuchando, para probar "conexión rechazada".
async function puertoCerrado() {
  const s = await crearServidor(() => {});
  await cerrar(s);
  return s.url;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const rapido = await crearServidor((req, res) => res.writeHead(200).end("ok"));
const conError = await crearServidor((req, res) => res.writeHead(500).end("error"));
const lento = await crearServidor((req, res) => {
  const t = setTimeout(() => res.writeHead(200).end("tarde"), DEMORA_LENTO_MS);
  res.on("close", () => clearTimeout(t));
});
const urlCerrada = await puertoCerrado();

const sufijo = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
let usuarioId = null;

try {
  const tablas = await query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('servicios','comprobaciones')"
  );
  if (tablas.rows[0].n !== 2) {
    throw new Error("Faltan las tablas servicios/comprobaciones. Aplicá db/schema.sql primero.");
  }

  const u = await query(
    "INSERT INTO usuarios (nombre, email, password_hash) VALUES ($1, $2, $3) RETURNING id",
    ["Prueba Monitor", `prueba_monitor_${sufijo}@devwatch.test`, "sin-uso"]
  );
  usuarioId = u.rows[0].id;

  async function crearServicio(nombre, url, intervalo, activo = true) {
    const r = await query(
      `INSERT INTO servicios (usuario_id, nombre, url, intervalo_segundos, activo)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [usuarioId, `[prueba] ${nombre}`, url, intervalo, activo]
    );
    return r.rows[0].id;
  }

  const ids = {
    up: await crearServicio("responde 200", `${rapido.url}/ok`, 5),
    down: await crearServicio("responde 500", `${conError.url}/error`, 5),
    timeout: await crearServicio("tarda más que el timeout", `${lento.url}/lento`, 5),
    rechazado: await crearServicio("conexión rechazada", `${urlCerrada}/nada`, 5),
    inactivo: await crearServicio("inactivo", `${rapido.url}/inactivo`, 5, false),
    // Intervalo (1 s) menor que lo que tarda el check (1,5 s): fuerza ticks con el check en curso.
    solapado: await crearServicio("check más largo que el intervalo", `${lento.url}/solapado`, 1),
  };

  console.log(`Ejecutando el scheduler ${DURACION_MS / 1000} s...\n`);
  const scheduler = crearScheduler();
  scheduler.iniciar();
  await espera(DURACION_MS);
  scheduler.detener();
  await scheduler.esperarEnCurso(10000);
  console.log("");

  const { rows } = await query(
    `SELECT servicio_id, estado, status_code, tiempo_respuesta_ms, timestamp
     FROM comprobaciones WHERE servicio_id = ANY($1) ORDER BY timestamp`,
    [Object.values(ids)]
  );
  const de = (id) => rows.filter((r) => r.servicio_id === id);
  const resumen = (lista) => JSON.stringify(lista.map((r) => [r.estado, r.status_code, r.tiempo_respuesta_ms]));

  const up = de(ids.up);
  caso(
    "Servicio que responde 200 => UP con status_code y tiempo",
    up.length > 0 && up.every((r) => r.estado === "UP" && r.status_code === 200 && Number.isInteger(r.tiempo_respuesta_ms)),
    resumen(up)
  );
  caso("Intervalo de 5 s respetado (2 a 4 comprobaciones en 15 s)", up.length >= 2 && up.length <= 4, `hubo ${up.length}`);

  const down = de(ids.down);
  caso(
    "Servicio que responde 500 => DOWN con status_code 500 y tiempo",
    down.length > 0 && down.every((r) => r.estado === "DOWN" && r.status_code === 500 && Number.isInteger(r.tiempo_respuesta_ms)),
    resumen(down)
  );

  const timeout = de(ids.timeout);
  caso(
    "Servicio lento => TIMEOUT sin status_code ni tiempo",
    timeout.length > 0 && timeout.every((r) => r.estado === "TIMEOUT" && r.status_code === null && r.tiempo_respuesta_ms === null),
    resumen(timeout)
  );

  const rechazado = de(ids.rechazado);
  caso(
    "Conexión rechazada => DOWN sin status_code ni tiempo",
    rechazado.length > 0 && rechazado.every((r) => r.estado === "DOWN" && r.status_code === null && r.tiempo_respuesta_ms === null),
    resumen(rechazado)
  );

  caso(
    "Servicio con activo=false no genera comprobaciones",
    de(ids.inactivo).length === 0 && !rapido.stats["/inactivo"],
    `comprobaciones: ${de(ids.inactivo).length}`
  );

  const maxSimultaneas = Math.max(
    ...[rapido, conError, lento].flatMap((s) => Object.values(s.stats).map((x) => x.maxActivas))
  );
  const solapado = de(ids.solapado);
  caso(
    "Nunca hay dos comprobaciones simultáneas del mismo servicio",
    maxSimultaneas === 1 && solapado.length >= 2 && solapado.every((r) => r.estado === "TIMEOUT"),
    `máximo simultáneas: ${maxSimultaneas}, checks del servicio solapado: ${solapado.length}`
  );
} catch (err) {
  fallos++;
  console.error(`FALLÓ  Error durante la prueba: ${err.message}`);
} finally {
  if (usuarioId !== null) {
    // ON DELETE CASCADE borra también servicios y comprobaciones de prueba.
    await query("DELETE FROM usuarios WHERE id = $1", [usuarioId]).catch((err) =>
      console.error(`No se pudieron borrar los datos de prueba: ${err.message}`)
    );
  }
  await Promise.all([cerrar(rapido), cerrar(conError), cerrar(lento)]);
  await pool.end();
}

console.log(fallos === 0 ? "\nTodas las pruebas pasaron." : `\n${fallos} prueba(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
