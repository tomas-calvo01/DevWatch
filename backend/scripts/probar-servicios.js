// scripts/probar-servicios.js
// Pruebas del Módulo de Servicios (actividad 3.2: US05-US08 y US12). Requiere el
// servidor corriendo (npm run dev) y la base con db/schema.sql aplicado.
// Crea dos usuarios con email aleatorio y, al terminar (aunque falle algo), los borra:
// ON DELETE CASCADE elimina también sus servicios y comprobaciones.
// Uso: npm run probar-servicios   (opcional: API_URL=http://localhost:3000)
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Copiá .env.example como .env y completá los valores.");
  process.exit(1);
}

const { pool, query } = await import("../src/db.js");

const BASE = process.env.API_URL || "http://localhost:3000";
const sufijo = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const password = "clave123";
const emails = [`serv_a_${sufijo}@devwatch.test`, `serv_b_${sufijo}@devwatch.test`];

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
  return { status: res.status, datos, texto };
}

function caso(nombre, condicion, detalle = "") {
  if (condicion) {
    console.log(`OK     ${nombre}`);
  } else {
    fallos++;
    console.log(`FALLÓ  ${nombre} ${detalle}`);
  }
}

function esError(r, status, mensaje) {
  return r.status === status && r.datos?.error === mensaje;
}

const mismoConjunto = (obj, claves) => JSON.stringify(Object.keys(obj).sort()) === JSON.stringify([...claves].sort());
const CAMPOS_SERVICIO = ["id", "usuario_id", "nombre", "url", "tipo", "intervalo_segundos", "activo", "fecha_creacion", "ultimo_estado"];
const CAMPOS_COMPROBACION = ["id", "servicio_id", "timestamp", "estado", "status_code", "tiempo_respuesta_ms"];

async function crearUsuario(nombre, email) {
  const reg = await llamar("POST", "/api/auth/registro", { body: { nombre, email, password } });
  const login = await llamar("POST", "/api/auth/login", { body: { email, password } });
  if (reg.status !== 201 || login.status !== 200) throw new Error(`No se pudo crear el usuario de prueba ${email}`);
  return { id: login.datos.usuario.id, token: login.datos.token };
}

