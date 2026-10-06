/**
 * serviciosService.js
 *
 * Simula los endpoints de Servicios y Comprobaciones del Backend API
 * (Módulo de Servicios, actividad 2.2 de la EDT), igual que authService.js
 * hace con los de Usuarios: los datos se guardan en localStorage para
 * poder trabajar el Frontend "sobre datos de prueba".
 *
 * Historias de usuario que cubre:
 * - US05 — Alta de servicio (crearServicio).
 * - US06 — Edición de servicio (editarServicio).
 * - US07 — Baja de servicio (eliminarServicio).
 * - US08 — Activar / desactivar el monitoreo (cambiarActivo).
 * - US12 — Historial de comprobaciones (obtenerComprobaciones).
 *
 * Cuando el Backend real esté disponible, esta es la única capa que hay
 * que reemplazar: las pantallas siguen llamando a las mismas funciones.
 */
import { getCurrentUser } from "./authService";

const SERVICIOS_KEY = "devwatch_servicios";
const COMPROBACIONES_KEY = "devwatch_comprobaciones";

const INTERVALO_DEFAULT = 60;
const CANTIDAD_COMPROBACIONES_PRUEBA = 50;
// Las comprobaciones de prueba se reparten en los últimos 7 días (y no
// cada `intervalo_segundos`) para que el filtro por fechas de US12 tenga
// datos de varios días sobre los que trabajar.
const DIAS_HISTORIAL_PRUEBA = 7;

