// scripts/probar-auth.js
// Pruebas de humo del módulo de Usuarios (US01-US04). Requiere el servidor corriendo.
// Uso: npm run probar   (opcional: API_URL=http://localhost:3000)
const BASE = process.env.API_URL || "http://localhost:3000";

const sufijo = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const email = `prueba_${sufijo}@devwatch.test`;
const emailNuevo = `prueba_editado_${sufijo}@devwatch.test`;
const password = "clave123";

let fallos = 0;

async function llamar(metodo, ruta, { token, body } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const datos = await res.json().catch(() => null);
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

const sinSecretos = (d) => d && !("password" in d) && !("password_hash" in d);

try {
  let r = await llamar("GET", "/api/health");
  caso("Health check", r.status === 200 && r.datos?.estado === "ok", JSON.stringify(r));

  r = await llamar("POST", "/api/auth/registro", { body: { nombre: "Usuario Prueba", email, password } });
  caso(
    "TC01 Registro correcto (201, sin hash)",
    r.status === 201 && r.datos?.email === email && r.datos?.rol === "administrador" && sinSecretos(r.datos),
    JSON.stringify(r)
  );

  r = await llamar("POST", "/api/auth/registro", { body: { nombre: "Otro", email: email.toUpperCase(), password } });
  caso(
    "Registro con email duplicado (409)",
    r.status === 409 && r.datos?.error === "Ya existe una cuenta registrada con ese email.",
    JSON.stringify(r)
  );

  r = await llamar("POST", "/api/auth/registro", { body: { nombre: "", email: "no-es-email", password: "123" } });
  caso("Registro con datos inválidos (400)", r.status === 400, JSON.stringify(r));

  r = await llamar("POST", "/api/auth/login", { body: { email, password } });
  const token = r.datos?.token;
  caso(
    "TC02 Login correcto (200, token + usuario)",
    r.status === 200 && !!token && r.datos?.usuario?.email === email && sinSecretos(r.datos.usuario),
    JSON.stringify(r)
  );

  r = await llamar("POST", "/api/auth/login", { body: { email, password: "incorrecta" } });
  caso(
    "TC03 Login con contraseña incorrecta (401)",
    r.status === 401 && r.datos?.error === "Email o contraseña incorrectos.",
    JSON.stringify(r)
  );

  r = await llamar("GET", "/api/usuarios/me");
  caso("GET /usuarios/me sin token (401)", r.status === 401, JSON.stringify(r));

  r = await llamar("GET", "/api/usuarios/me", { token: "token.invalido.xxx" });
  caso("GET /usuarios/me con token inválido (401)", r.status === 401, JSON.stringify(r));

  r = await llamar("GET", "/api/usuarios/me", { token });
  caso("GET /usuarios/me con token (200)", r.status === 200 && r.datos?.email === email && sinSecretos(r.datos), JSON.stringify(r));

  r = await llamar("PUT", "/api/usuarios/me", { token, body: { nombre: "Nombre Editado", email: emailNuevo } });
  caso(
    "Edición de perfil (200)",
    r.status === 200 && r.datos?.nombre === "Nombre Editado" && r.datos?.email === emailNuevo,
    JSON.stringify(r)
  );

  // Segundo usuario para probar el conflicto de email en la edición.
  const email2 = `prueba2_${sufijo}@devwatch.test`;
  await llamar("POST", "/api/auth/registro", { body: { nombre: "Segundo", email: email2, password } });
  r = await llamar("PUT", "/api/usuarios/me", { token, body: { nombre: "Nombre Editado", email: email2 } });
  caso("Edición con email de otro usuario (409)", r.status === 409, JSON.stringify(r));

  r = await llamar("POST", "/api/auth/logout");
  caso("Logout sin token (401)", r.status === 401, JSON.stringify(r));

  r = await llamar("POST", "/api/auth/logout", { token });
  caso("Logout con token (200)", r.status === 200, JSON.stringify(r));
} catch (err) {
  console.error(`No se pudo contactar al servidor en ${BASE}: ${err.message}`);
  process.exit(1);
}

console.log(fallos === 0 ? "\nTodas las pruebas pasaron." : `\n${fallos} prueba(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
