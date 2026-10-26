// scripts/probar-incidentes.js
// Pruebas de la Gestión de Incidentes (actividad 3.4: US13-US17, US21, US22).
// Requiere el servidor corriendo (npm run dev) y la base con db/schema.sql aplicado.
// Las comprobaciones se insertan directo en la base y se evalúan llamando a
// evaluarComprobacion (lo mismo que hace el hook del monitor). Los servicios de prueba
// se crean desactivados para que, si "npm run monitor" está corriendo, no los toque.
// Al terminar (aunque falle algo) se borran los usuarios de prueba; ON DELETE CASCADE
// elimina servicios, comprobaciones, incidentes e historial.
// Uso: npm run probar-incidentes   (opcional: API_URL=http://localhost:3000)
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Copiá .env.example como .env y completá los valores.");
  process.exit(1);
}

const { pool, query } = await import("../src/db.js");
const { evaluarComprobacion, FALLOS_CONSECUTIVOS: N } = await import("../src/monitor/incidentes.js");

const BASE = process.env.API_URL || "http://localhost:3000";
const sufijo = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const password = "clave123";
const emails = [`inc_a_${sufijo}@devwatch.test`, `inc_b_${sufijo}@devwatch.test`];

let fallos = 0;

async function llamar(metodo, ruta, { token, body } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = texto;
  }
  return { status: res.status, datos };
}

function caso(nombre, condicion, detalle = "") {
  if (condicion) {
    console.log(`OK     ${nombre}`);
  } else {
    fallos++;
    console.log(`FALLÓ  ${nombre} ${detalle}`);
  }
}

const esError = (r, status, mensaje) => r.status === status && r.datos?.error === mensaje;
const mismoConjunto = (obj, claves) => JSON.stringify(Object.keys(obj).sort()) === JSON.stringify([...claves].sort());
const CAMPOS_INCIDENTE = ["id", "servicio_id", "servicio_nombre", "estado", "severidad", "fecha_inicio", "fecha_resolucion"];
const CAMPOS_HISTORIAL = ["id", "incidente_id", "estado_anterior", "estado_nuevo", "fecha_cambio", "usuario"];

async function crearUsuario(nombre, email) {
  await llamar("POST", "/api/auth/registro", { body: { nombre, email, password } });
  const login = await llamar("POST", "/api/auth/login", { body: { email, password } });
  if (login.status !== 200) throw new Error(`No se pudo crear el usuario de prueba ${email}`);
  return { id: login.datos.usuario.id, nombre, token: login.datos.token };
}

// Los timestamps de la prueba son de ayer (+ n minutos), como las fallas que el monitor
// detectó antes de que alguien tocara el incidente. Las fases que ocurren DESPUÉS de un
// cambio manual (hecho con la hora real) usan minutos futuros: ver comprobarTrasCambioManual.
const T0 = Date.now() - 24 * 3600 * 1000;
const minuto = (n) => new Date(T0 + n * 60 * 1000);
const T_FUTURO = Date.now() + 10 * 60 * 1000;
const minutoFuturo = (n) => new Date(T_FUTURO + n * 60 * 1000);

// Inserta una comprobación y la evalúa como lo haría el monitor.
async function comprobar(servicio, estado, min, aMinuto = minuto) {
  const { rows } = await query(
    `INSERT INTO comprobaciones (servicio_id, timestamp, estado, status_code, tiempo_respuesta_ms)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, servicio_id, timestamp, estado, status_code, tiempo_respuesta_ms`,
    [servicio.id, aMinuto(min), estado, estado === "UP" ? 200 : null, estado === "UP" ? 100 : null]
  );
  await evaluarComprobacion(servicio, rows[0]);
}

const incidentesDe = async (servicioId) =>
  (await query("SELECT * FROM incidentes WHERE servicio_id = $1 ORDER BY fecha_inicio, id", [servicioId])).rows;
