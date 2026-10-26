// monitor/checker.js
// Health check HTTP de un servicio: GET a servicio.url con timeout.
// Devuelve { estado, status_code, tiempo_respuesta_ms } y nunca lanza excepciones.
//   UP      => respuesta 200-399 (con status_code y tiempo).
//   DOWN    => respuesta 4xx/5xx (con status_code y tiempo) o error de red/DNS/conexión (nulls).
//   TIMEOUT => no respondió dentro de TIMEOUT_MS (nulls).
import { leerEnteroPositivo } from "./config.js";

export const TIMEOUT_MS = leerEnteroPositivo("MONITOR_TIMEOUT_MS", 10000);

export async function comprobarServicio(servicio) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  const inicio = performance.now();

  try {
    const respuesta = await fetch(servicio.url, {
      method: "GET",
      signal: controlador.signal,
      headers: { "User-Agent": "DevWatch-Monitor/1.0" },
    });
    // El tiempo se mide hasta recibir la respuesta (status + cabeceras).
    const tiempo = Math.round(performance.now() - inicio);

    // No necesitamos el cuerpo: lo descartamos para liberar la conexión.
    await respuesta.body?.cancel().catch(() => {});

    const estado = respuesta.status >= 200 && respuesta.status <= 399 ? "UP" : "DOWN";
    return { estado, status_code: respuesta.status, tiempo_respuesta_ms: tiempo };
  } catch (err) {
    // Solo es TIMEOUT si la cancelación la provocó nuestro temporizador; un error
    // de red que coincida con el vencimiento sigue siendo DOWN.
    if (controlador.signal.aborted && (err.name === "AbortError" || err.name === "TimeoutError")) {
      return { estado: "TIMEOUT", status_code: null, tiempo_respuesta_ms: null };
    }
    // Error de red, DNS, conexión rechazada o URL inválida.
    return { estado: "DOWN", status_code: null, tiempo_respuesta_ms: null, error: err.cause?.code || err.message };
  } finally {
    clearTimeout(temporizador);
  }
}
