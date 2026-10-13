/**
 * incidentesService.js
 *
 * Simula los endpoints de Incidentes y Notificaciones del Backend API
 * (actividad 2.3 de la EDT), igual que serviciosService.js: los datos se
 * guardan en localStorage para trabajar el Frontend "sobre datos de prueba".
 *
 * Historias de usuario que cubre:
 * - US13 — Registro de incidentes con severidad, servicio y hora de inicio.
 * - US14 — Cambio de estado respetando el flujo (cambiarEstado).
 * - US15 — Historial de cambios de un incidente (obtenerIncidente).
 * - US16 — Cierre de un incidente resuelto (cambiarEstado).
 * - US17 — Severidad del incidente (asignarSeveridad).
 * - US23 y US24 — Notificaciones de caída y de recuperación.
 *
 * Mientras no exista el Motor de Monitoreo real, los incidentes se derivan
 * de las comprobaciones de prueba que genera serviciosService.js. Por eso
 * este archivo lee las mismas claves de localStorage ("la misma base de
 * datos") en vez de importar serviciosService.js, que a su vez lo importa
 * a él para borrar los incidentes de un servicio eliminado.
 */
import { getCurrentUser } from "./authService";

const SERVICIOS_KEY = "devwatch_servicios";
const COMPROBACIONES_KEY = "devwatch_comprobaciones";
const INCIDENTES_KEY = "devwatch_incidentes";
const HISTORIAL_KEY = "devwatch_incidentes_historial";
const NOTIFICACIONES_KEY = "devwatch_notificaciones";

// Flujo de estados: solo se puede avanzar de uno al siguiente.
export const ESTADOS_INCIDENTE = ["Detectado", "Investigando", "Identificado", "Resuelto", "Cerrado"];
export const SEVERIDADES = ["Crítica", "Alta", "Media", "Baja"];
const SEVERIDAD_INICIAL = "Alta";
const USUARIO_SISTEMA = "Sistema";

// Valor especial del filtro `estado`: los que no están Resueltos ni Cerrados.
export const ESTADO_ACTIVOS = "activos";

// Evento de window que se dispara cuando cambian las notificaciones, para
// que el contador del Navbar se actualice sin recargar la página.
export const EVENTO_NOTIFICACIONES = "devwatch:notificaciones";

// Simula la latencia de una llamada de red real.
function delay(ms = 400) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function leer(clave) {
  const raw = localStorage.getItem(clave);
  return raw ? JSON.parse(raw) : [];
}

function guardar(clave, datos) {
  localStorage.setItem(clave, JSON.stringify(datos));
}

function avisarCambioNotificaciones() {
  window.dispatchEvent(new Event(EVENTO_NOTIFICACIONES));
}

// Todas las operaciones son sobre los servicios del usuario logueado.
function usuarioActual() {
  const usuario = getCurrentUser();
  if (!usuario) throw new Error("No hay una sesión activa.");
  return usuario;
}

function serviciosDe(usuario) {
  return leer(SERVICIOS_KEY).filter((s) => s.usuario_id === usuario.id);
}

/**
 * Devuelve el estado al que puede pasar un incidente, o null si está
 * 'Cerrado' (US14 / US16).
 */
export function siguienteEstado(estado) {
  const index = ESTADOS_INCIDENTE.indexOf(estado);
  return ESTADOS_INCIDENTE[index + 1] ?? null;
}

// Arma un incidente nuevo a partir de una racha de comprobaciones caídas,
// con su historial y sus notificaciones. Si `resolucion` es null la racha
// llega hasta la última comprobación y el incidente queda abierto.
function armarIncidente(servicio, inicio, resolucion, usuario) {
  const incidente = {
    id: crypto.randomUUID(),
    servicio_id: servicio.id,
    estado: resolucion ? "Resuelto" : "Detectado",
    severidad: SEVERIDAD_INICIAL,
    fecha_inicio: inicio,
    fecha_resolucion: resolucion,
  };

  const cambio = (estado_anterior, estado_nuevo, fecha_cambio, nombreUsuario) => ({
    id: crypto.randomUUID(),
    incidente_id: incidente.id,
    estado_anterior,
    estado_nuevo,
    fecha_cambio,
    usuario: nombreUsuario,
  });
  const notificacion = (tipo, fecha_envio) => ({
    id: crypto.randomUUID(),
    servicio_id: servicio.id,
    incidente_id: incidente.id,
    tipo,
    fecha_envio,
    leida: false,
  });

  const historial = [cambio(null, "Detectado", inicio, USUARIO_SISTEMA)];
  const notificaciones = [notificacion("Caída", inicio)];

  if (resolucion) {
    // Datos de prueba: los pasos intermedios se reparten entre el inicio
    // y la resolución, para que las fechas del historial sean coherentes.
    const inicioMs = new Date(inicio).getTime();
    const tercio = (new Date(resolucion).getTime() - inicioMs) / 3;
    historial.push(
      cambio("Detectado", "Investigando", new Date(inicioMs + tercio).toISOString(), usuario.nombre),
      cambio("Investigando", "Identificado", new Date(inicioMs + 2 * tercio).toISOString(), usuario.nombre),
      cambio("Identificado", "Resuelto", resolucion, USUARIO_SISTEMA),
    );
    notificaciones.push(notificacion("Recuperación", resolucion));
  }

  return { incidente, historial, notificaciones };
}

