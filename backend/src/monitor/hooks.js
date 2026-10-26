// monitor/hooks.js
// Punto de extensión del Motor de Monitoreo. El scheduler llama a alResultado
// después de guardar cada comprobación.
// servicio:    fila de servicios (id, usuario_id, nombre, url, tipo, intervalo_segundos).
// comprobacion: fila insertada en comprobaciones (id, servicio_id, timestamp, estado, status_code, tiempo_respuesta_ms).

// eslint-disable-next-line no-unused-vars
export async function alResultado(servicio, comprobacion) {
  // Aquí se evaluará la creación/resolución de incidentes (actividad 3.4)
}