// Simula la latencia de una llamada de red real.
function delay(ms = 400) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readServicios() {
  const raw = localStorage.getItem(SERVICIOS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function writeServicios(servicios) {
  localStorage.setItem(SERVICIOS_KEY, JSON.stringify(servicios));
}

function readComprobaciones() {
  const raw = localStorage.getItem(COMPROBACIONES_KEY);
  return raw ? JSON.parse(raw) : [];
}

function writeComprobaciones(comprobaciones) {
  localStorage.setItem(COMPROBACIONES_KEY, JSON.stringify(comprobaciones));
}

// Todas las operaciones son sobre los servicios del usuario logueado.
function usuarioActual() {
  const usuario = getCurrentUser();
  if (!usuario) throw new Error("No hay una sesión activa.");
  return usuario;
}

function buscarIndice(servicios, id) {
  const usuario = usuarioActual();
  const index = servicios.findIndex((s) => s.id === id && s.usuario_id === usuario.id);
  if (index === -1) throw new Error("Servicio no encontrado.");
  return index;
}

function enteroAleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Genera el historial de prueba de un servicio recién creado: la mayoría
// UP (200, 100–400 ms) y algunas DOWN / TIMEOUT (sin status_code).
function generarComprobaciones(servicioId) {
  const ahora = Date.now();
  const paso = (DIAS_HISTORIAL_PRUEBA * 24 * 60 * 60 * 1000) / CANTIDAD_COMPROBACIONES_PRUEBA;
  const comprobaciones = [];

  for (let i = 0; i < CANTIDAD_COMPROBACIONES_PRUEBA; i++) {
    const azar = Math.random();
    let estado = "UP";
    let status_code = 200;
    let tiempo_respuesta_ms = enteroAleatorio(100, 400);

    if (azar > 0.94) {
      estado = "TIMEOUT";
      status_code = null;
      tiempo_respuesta_ms = null;
    } else if (azar > 0.86) {
      estado = "DOWN";
      status_code = null;
      tiempo_respuesta_ms = null;
    }

    comprobaciones.push({
      id: crypto.randomUUID(),
      servicio_id: servicioId,
      timestamp: new Date(ahora - i * paso).toISOString(),
      estado,
      status_code,
      tiempo_respuesta_ms,
    });
  }

  return comprobaciones;
}

// Agrega al servicio el estado de su última comprobación (`ultimo_estado`),
// que es lo que muestran el listado y la cabecera del detalle. Es un dato
// calculado: no se guarda en localStorage.
function conUltimoEstado(servicio, comprobaciones) {
  let ultima = null;
  for (const c of comprobaciones) {
    if (c.servicio_id !== servicio.id) continue;
    if (!ultima || c.timestamp > ultima.timestamp) ultima = c;
  }
  return { ...servicio, ultimo_estado: ultima ? ultima.estado : null };
}

/**
 * Lista los servicios del usuario logueado, del más nuevo al más viejo.
 */
export async function listarServicios() {
  await delay();
  const usuario = usuarioActual();
  const comprobaciones = readComprobaciones();

  return readServicios()
    .filter((s) => s.usuario_id === usuario.id)
    .sort((a, b) => b.fecha_creacion.localeCompare(a.fecha_creacion))
    .map((s) => conUltimoEstado(s, comprobaciones));
}

/**
 * Devuelve un servicio del usuario logueado, o lanza un error si no existe.
 */
export async function obtenerServicio(id) {
  await delay();
  const servicios = readServicios();
  const index = buscarIndice(servicios, id);
  return conUltimoEstado(servicios[index], readComprobaciones());
}

/**
 * US05 — Registrar un servicio nuevo.
 * Además genera comprobaciones de prueba, para que el historial (US12)
 * tenga datos hasta que exista el Motor de Monitoreo real.
 */
export async function crearServicio({ nombre, url, tipo, intervalo_segundos }) {
  await delay();
  const usuario = usuarioActual();

  const nuevoServicio = {
    id: crypto.randomUUID(),
    usuario_id: usuario.id,
    nombre,
    url,
    tipo: tipo || "HTTP",
    intervalo_segundos: intervalo_segundos ?? INTERVALO_DEFAULT,
    activo: true,
    fecha_creacion: new Date().toISOString(),
  };

  const servicios = readServicios();
  servicios.push(nuevoServicio);
  writeServicios(servicios);

  const comprobaciones = readComprobaciones().concat(generarComprobaciones(nuevoServicio.id));
  writeComprobaciones(comprobaciones);

  return conUltimoEstado(nuevoServicio, comprobaciones);
}

/**
 * US06 — Editar un servicio.
 * Solo se pisan los datos editables: el id no cambia, así que el historial
 * de comprobaciones (que referencia al servicio por id) se conserva.
 */
export async function editarServicio(id, { nombre, url, tipo, intervalo_segundos }) {
  await delay();
  const servicios = readServicios();
  const index = buscarIndice(servicios, id);

  servicios[index] = { ...servicios[index], nombre, url, tipo, intervalo_segundos };
  writeServicios(servicios);

  return conUltimoEstado(servicios[index], readComprobaciones());
}

/**
 * US07 — Eliminar un servicio (y sus comprobaciones).
 */
export async function eliminarServicio(id) {
  await delay();
  const servicios = readServicios();
  const index = buscarIndice(servicios, id);

  servicios.splice(index, 1);
  writeServicios(servicios);
  writeComprobaciones(readComprobaciones().filter((c) => c.servicio_id !== id));
}

/**
 * US08 — Activar o desactivar el monitoreo de un servicio.
 */
export async function cambiarActivo(id, activo) {
  await delay();
  const servicios = readServicios();
  const index = buscarIndice(servicios, id);

  servicios[index] = { ...servicios[index], activo };
  writeServicios(servicios);

  return conUltimoEstado(servicios[index], readComprobaciones());
}

/**
 * US12 — Historial de comprobaciones de un servicio, de la más reciente
 * a la más antigua. `desde` y `hasta` son opcionales (fecha ISO o Date)
 * y ambos extremos son inclusivos.
 */
export async function obtenerComprobaciones(servicioId, { desde, hasta } = {}) {
  await delay();
  buscarIndice(readServicios(), servicioId); // valida que el servicio sea del usuario

  const desdeMs = desde ? new Date(desde).getTime() : null;
  const hastaMs = hasta ? new Date(hasta).getTime() : null;

  return readComprobaciones()
    .filter((c) => {
      if (c.servicio_id !== servicioId) return false;
      const ms = new Date(c.timestamp).getTime();
      if (desdeMs !== null && ms < desdeMs) return false;
      if (hastaMs !== null && ms > hastaMs) return false;
      return true;
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