try {
  const A = await crearUsuario("Usuario A", emails[0]);
  const B = await crearUsuario("Usuario B", emails[1]);
  const url = (n) => `https://servicio-${n}-${sufijo}.devwatch.test`;

  // --- 5.1 Autenticación ---
  let r = await llamar("GET", "/api/servicios");
  caso("Sin token => 401", r.status === 401, JSON.stringify(r.datos));
  r = await llamar("POST", "/api/servicios", { body: { nombre: "x", url: url("x") } });
  caso("Alta sin token => 401", r.status === 401, JSON.stringify(r.datos));

  // --- 5.2 Alta ---
  r = await llamar("POST", "/api/servicios", { token: A.token, body: { nombre: "  Servicio A1  ", url: url("a1") } });
  const a1 = r.datos;
  caso(
    "Alta válida => 201, del usuario, activo, ultimo_estado null, valores por defecto",
    r.status === 201 && mismoConjunto(a1, CAMPOS_SERVICIO) && a1.usuario_id === A.id && a1.nombre === "Servicio A1" &&
      a1.activo === true && a1.ultimo_estado === null && a1.tipo === "HTTP" && a1.intervalo_segundos === 60,
    JSON.stringify(r.datos)
  );
  r = await llamar("POST", "/api/servicios", {
    token: A.token,
    body: { nombre: "Servicio A2", url: url("a2"), tipo: "HTTP", intervalo_segundos: 30, usuario_id: B.id, activo: false },
  });
  const a2 = r.datos;
  caso(
    "Alta con intervalo propio; ignora usuario_id y activo enviados por el cliente",
    r.status === 201 && a2.intervalo_segundos === 30 && a2.usuario_id === A.id && a2.activo === true,
    JSON.stringify(r.datos)
  );

  // --- 5.3 Validaciones ---
  const valido = { nombre: "N", url: url("v") };
  const validar = async (nombre, body, status, mensaje) => {
    const x = await llamar("POST", "/api/servicios", { token: A.token, body: { ...valido, ...body } });
    caso(nombre, esError(x, status, mensaje), JSON.stringify(x.datos));
  };
  await validar("Nombre vacío => 400", { nombre: "   " }, 400, "El nombre es obligatorio.");
  await validar("Nombre de tipo incorrecto => 400", { nombre: 123 }, 400, "El nombre es obligatorio.");
  await validar("Nombre de 121 caracteres => 400", { nombre: "x".repeat(121) }, 400, "El nombre no puede superar los 120 caracteres.");
  await validar("URL ausente => 400", { url: "" }, 400, "La URL es obligatoria.");
  await validar("URL ftp:// => 400", { url: "ftp://servidor.com" }, 400, "La URL tiene que empezar con http:// o https://.");
  await validar("URL javascript: => 400", { url: "javascript:alert(1)" }, 400, "La URL tiene que empezar con http:// o https://.");
  await validar("URL inválida => 400", { url: "http://" }, 400, "La URL no es válida. Ejemplo: https://www.ejemplo.com");
  await validar("Tipo inválido => 400", { tipo: "TCP" }, 400, "El tipo de servicio no es válido.");
  await validar("Intervalo menor que 10 => 400", { intervalo_segundos: 9 }, 400, "El intervalo mínimo es de 10 segundos.");
  await validar("Intervalo 'abc' => 400", { intervalo_segundos: "abc" }, 400, "El intervalo tiene que ser un número entero de segundos.");
  await validar("Intervalo '60' (texto) => 400", { intervalo_segundos: "60" }, 400, "El intervalo tiene que ser un número entero de segundos.");
  await validar("Intervalo decimal => 400", { intervalo_segundos: 30.5 }, 400, "El intervalo tiene que ser un número entero de segundos.");
  await validar("Intervalo fuera del rango de INTEGER => 400 (no 500)", { intervalo_segundos: 1e12 }, 400, "El intervalo tiene que ser un número entero de segundos.");

  for (const [valor, nombre] of [["false", "texto"], [0, "número 0"], [1, "número 1"], [null, "null"]]) {
    r = await llamar("PATCH", `/api/servicios/${a1.id}/activo`, { token: A.token, body: { activo: valor } });
    caso(`Activación con ${nombre} => 400`, esError(r, 400, "El campo activo tiene que ser verdadero o falso."), JSON.stringify(r.datos));
  }
  r = await llamar("PATCH", `/api/servicios/${a1.id}/activo`, { token: A.token, body: {} });
  caso("Activación sin el campo => 400", esError(r, 400, "El campo activo tiene que ser verdadero o falso."), JSON.stringify(r.datos));

  for (const id of ["abc", "0", "-5", "1.5", "99999999999999999999"]) {
    r = await llamar("GET", `/api/servicios/${id}`, { token: A.token });
    caso(`Id de ruta inválido '${id}' => 404`, esError(r, 404, "Servicio no encontrado."), JSON.stringify(r.datos));
  }

  // --- 5.4 Duplicados ---
  r = await llamar("POST", "/api/servicios", { token: A.token, body: { nombre: "Repetido", url: url("a1") } });
  caso("URL repetida del mismo usuario => 409", esError(r, 409, "Ya registraste un servicio con esa URL."), JSON.stringify(r.datos));
  try {
    await query("INSERT INTO servicios (usuario_id, nombre, url) VALUES ($1, 'dup', $2)", [A.id, url("a1")]);
    caso("La base rechaza la URL repetida (índice único)", false, "el INSERT directo no falló");
  } catch (err) {
    caso(
      "La base rechaza la URL repetida (23505, uq_servicios_usuario_url)",
      err.code === "23505" && err.constraint === "uq_servicios_usuario_url",
      `${err.code} ${err.constraint}`
    );
  }
  r = await llamar("POST", "/api/servicios", { token: B.token, body: { nombre: "Misma URL, otro usuario", url: url("a1") } });
  const b1 = r.datos;
  caso("La misma URL en otro usuario es válida => 201", r.status === 201, JSON.stringify(r.datos));
  r = await llamar("PUT", `/api/servicios/${a2.id}`, { token: A.token, body: { nombre: "A2", url: url("a1") } });
  caso("Editar con la URL de otro servicio propio => 409", esError(r, 409, "Ya registraste un servicio con esa URL."), JSON.stringify(r.datos));

  // --- 5.5 Aislamiento entre usuarios ---
  r = await llamar("POST", "/api/servicios", { token: B.token, body: { nombre: "Servicio B2", url: url("b2") } });
  const b2 = r.datos;
  const listaA = (await llamar("GET", "/api/servicios", { token: A.token })).datos;
  const listaB = (await llamar("GET", "/api/servicios", { token: B.token })).datos;
  caso(
    "El listado de A solo tiene servicios de A (ordenado por fecha_creacion DESC)",
    Array.isArray(listaA) && listaA.length === 2 && listaA.every((s) => s.usuario_id === A.id) && listaA[0].id === a2.id &&
      listaA.every((s) => mismoConjunto(s, CAMPOS_SERVICIO)),
    JSON.stringify(listaA)
  );
  caso(
    "El listado de B solo tiene servicios de B",
    Array.isArray(listaB) && listaB.length === 2 && listaB.every((s) => s.usuario_id === B.id) && !listaB.some((s) => s.id === a1.id),
    JSON.stringify(listaB)
  );
  r = await llamar("GET", `/api/servicios/${a1.id}`, { token: A.token });
  caso("Detalle de un servicio propio => 200", r.status === 200 && r.datos.id === a1.id && mismoConjunto(r.datos, CAMPOS_SERVICIO), JSON.stringify(r.datos));
  const ajeno = { token: B.token };
  r = await llamar("GET", `/api/servicios/${a1.id}`, ajeno);
  caso("Detalle de un servicio ajeno => 404", esError(r, 404, "Servicio no encontrado."), JSON.stringify(r.datos));
  r = await llamar("PUT", `/api/servicios/${a1.id}`, { ...ajeno, body: { nombre: "Hackeado", url: url("hack") } });
  caso("Edición de un servicio ajeno => 404", esError(r, 404, "Servicio no encontrado."), JSON.stringify(r.datos));
  r = await llamar("PATCH", `/api/servicios/${a1.id}/activo`, { ...ajeno, body: { activo: false } });
  caso("Activación de un servicio ajeno => 404", esError(r, 404, "Servicio no encontrado."), JSON.stringify(r.datos));
  r = await llamar("GET", `/api/servicios/${a1.id}/comprobaciones`, ajeno);
  caso("Historial de un servicio ajeno => 404", esError(r, 404, "Servicio no encontrado."), JSON.stringify(r.datos));
  r = await llamar("DELETE", `/api/servicios/${a1.id}`, ajeno);
  caso("Eliminación de un servicio ajeno => 404", esError(r, 404, "Servicio no encontrado."), JSON.stringify(r.datos));
  r = await llamar("GET", `/api/servicios/${a1.id}`, { token: A.token });
  caso("El servicio ajeno no fue modificado ni borrado", r.status === 200 && r.datos.nombre === "Servicio A1" && r.datos.activo === true, JSON.stringify(r.datos));
  r = await llamar("GET", "/api/servicios/2147483647", { token: A.token });
  caso("Servicio inexistente => 404", esError(r, 404, "Servicio no encontrado."), JSON.stringify(r.datos));

  // --- 5.9 Historial (se insertan comprobaciones directo en la base) ---
  // Servicio a1: 5 comprobaciones, de a una hora; la más reciente es DOWN.
  const t0 = new Date(Date.UTC(2026, 0, 10, 12, 0, 0));
  const hora = (n) => new Date(t0.getTime() + n * 3600 * 1000);
  const filas = [
    [0, "UP", 200, 120],
    [1, "UP", 200, 130],
    [2, "TIMEOUT", null, null],
    [3, "UP", 200, 110],
    [4, "DOWN", 500, 90],
  ];
  for (const [n, estado, code, ms] of filas) {
    await query(
      "INSERT INTO comprobaciones (servicio_id, timestamp, estado, status_code, tiempo_respuesta_ms) VALUES ($1, $2, $3, $4, $5)",
      [a1.id, hora(n), estado, code, ms]
    );
  }
  // Servicio b1 (de B): una comprobación que A nunca tiene que ver.
  await query("INSERT INTO comprobaciones (servicio_id, estado, status_code, tiempo_respuesta_ms) VALUES ($1, 'UP', 200, 50)", [b1.id]);
  // Servicio a2: 520 comprobaciones para probar límite y paginación.
  await query(
    `INSERT INTO comprobaciones (servicio_id, timestamp, estado, status_code, tiempo_respuesta_ms)
     SELECT $1, $2::timestamp + make_interval(mins => g), 'UP', 200, g FROM generate_series(1, 520) g`,
    [a2.id, "2026-02-01 00:00:00"]
  );

  const hist = (id, qs = "", token = A.token) => llamar("GET", `/api/servicios/${id}/comprobaciones${qs}`, { token });
  const iso = (n) => encodeURIComponent(hora(n).toISOString());

  r = await hist(a1.id);
  const todas = r.datos;
  caso(
    "Historial: array, 5 filas, orden descendente y campos exactos",
    r.status === 200 && Array.isArray(todas) && todas.length === 5 && todas.every((c) => mismoConjunto(c, CAMPOS_COMPROBACION)) &&
      todas.every((c, i) => i === 0 || new Date(todas[i - 1].timestamp) > new Date(c.timestamp)) && todas[0].estado === "DOWN",
    JSON.stringify(r.datos)
  );
  caso(
    "Historial: id es string (BIGSERIAL) y los datos nulos llegan como null",
    typeof todas[0].id === "string" && todas[2].estado === "TIMEOUT" && todas[2].status_code === null && todas[2].tiempo_respuesta_ms === null &&
      todas.every((c) => c.servicio_id === a1.id),
    JSON.stringify(todas[0])
  );
  caso(
    "Historial no incluye comprobaciones de otro usuario",
    !todas.some((c) => c.servicio_id === b1.id),
    ""
  );

  r = await hist(a1.id, `?desde=${iso(2)}`);
  caso("Filtro desde (extremo incluido) => 3 filas", r.status === 200 && r.datos.length === 3 && new Date(r.datos[2].timestamp).getTime() === hora(2).getTime(), JSON.stringify(r.datos));
  r = await hist(a1.id, `?hasta=${iso(2)}`);
  caso("Filtro hasta (extremo incluido) => 3 filas", r.status === 200 && r.datos.length === 3 && new Date(r.datos[0].timestamp).getTime() === hora(2).getTime(), JSON.stringify(r.datos));
  r = await hist(a1.id, `?desde=${iso(1)}&hasta=${iso(3)}`);
  caso("Filtros desde + hasta => 3 filas (horas 1, 2 y 3)", r.status === 200 && r.datos.length === 3 && r.datos[0].estado === "UP" && r.datos[1].estado === "TIMEOUT", JSON.stringify(r.datos));
  r = await hist(a1.id, `?desde=${iso(2)}&hasta=${iso(2)}`);
  caso("desde = hasta devuelve solo esa comprobación", r.status === 200 && r.datos.length === 1 && r.datos[0].estado === "TIMEOUT", JSON.stringify(r.datos));

  for (const [valor, nombre] of [["ayer", "texto libre"], ["2026-02-30", "día imposible"], ["2026-13-01", "mes imposible"], ["2026-01-01T25:00:00Z", "hora imposible"]]) {
    r = await hist(a1.id, `?desde=${encodeURIComponent(valor)}`);
    caso(`Fecha inválida (${nombre}) => 400`, esError(r, 400, "Las fechas tienen que tener formato ISO válido."), JSON.stringify(r.datos));
  }
  r = await hist(a1.id, `?hasta=xyz`);
  caso("Fecha 'hasta' inválida => 400", esError(r, 400, "Las fechas tienen que tener formato ISO válido."), JSON.stringify(r.datos));
  r = await hist(a1.id, `?desde=${iso(3)}&hasta=${iso(1)}`);
  caso("desde posterior a hasta => 400", esError(r, 400, "La fecha 'desde' no puede ser posterior a 'hasta'."), JSON.stringify(r.datos));
  r = await hist(a1.id, "?limite=0");
  caso("limite=0 => 400", r.status === 400, JSON.stringify(r.datos));
  r = await hist(a1.id, "?pagina=abc");
  caso("pagina inválida => 400", r.status === 400, JSON.stringify(r.datos));

  r = await hist(a2.id);
  caso("Límite por defecto: 100 filas", r.status === 200 && r.datos.length === 100, `hubo ${r.datos?.length}`);
  r = await hist(a2.id, "?limite=25");
  caso("Límite personalizado (25)", r.status === 200 && r.datos.length === 25, `hubo ${r.datos?.length}`);
  r = await hist(a2.id, "?limite=500");
  const completo = r.datos;
  caso("Límite 500 => 500 filas", r.status === 200 && completo.length === 500, `hubo ${completo?.length}`);
  r = await hist(a2.id, "?limite=100000");
  caso("Límite mayor que 500 se recorta a 500", r.status === 200 && r.datos.length === 500, `hubo ${r.datos?.length}`);
  r = await hist(a2.id, "?limite=10&pagina=3");
  caso(
    "Paginación consistente (limite=10, pagina=3 = filas 21-30 del historial completo)",
    r.status === 200 && r.datos.length === 10 && r.datos.every((c, i) => c.id === completo[20 + i].id),
    JSON.stringify(r.datos.map((c) => c.id))
  );
  r = await hist(a2.id, "?limite=500&pagina=2");
  caso("Última página parcial (520 filas: pagina 2 con limite 500 => 20)", r.status === 200 && r.datos.length === 20, `hubo ${r.datos?.length}`);
  r = await hist(a2.id, "?limite=500&pagina=3");
  caso("Página vacía => array vacío", r.status === 200 && Array.isArray(r.datos) && r.datos.length === 0, JSON.stringify(r.datos));

  // ultimo_estado: la comprobación más reciente de a1 es DOWN; la de a2, UP.
  r = await llamar("GET", `/api/servicios/${a1.id}`, { token: A.token });
  caso("ultimo_estado = estado de la comprobación más reciente (DOWN)", r.datos?.ultimo_estado === "DOWN", JSON.stringify(r.datos));
  const lista2 = (await llamar("GET", "/api/servicios", { token: A.token })).datos;
  caso(
    "El listado devuelve ultimo_estado de cada servicio",
    lista2.find((s) => s.id === a1.id)?.ultimo_estado === "DOWN" && lista2.find((s) => s.id === a2.id)?.ultimo_estado === "UP",
    JSON.stringify(lista2.map((s) => [s.id, s.ultimo_estado]))
  );

  // --- 5.6 Edición ---
  r = await llamar("PUT", `/api/servicios/${a1.id}`, {
    token: A.token,
    body: { nombre: "A1 editado", url: url("a1-editada"), tipo: "HTTP", intervalo_segundos: 45, activo: false, usuario_id: B.id },
  });
  caso(
    "Edición válida => 200, ultimo_estado se mantiene, no cambia activo ni usuario_id",
    r.status === 200 && r.datos.nombre === "A1 editado" && r.datos.url === url("a1-editada") && r.datos.intervalo_segundos === 45 &&
      r.datos.ultimo_estado === "DOWN" && r.datos.activo === true && r.datos.usuario_id === A.id && r.datos.id === a1.id &&
      mismoConjunto(r.datos, CAMPOS_SERVICIO),
    JSON.stringify(r.datos)
  );
  r = await hist(a1.id);
  caso("Edición: el historial se conserva", r.status === 200 && r.datos.length === 5, `hubo ${r.datos?.length}`);
  r = await llamar("PUT", `/api/servicios/${a1.id}`, { token: A.token, body: { nombre: "", url: url("a1-editada") } });
  caso("Edición con datos inválidos => 400", esError(r, 400, "El nombre es obligatorio."), JSON.stringify(r.datos));
  r = await llamar("PUT", `/api/servicios/${a1.id}`, { token: A.token, body: { nombre: "A1 editado", url: url("a1-editada"), intervalo_segundos: 5 } });
  caso("Edición con intervalo < 10 => 400", esError(r, 400, "El intervalo mínimo es de 10 segundos."), JSON.stringify(r.datos));
  r = await llamar("GET", `/api/servicios/${a1.id}`, { token: A.token });
  caso("Las ediciones inválidas no modificaron el servicio", r.datos?.nombre === "A1 editado" && r.datos?.intervalo_segundos === 45, JSON.stringify(r.datos));

  // --- 5.7 Activación ---
  r = await llamar("PATCH", `/api/servicios/${a1.id}/activo`, { token: A.token, body: { activo: false } });
  caso("Desactivar => 200 con activo=false", r.status === 200 && r.datos.activo === false && mismoConjunto(r.datos, CAMPOS_SERVICIO) && r.datos.ultimo_estado === "DOWN", JSON.stringify(r.datos));
  r = await llamar("PATCH", `/api/servicios/${a1.id}/activo`, { token: A.token, body: { activo: true } });
  caso("Activar => 200 con activo=true", r.status === 200 && r.datos.activo === true, JSON.stringify(r.datos));

  // --- 5.8 Eliminación ---
  r = await llamar("DELETE", `/api/servicios/${a1.id}`, { token: A.token });
  caso("Eliminar servicio propio => 204 sin cuerpo", r.status === 204 && r.texto === "", `status ${r.status} cuerpo '${r.texto}'`);
  r = await llamar("GET", `/api/servicios/${a1.id}`, { token: A.token });
  caso("Consultar el servicio eliminado => 404", esError(r, 404, "Servicio no encontrado."), JSON.stringify(r.datos));
  const restantes = await query("SELECT count(*)::int AS n FROM comprobaciones WHERE servicio_id = $1", [a1.id]);
  caso("Sus comprobaciones se eliminaron en cascada", restantes.rows[0].n === 0, `quedaron ${restantes.rows[0].n}`);
  r = await llamar("DELETE", `/api/servicios/${a1.id}`, { token: A.token });
  caso("Eliminar de nuevo => 404", esError(r, 404, "Servicio no encontrado."), JSON.stringify(r.datos));
  void b2;
} catch (err) {
  fallos++;
  console.error(`FALLÓ  Error durante la prueba: ${err.message}`);
} finally {
  // Solo se borran los usuarios creados por esta ejecución (los servicios y
  // comprobaciones se eliminan por ON DELETE CASCADE).
  await query("DELETE FROM usuarios WHERE email = ANY($1)", [emails]).catch((err) =>
    console.error(`No se pudieron borrar los datos de prueba: ${err.message}`)
  );
  await pool.end();
}

console.log(fallos === 0 ? "\nTodas las pruebas pasaron." : `\n${fallos} prueba(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