// US13 / US23 / US24 — Deriva los incidentes de las comprobaciones: cada
// racha de DOWN/TIMEOUT consecutivos es un incidente. Es idempotente: una
// racha se identifica por servicio + fecha de inicio, y si ya tiene
// incidente no se vuelve a crear (ni se pisan los cambios del usuario).
function sincronizarIncidentes(usuario) {
  const comprobaciones = leer(COMPROBACIONES_KEY);
  const incidentes = leer(INCIDENTES_KEY);
  const existentes = new Set(incidentes.map((i) => `${i.servicio_id}|${i.fecha_inicio}`));
  const nuevos = [];

  for (const servicio of serviciosDe(usuario)) {
    const propias = comprobaciones
      .filter((c) => c.servicio_id === servicio.id)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const registrar = (inicio, resolucion) => {
      if (existentes.has(`${servicio.id}|${inicio}`)) return;
      nuevos.push(armarIncidente(servicio, inicio, resolucion, usuario));
    };

    let inicio = null;
    for (const c of propias) {
      if (c.estado !== "UP") {
        if (!inicio) inicio = c.timestamp;
      } else if (inicio) {
        registrar(inicio, c.timestamp);
        inicio = null;
      }
    }
    if (inicio) registrar(inicio, null);
  }

  if (nuevos.length === 0) return;
  guardar(INCIDENTES_KEY, incidentes.concat(nuevos.map((n) => n.incidente)));
  guardar(HISTORIAL_KEY, leer(HISTORIAL_KEY).concat(nuevos.flatMap((n) => n.historial)));
  guardar(NOTIFICACIONES_KEY, leer(NOTIFICACIONES_KEY).concat(nuevos.flatMap((n) => n.notificaciones)));
}

// Agrega el nombre del servicio (`servicio_nombre`), que es lo que muestran
// las pantallas. Es un dato calculado: no se guarda en localStorage.
function conServicio(registro, servicios) {
  const servicio = servicios.find((s) => s.id === registro.servicio_id);
  return { ...registro, servicio_nombre: servicio ? servicio.nombre : "Servicio eliminado" };
}

// Incidente con el nombre del servicio y su historial en orden cronológico.
function conDetalle(incidente, servicios) {
  const historial = leer(HISTORIAL_KEY)
    .filter((h) => h.incidente_id === incidente.id)
    .sort((a, b) => a.fecha_cambio.localeCompare(b.fecha_cambio));
  return { ...conServicio(incidente, servicios), historial };
}

function buscarIndice(incidentes, id, servicios) {
  const index = incidentes.findIndex(
    (i) => i.id === id && servicios.some((s) => s.id === i.servicio_id),
  );
  if (index === -1) throw new Error("Incidente no encontrado.");
  return index;
}

/**
 * US13 — Lista los incidentes de los servicios del usuario logueado, del
 * más reciente al más antiguo. Todos los filtros son opcionales: `estado`
 * es un estado del flujo o "activos"; `desde` y `hasta` (fecha ISO o Date)
 * se comparan contra fecha_inicio y son inclusivos.
 */
export async function listarIncidentes({ servicioId, estado, desde, hasta } = {}) {
  await delay();
  const usuario = usuarioActual();
  sincronizarIncidentes(usuario);
  const servicios = serviciosDe(usuario);

  const desdeMs = desde ? new Date(desde).getTime() : null;
  const hastaMs = hasta ? new Date(hasta).getTime() : null;

  return leer(INCIDENTES_KEY)
    .filter((i) => {
      if (!servicios.some((s) => s.id === i.servicio_id)) return false;
      if (servicioId && i.servicio_id !== servicioId) return false;
      if (estado === ESTADO_ACTIVOS) {
        if (i.estado === "Resuelto" || i.estado === "Cerrado") return false;
      } else if (estado && i.estado !== estado) {
        return false;
      }
      const ms = new Date(i.fecha_inicio).getTime();
      if (desdeMs !== null && ms < desdeMs) return false;
      if (hastaMs !== null && ms > hastaMs) return false;
      return true;
    })
    .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))
    .map((i) => conServicio(i, servicios));
}

/**
 * US15 — Devuelve un incidente con su `historial` de cambios de estado
 * (del más antiguo al más reciente), o lanza un error si no existe.
 */
export async function obtenerIncidente(id) {
  await delay();
  const usuario = usuarioActual();
  sincronizarIncidentes(usuario);
  const servicios = serviciosDe(usuario);
  const incidentes = leer(INCIDENTES_KEY);
  return conDetalle(incidentes[buscarIndice(incidentes, id, servicios)], servicios);
}

/**
 * US14 / US16 — Avanza el incidente al estado siguiente del flujo. No se
 * puede saltear ni retroceder, y un incidente 'Cerrado' no admite cambios.
 * El cambio queda en el historial con fecha y usuario.
 */