const historialDe = async (incidenteId) =>
  (await query("SELECT * FROM historial_incidentes WHERE incidente_id = $1 ORDER BY fecha_cambio, id", [incidenteId])).rows;
const mismaFecha = (a, b) => new Date(a).getTime() === new Date(b).getTime();

try {
  console.log(`(INCIDENTE_FALLOS_CONSECUTIVOS = ${N})\n`);
  const A = await crearUsuario("Usuario A", emails[0]);
  const B = await crearUsuario("Usuario B", emails[1]);

  async function crearServicio(usuario, nombre) {
    const r = await llamar("POST", "/api/servicios", { token: usuario.token, body: { nombre, url: `https://${nombre.replace(/\W/g, "")}-${sufijo}.devwatch.test` } });
    await llamar("PATCH", `/api/servicios/${r.datos.id}/activo`, { token: usuario.token, body: { activo: false } });
    return { id: r.datos.id, usuario_id: usuario.id, nombre };
  }
  const s1 = await crearServicio(A, "Servicio uno");
  const s2 = await crearServicio(A, "Servicio dos");
  const sB = await crearServicio(B, "Servicio de B");

  // --- Creación automática (US13) ---
  await comprobar(s1, "UP", 0);
  await comprobar(s1, "DOWN", 1);
  caso("Una caída aislada NO abre incidente", N === 1 ? true : (await incidentesDe(s1.id)).length === 0);
  await comprobar(s1, "UP", 2);
  caso("Una comprobación UP corta la racha: sin incidente", (await incidentesDe(s1.id)).length === (N === 1 ? 1 : 0));
  if (N === 1) {
    console.log("(con N=1 los casos de racha no son representativos; probá con el valor por defecto)");
  }

  // Racha nueva de N fallas, desde el minuto 10 (la primera falla de la racha).
  for (let i = 0; i < N; i++) {
    if (N > 1 && i === N - 1) caso(`Con ${N - 1} falla(s) seguida(s) todavía no hay incidente`, (await incidentesDe(s1.id)).length === (await incidentesDe(s1.id)).filter((x) => x.estado === "Resuelto").length);
    await comprobar(s1, i % 2 === 0 ? "DOWN" : "TIMEOUT", 10 + i);
  }
  let incs = await incidentesDe(s1.id);
  const activo1 = incs.find((i) => i.estado !== "Resuelto" && i.estado !== "Cerrado");
  caso(
    `${N} fallas seguidas (DOWN/TIMEOUT) abren un incidente Detectado, severidad Alta`,
    !!activo1 && activo1.estado === "Detectado" && activo1.severidad === "Alta" && activo1.fecha_resolucion === null,
    JSON.stringify(incs)
  );
  caso("fecha_inicio = timestamp de la PRIMERA comprobación fallida de la racha", !!activo1 && mismaFecha(activo1.fecha_inicio, minuto(10)), JSON.stringify(activo1));
  let hist = activo1 ? await historialDe(activo1.id) : [];
  caso(
    "Historial inicial: (null → Detectado) hecho por el Sistema",
    hist.length === 1 && hist[0].estado_anterior === null && hist[0].estado_nuevo === "Detectado" && hist[0].usuario_id === null,
    JSON.stringify(hist)
  );

  await comprobar(s1, "DOWN", 10 + N);
  incs = await incidentesDe(s1.id);
  caso("Otra caída con el incidente activo NO crea un segundo incidente", incs.length === 1, `hay ${incs.length}`);

  try {
    await query("INSERT INTO incidentes (servicio_id) VALUES ($1)", [s1.id]);
    caso("El índice único parcial rechaza un segundo incidente activo", false, "el INSERT directo no falló");
  } catch (err) {
    caso("El índice único parcial rechaza un segundo incidente activo (23505)", err.code === "23505" && err.constraint === "uq_incidente_activo_por_servicio", `${err.code} ${err.constraint}`);
  }

  // --- Resolución automática ---
  const minUp = 10 + N + 1;
  await comprobar(s1, "UP", minUp);
  incs = await incidentesDe(s1.id);
  const resuelto1 = incs[0];
  hist = await historialDe(resuelto1.id);
  caso(
    "Una comprobación UP pasa el incidente a Resuelto con fecha_resolucion = timestamp de esa comprobación",
    incs.length === 1 && resuelto1.estado === "Resuelto" && mismaFecha(resuelto1.fecha_resolucion, minuto(minUp)),
    JSON.stringify(incs)
  );
  caso(
    "La resolución queda en el historial como cambio del Sistema (Detectado → Resuelto)",
    hist.length === 2 && hist[1].estado_anterior === "Detectado" && hist[1].estado_nuevo === "Resuelto" && hist[1].usuario_id === null,
    JSON.stringify(hist)
  );

  // Nueva caída después de Resuelto => incidente NUEVO.
  const minNueva = minUp + 10;
  for (let i = 0; i < N; i++) await comprobar(s1, "DOWN", minNueva + i);
  incs = await incidentesDe(s1.id);
  caso(
    "Una nueva caída después de Resuelto abre OTRO incidente (con su propia fecha_inicio)",
    incs.length === 2 && incs[1].estado === "Detectado" && mismaFecha(incs[1].fecha_inicio, minuto(minNueva)),
    JSON.stringify(incs)
  );
  const inc2 = incs[1];

  // Resolución automática desde un estado intermedio (lo avanzó una persona).
  for (let i = 0; i < N; i++) await comprobar(s2, "DOWN", 5 + i);
  const inc3 = (await incidentesDe(s2.id))[0];
  await llamar("PATCH", `/api/incidentes/${inc3.id}/estado`, { token: A.token, body: { estado: "Investigando" } });
  // La comprobación UP es posterior al cambio manual (hecho con la hora real).
  await comprobar(s2, "UP", 0, minutoFuturo);
  const inc3d = (await incidentesDe(s2.id))[0];
  hist = await historialDe(inc3.id);
  caso(
    "Resolución automática desde 'Investigando' (excepción al flujo, hecha por el Sistema)",
    inc3d.estado === "Resuelto" && hist.length === 3 && hist[2].estado_anterior === "Investigando" && hist[2].usuario_id === null,
    JSON.stringify(hist)
  );

  // Aislamiento de errores: el módulo nunca lanza.
  let lanzo = false;
  try {
    await evaluarComprobacion({ id: -1, nombre: "inexistente" }, { id: "0", estado: "DOWN" });
    await evaluarComprobacion(undefined, { id: "0", estado: "UP" });
  } catch {
    lanzo = true;
  }
  caso("Un error interno de incidentes se loguea y no se propaga al monitor", !lanzo);

  // Servicio de B con un incidente propio.
  for (let i = 0; i < N; i++) await comprobar(sB, "DOWN", 20 + i);
  const incB = (await incidentesDe(sB.id))[0];

  // --- Autenticación y aislamiento ---
  let r = await llamar("GET", "/api/incidentes");
  caso("Sin token => 401", r.status === 401, JSON.stringify(r.datos));
  r = await llamar("PATCH", `/api/incidentes/${inc2.id}/estado`, { body: { estado: "Investigando" } });
  caso("PATCH sin token => 401", r.status === 401, JSON.stringify(r.datos));

  r = await llamar("GET", `/api/incidentes/${inc2.id}`, { token: B.token });
  caso("Detalle de un incidente ajeno => 404", esError(r, 404, "Incidente no encontrado."), JSON.stringify(r.datos));
  r = await llamar("PATCH", `/api/incidentes/${inc2.id}/estado`, { token: B.token, body: { estado: "Investigando" } });
  caso("Cambio de estado de un incidente ajeno => 404", esError(r, 404, "Incidente no encontrado."), JSON.stringify(r.datos));
  r = await llamar("PATCH", `/api/incidentes/${inc2.id}/severidad`, { token: B.token, body: { severidad: "Baja" } });
  caso("Cambio de severidad de un incidente ajeno => 404", esError(r, 404, "Incidente no encontrado."), JSON.stringify(r.datos));
  for (const id of ["abc", "0", "-3", "99999999999999999999"]) {
    r = await llamar("GET", `/api/incidentes/${id}`, { token: A.token });
    caso(`Id no válido '${id}' => 404 con el mismo mensaje`, esError(r, 404, "Incidente no encontrado."), JSON.stringify(r.datos));
  }
  r = await llamar("GET", "/api/incidentes/2147483647", { token: A.token });
  caso("Incidente inexistente => 404", esError(r, 404, "Incidente no encontrado."), JSON.stringify(r.datos));
  const inc2Intacto = (await query("SELECT estado, severidad FROM incidentes WHERE id = $1", [inc2.id])).rows[0];
  caso("Los intentos ajenos no modificaron el incidente", inc2Intacto.estado === "Detectado" && inc2Intacto.severidad === "Alta");

  // --- Listado y filtros (US21 / US22) ---
  r = await llamar("GET", "/api/incidentes", { token: A.token });
  const ids = (r.datos || []).map((i) => i.id);
  caso(
    "Listado: solo incidentes propios, el más reciente primero, con servicio_nombre y campos exactos",
    r.status === 200 && Array.isArray(r.datos) && r.datos.length === 3 && !ids.includes(incB.id) &&
      r.datos.every((i) => mismoConjunto(i, CAMPOS_INCIDENTE)) && r.datos[0].id === inc2.id && r.datos.find((i) => i.id === inc2.id).servicio_nombre === "Servicio uno",
    JSON.stringify(r.datos)
  );
  r = await llamar("GET", "/api/incidentes", { token: B.token });
  caso("El listado de B solo tiene los suyos", r.status === 200 && r.datos.length === 1 && r.datos[0].id === incB.id, JSON.stringify(r.datos));
  r = await llamar("GET", `/api/incidentes?servicio_id=${s2.id}`, { token: A.token });
  caso("Filtro por servicio", r.status === 200 && r.datos.length === 1 && r.datos[0].id === inc3.id, JSON.stringify(r.datos));
  r = await llamar("GET", "/api/incidentes?estado=activos", { token: A.token });
  caso("Filtro estado=activos (no Resuelto ni Cerrado)", r.status === 200 && r.datos.length === 1 && r.datos[0].id === inc2.id, JSON.stringify(r.datos));
  r = await llamar("GET", "/api/incidentes?estado=Resuelto", { token: A.token });
  caso("Filtro por estado del flujo (Resuelto)", r.status === 200 && r.datos.length === 2 && r.datos.every((i) => i.estado === "Resuelto"), JSON.stringify(r.datos));
  const iso = (n) => encodeURIComponent(minuto(n).toISOString());
  r = await llamar("GET", `/api/incidentes?desde=${iso(minNueva)}`, { token: A.token });
  caso("Filtro desde (inclusivo, contra fecha_inicio)", r.status === 200 && r.datos.length === 1 && r.datos[0].id === inc2.id, JSON.stringify(r.datos));
  r = await llamar("GET", `/api/incidentes?hasta=${iso(10)}&servicio_id=${s1.id}`, { token: A.token });
  caso("Filtro hasta (inclusivo) combinado con servicio", r.status === 200 && r.datos.length === 1 && r.datos[0].id === resuelto1.id, JSON.stringify(r.datos));
  r = await llamar("GET", `/api/incidentes?desde=${iso(10)}&hasta=${iso(10)}&servicio_id=${s1.id}`, { token: A.token });
  caso("desde = hasta devuelve solo esa fecha", r.status === 200 && r.datos.length === 1 && r.datos[0].id === resuelto1.id, JSON.stringify(r.datos));
  r = await llamar("GET", "/api/incidentes?estado=Inventado", { token: A.token });
  caso("Filtro de estado inválido => 400", esError(r, 400, "El filtro de estado no es válido."), JSON.stringify(r.datos));
  r = await llamar("GET", "/api/incidentes?desde=ayer", { token: A.token });
  caso("Fecha inválida => 400", esError(r, 400, "Las fechas tienen que tener formato ISO válido."), JSON.stringify(r.datos));
  r = await llamar("GET", "/api/incidentes?desde=2026-02-30", { token: A.token });
  caso("Fecha imposible => 400", esError(r, 400, "Las fechas tienen que tener formato ISO válido."), JSON.stringify(r.datos));
  r = await llamar("GET", `/api/incidentes?desde=${iso(5)}&hasta=${iso(1)}`, { token: A.token });
  caso("desde posterior a hasta => 400", esError(r, 400, "La fecha 'desde' no puede ser posterior a 'hasta'."), JSON.stringify(r.datos));
  r = await llamar("GET", "/api/incidentes?servicio_id=abc", { token: A.token });
  caso("servicio_id inválido => 400", r.status === 400, JSON.stringify(r.datos));

  // --- Detalle con historial (US15) ---
  r = await llamar("GET", `/api/incidentes/${resuelto1.id}`, { token: A.token });
  const h = r.datos?.historial ?? [];
  caso(
    "Detalle: incidente + historial ascendente, con usuario 'Sistema' y campos exactos",
    r.status === 200 && mismoConjunto(r.datos, [...CAMPOS_INCIDENTE, "historial"]) && h.length === 2 && h.every((x) => mismoConjunto(x, CAMPOS_HISTORIAL)) &&
      new Date(h[0].fecha_cambio) < new Date(h[1].fecha_cambio) && h[0].usuario === "Sistema" && h[1].usuario === "Sistema" && h[0].estado_anterior === null,
    JSON.stringify(r.datos)
  );

  // --- Flujo de estados (US14 / US16) ---
  const estado = (id, token, e) => llamar("PATCH", `/api/incidentes/${id}/estado`, { token, body: { estado: e } });
  r = await estado(inc2.id, A.token, "Identificado");
  caso("No se puede saltear un estado", esError(r, 409, 'Desde "Detectado" solo se puede pasar a "Investigando".'), JSON.stringify(r.datos));
  r = await estado(inc2.id, A.token, "Detectado");
  caso("No se puede repetir el estado actual", esError(r, 409, 'Desde "Detectado" solo se puede pasar a "Investigando".'), JSON.stringify(r.datos));
  r = await estado(inc2.id, A.token, "Cerrado");
  caso("No se puede cerrar sin pasar por Resuelto", esError(r, 409, 'Desde "Detectado" solo se puede pasar a "Investigando".'), JSON.stringify(r.datos));
  r = await estado(inc2.id, A.token, "Inventado");
  caso("Estado que no existe => 400", esError(r, 400, "El estado no es válido."), JSON.stringify(r.datos));
  r = await llamar("PATCH", `/api/incidentes/${inc2.id}/estado`, { token: A.token, body: {} });
  caso("Sin estado => 400", esError(r, 400, "El estado no es válido."), JSON.stringify(r.datos));

  r = await estado(inc2.id, A.token, "Investigando");
  caso(
    "Detectado → Investigando => 200 con el incidente completo y su historial",
    r.status === 200 && r.datos.estado === "Investigando" && mismoConjunto(r.datos, [...CAMPOS_INCIDENTE, "historial"]) && r.datos.historial.length === 2 &&
      r.datos.historial[1].usuario === "Usuario A" && r.datos.historial[1].estado_anterior === "Detectado",
    JSON.stringify(r.datos)
  );
  r = await estado(inc2.id, A.token, "Detectado");
  caso("No se puede retroceder", esError(r, 409, 'Desde "Investigando" solo se puede pasar a "Identificado".'), JSON.stringify(r.datos));
  r = await estado(inc2.id, A.token, "Identificado");
  caso("Investigando → Identificado", r.status === 200 && r.datos.estado === "Identificado" && r.datos.fecha_resolucion === null, JSON.stringify(r.datos));
  r = await estado(inc2.id, A.token, "Resuelto");
  caso("Identificado → Resuelto completa fecha_resolucion", r.status === 200 && r.datos.estado === "Resuelto" && r.datos.fecha_resolucion !== null, JSON.stringify(r.datos));
  r = await estado(inc2.id, A.token, "Cerrado");
  caso("Resuelto → Cerrado (US16)", r.status === 200 && r.datos.estado === "Cerrado" && r.datos.historial.length === 5, JSON.stringify(r.datos));
  caso(
    "Cada cambio manual queda con fecha y usuario",
    r.datos.historial.slice(1).every((x) => x.usuario === "Usuario A" && !Number.isNaN(new Date(x.fecha_cambio).getTime())),
    JSON.stringify(r.datos.historial)
  );
  r = await estado(inc2.id, A.token, "Cerrado");
  caso("Un incidente Cerrado no admite cambios de estado", esError(r, 409, "Un incidente cerrado no admite más cambios."), JSON.stringify(r.datos));
  r = await llamar("PATCH", `/api/incidentes/${inc2.id}/severidad`, { token: A.token, body: { severidad: "Baja" } });
  caso("Un incidente Cerrado no admite cambios de severidad", esError(r, 409, "Un incidente cerrado no admite más cambios."), JSON.stringify(r.datos));

  // Después de Cerrado, una nueva caída abre otro incidente.
  // El cierre manual se hizo con la hora real: las nuevas fallas tienen que ser posteriores.
  for (let i = 0; i < N; i++) await comprobar(s1, "DOWN", i, minutoFuturo);
  incs = await incidentesDe(s1.id);
  caso(
    "Una nueva caída después de Cerrado abre otro incidente",
    incs.length === 3 && incs[2].estado === "Detectado" && mismaFecha(incs[2].fecha_inicio, minutoFuturo(0)),
    JSON.stringify(incs.map((i) => [i.id, i.estado]))
  );

  // --- Severidad (US17) ---
  const inc4 = incs[2];
  r = await llamar("PATCH", `/api/incidentes/${inc4.id}/severidad`, { token: A.token, body: { severidad: "Crítica" } });
  caso("Severidad válida => 200 con el incidente completo", r.status === 200 && r.datos.severidad === "Crítica" && Array.isArray(r.datos.historial) && r.datos.estado === "Detectado", JSON.stringify(r.datos));
  for (const s of ["Urgente", "alta", 5, null]) {
    r = await llamar("PATCH", `/api/incidentes/${inc4.id}/severidad`, { token: A.token, body: { severidad: s } });
    caso(`Severidad inválida (${JSON.stringify(s)}) => 400`, esError(r, 400, "La severidad tiene que ser una de: Crítica, Alta, Media, Baja."), JSON.stringify(r.datos));
  }
  r = await llamar("GET", `/api/incidentes/${inc4.id}`, { token: A.token });
  caso("La severidad inválida no modificó el incidente", r.datos?.severidad === "Crítica");
} catch (err) {
  fallos++;
  console.error(`FALLÓ  Error durante la prueba: ${err.stack || err.message}`);
} finally {
  await query("DELETE FROM usuarios WHERE email = ANY($1)", [emails]).catch((err) =>
    console.error(`No se pudieron borrar los datos de prueba: ${err.message}`)
  );
  await pool.end();
}

console.log(fallos === 0 ? "\nTodas las pruebas pasaron." : `\n${fallos} prueba(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
