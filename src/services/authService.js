/**
 * authService.js
 *
 * Simula el Backend API definido en el Documento de Diseño de Arquitectura.
 * Mientras el Backend real (Node/Express + PostgreSQL) no esté listo, este
 * servicio guarda los datos en localStorage del navegador, para poder
 * trabajar el Frontend "sobre datos de prueba" (Acta, Hito 1).
 *
 * Cuando el Backend esté disponible, esta es la ÚNICA capa que hay que
 * reemplazar: las pantallas (Login, Register, Profile) no cambian, porque
 * siempre llaman a estas mismas funciones (register, login, logout,
 * getCurrentUser, updateProfile) sin saber si responde localStorage o un
 * servidor real. Eso es lo que en el Documento de Arquitectura se describe
 * como "el Frontend nunca accede directamente a datos, solo a través de
 * una capa de servicio".
 */

const USERS_KEY = "devwatch_users";
const SESSION_KEY = "devwatch_session";

// Simula la latencia de una llamada de red real (para que el Frontend
// ya maneje bien los estados de carga desde el principio).
function delay(ms = 400) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readUsers() {
  const raw = localStorage.getItem(USERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/**
 * US01 — Registrar un usuario nuevo.
 * Devuelve el usuario creado (sin la contraseña) o lanza un error
 * si el email ya está en uso.
 */
export async function register({ nombre, email, password }) {
  await delay();
  const users = readUsers();

  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error("Ya existe una cuenta registrada con ese email.");
  }

  const nuevoUsuario = {
    id: crypto.randomUUID(),
    nombre,
    email,
    password, // Nota: en el Backend real esto se guarda como password_hash (ver Diseño de Base de Datos), nunca en texto plano.
    rol: "administrador",
    fecha_creacion: new Date().toISOString(),
  };

  users.push(nuevoUsuario);
  writeUsers(users);

  return sinPassword(nuevoUsuario);
}

/**
 * US02 — Iniciar sesión.
 * Guarda el usuario autenticado como sesión activa.
 */
export async function login({ email, password }) {
  await delay();
  const users = readUsers();
  const usuario = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!usuario || usuario.password !== password) {
    throw new Error("Email o contraseña incorrectos.");
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(sinPassword(usuario)));
  return sinPassword(usuario);
}

/**
 * US03 — Cerrar sesión.
 */
export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Devuelve el usuario con sesión activa, o null si no hay nadie logueado.
 * Lo usan las rutas protegidas (ver ProtectedRoute.jsx).
 */
export function getCurrentUser() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

/**
 * US04 — Editar datos del perfil (nombre y email).
 */
export async function updateProfile({ nombre, email }) {
  await delay();
  const users = readUsers();
  const actual = getCurrentUser();
  if (!actual) throw new Error("No hay una sesión activa.");

  const index = users.findIndex((u) => u.id === actual.id);
  if (index === -1) throw new Error("Usuario no encontrado.");

  users[index] = { ...users[index], nombre, email };
  writeUsers(users);

  const actualizado = sinPassword(users[index]);
  localStorage.setItem(SESSION_KEY, JSON.stringify(actualizado));
  return actualizado;
}

function sinPassword(usuario) {
  const { password, ...resto } = usuario;
  return resto;
}