export async function cambiarEstado(id, nuevoEstado) {
  await delay();
  const usuario = usuarioActual();
  const servicios = serviciosDe(usuario);
  const incidentes = leer(INCIDENTES_KEY);
  const index = buscarIndice(incidentes, id, servicios);
  const incidente = incidentes[index];

  const permitido = siguienteEstado(incidente.estado);
  if (!permitido) {
    throw new Error("Un incidente cerrado no admite más cambios.");
  }
  if (nuevoEstado !== permitido) {
    throw new Error(`Desde "${incidente.estado}" solo se puede pasar a "${permitido}".`);
  }

  const ahora = new Date().toISOString();
  incidentes[index] = {
    ...incidente,
    estado: nuevoEstado,
    fecha_resolucion:
      nuevoEstado === "Resuelto" && !incidente.fecha_resolucion ? ahora : incidente.fecha_resolucion,
  };
  guardar(INCIDENTES_KEY, incidentes);

  const historial = leer(HISTORIAL_KEY);
  historial.push({
    id: crypto.randomUUID(),
    incidente_id: id,
    estado_anterior: incidente.estado,
    estado_nuevo: nuevoEstado,
    fecha_cambio: ahora,
    usuario: usuario.nombre,
  });
  guardar(HISTORIAL_KEY, historial);

  return conDetalle(incidentes[index], servicios);
}

/**
 * US17 — Asigna la severidad del incidente (Crítica, Alta, Media o Baja).
 */
export async function asignarSeveridad(id, severidad) {
  await delay();
  const usuario = usuarioActual();
  const servicios = serviciosDe(usuario);
  const incidentes = leer(INCIDENTES_KEY);
  const index = buscarIndice(incidentes, id, servicios);

  if (!SEVERIDADES.includes(severidad)) {
    throw new Error(`La severidad tiene que ser una de: ${SEVERIDADES.join(", ")}.`);
  }
  if (incidentes[index].estado === "Cerrado") {
    throw new Error("Un incidente cerrado no admite más cambios.");
  }

  incidentes[index] = { ...incidentes[index], severidad };
  guardar(INCIDENTES_KEY, incidentes);

  return conDetalle(incidentes[index], servicios);
}

/**
 * US23 / US24 — Notificaciones de caída y de recuperación de los servicios
 * del usuario logueado, de la más reciente a la más antigua.
 */
export async function listarNotificaciones() {
  await delay();
  const usuario = usuarioActual();
  sincronizarIncidentes(usuario);
  const servicios = serviciosDe(usuario);

  return leer(NOTIFICACIONES_KEY)
    .filter((n) => servicios.some((s) => s.id === n.servicio_id))
    .sort((a, b) => b.fecha_envio.localeCompare(a.fecha_envio))
    .map((n) => conServicio(n, servicios));
}

/**
 * Marca una notificación como leída.
 */
export async function marcarNotificacionLeida(id) {
  await delay();
  const servicios = serviciosDe(usuarioActual());
  const notificaciones = leer(NOTIFICACIONES_KEY);
  const index = notificaciones.findIndex(
    (n) => n.id === id && servicios.some((s) => s.id === n.servicio_id),
  );
  if (index === -1) throw new Error("Notificación no encontrada.");

  notificaciones[index] = { ...notificaciones[index], leida: true };
  guardar(NOTIFICACIONES_KEY, notificaciones);
  avisarCambioNotificaciones();

  return conServicio(notificaciones[index], servicios);
}

/**
 * Marca como leídas todas las notificaciones del usuario logueado.
 */
export async function marcarTodasLeidas() {
  await delay();
  const servicios = serviciosDe(usuarioActual());
  const notificaciones = leer(NOTIFICACIONES_KEY).map((n) =>
    servicios.some((s) => s.id === n.servicio_id) ? { ...n, leida: true } : n,
  );
  guardar(NOTIFICACIONES_KEY, notificaciones);
  avisarCambioNotificaciones();
}

/**
 * Cantidad de notificaciones sin leer (contador del Navbar).
 */
export async function contarNoLeidas() {
  await delay();
  const usuario = usuarioActual();
  sincronizarIncidentes(usuario);
  const servicios = serviciosDe(usuario);

  return leer(NOTIFICACIONES_KEY).filter(
    (n) => !n.leida && servicios.some((s) => s.id === n.servicio_id),
  ).length;
}

/**
 * Borra los incidentes de un servicio, con su historial y sus
 * notificaciones. Lo llama eliminarServicio (US07) de serviciosService.js.
 */
export function eliminarIncidentesDeServicio(servicioId) {
  const incidentes = leer(INCIDENTES_KEY);
  const borrados = new Set(incidentes.filter((i) => i.servicio_id === servicioId).map((i) => i.id));

  guardar(INCIDENTES_KEY, incidentes.filter((i) => i.servicio_id !== servicioId));
  guardar(HISTORIAL_KEY, leer(HISTORIAL_KEY).filter((h) => !borrados.has(h.incidente_id)));
  guardar(NOTIFICACIONES_KEY, leer(NOTIFICACIONES_KEY).filter((n) => n.servicio_id !== servicioId));
  avisarCambioNotificaciones();
}
