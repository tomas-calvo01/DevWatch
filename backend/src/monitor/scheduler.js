// monitor/scheduler.js
// Bucle del Motor de Monitoreo. Cada MONITOR_TICK_SECONDS relee la base, toma los
// servicios activos "vencidos" y los comprueba en paralelo (tope MONITOR_MAX_CONCURRENTES).
// El worker no recibe avisos del API: como relee la base en cada tick, las altas,
// ediciones, bajas y activaciones/desactivaciones se reflejan solas.
import { query } from "../db.js";
import { comprobarServicio } from "./checker.js";
import { alResultado } from "./hooks.js";
import { leerEnteroPositivo } from "./config.js";

export const TICK_SECONDS = leerEnteroPositivo("MONITOR_TICK_SECONDS", 5);
export const MAX_CONCURRENTES = leerEnteroPositivo("MONITOR_MAX_CONCURRENTES", 20);

// Servicios activos sin comprobaciones o cuya última comprobación tiene al menos
// intervalo_segundos de antigüedad. Se restan 0,5 s de tolerancia para que el
// pequeño desfase de cada tick no haga saltear una vuelta entera.
// "inicio" es el momento del tick (reloj de la base) y se guarda como timestamp.
const SQL_VENCIDOS = `
  SELECT s.id, s.usuario_id, s.nombre, s.url, s.tipo, s.intervalo_segundos,
         localtimestamp::text AS inicio
  FROM servicios s
  LEFT JOIN LATERAL (
    SELECT c.timestamp
    FROM comprobaciones c
    WHERE c.servicio_id = s.id
    ORDER BY c.timestamp DESC
    LIMIT 1
  ) ultima ON true
  WHERE s.activo = true
    AND s.tipo = 'HTTP'
    AND (
      ultima.timestamp IS NULL
      OR localtimestamp - ultima.timestamp >= make_interval(secs => s.intervalo_segundos - 0.5)
    )
  ORDER BY ultima.timestamp ASC NULLS FIRST
`;

const SQL_INSERTAR = `
  INSERT INTO comprobaciones (servicio_id, timestamp, estado, status_code, tiempo_respuesta_ms)
  VALUES ($1, $2::timestamp, $3, $4, $5)
  RETURNING id, servicio_id, timestamp, estado, status_code, tiempo_respuesta_ms
`;

export function crearScheduler() {
  let intervalo = null;
  let consultando = false;
  // Servicios con una comprobación en curso: id => promesa. Un mismo servicio
  // nunca se comprueba dos veces a la vez.
  const enCurso = new Map();

  async function comprobarYGuardar(servicio) {
    const resultado = await comprobarServicio(servicio);
    let comprobacion;
    try {
      const { rows } = await query(SQL_INSERTAR, [
        servicio.id,
        servicio.inicio,
        resultado.estado,
        resultado.status_code,
        resultado.tiempo_respuesta_ms,
      ]);
      comprobacion = rows[0];
    } catch (err) {
      // Puede fallar el INSERT (p. ej. el servicio se borró durante el check).
      console.error(`[monitor] Error al guardar la comprobación del servicio #${servicio.id}: ${err.message}`);
      return;
    }

    const detalle = resultado.status_code ?? resultado.error ?? "-";
    console.log(
      `[monitor] #${servicio.id} ${servicio.nombre}: ${comprobacion.estado} (${detalle}` +
        `${resultado.tiempo_respuesta_ms !== null ? `, ${resultado.tiempo_respuesta_ms} ms` : ""})`
    );

    // Si el hook falla, la comprobación ya guardada se conserva.
    try {
      await alResultado(servicio, comprobacion);
    } catch (err) {
      console.error(`[monitor] Error en el hook alResultado del servicio #${servicio.id}: ${err.message}`);
    }
  }

  async function tick() {
    if (consultando) return; // la consulta anterior todavía no terminó
    consultando = true;
    let vencidos;
    try {
      ({ rows: vencidos } = await query(SQL_VENCIDOS));
    } catch (err) {
      console.error(`[monitor] Error al consultar servicios: ${err.message}`);
      return;
    } finally {
      consultando = false;
    }
    if (!intervalo) return; // se detuvo mientras se consultaba la base

    // Se saltean los que siguen en curso (check más largo que el intervalo) y se respeta el tope.
    const lugares = Math.max(0, MAX_CONCURRENTES - enCurso.size);
    const lote = vencidos.filter((s) => !enCurso.has(s.id)).slice(0, lugares);

    const promesas = lote.map((servicio) => {
      const promesa = comprobarYGuardar(servicio).finally(() => enCurso.delete(servicio.id));
      enCurso.set(servicio.id, promesa);
      return promesa;
    });

    const resultados = await Promise.allSettled(promesas);
    for (const r of resultados) {
      if (r.status === "rejected") console.error(`[monitor] Error inesperado: ${r.reason?.message ?? r.reason}`);
    }
  }

  return {
    iniciar() {
      if (intervalo) return;
      // setInterval no espera al tick anterior: un check lento no frena a los demás.
      const ejecutar = () => tick().catch((err) => console.error(`[monitor] Error en el tick: ${err.message}`));
      intervalo = setInterval(ejecutar, TICK_SECONDS * 1000);
      ejecutar();
    },

    detener() {
      clearInterval(intervalo);
      intervalo = null;
    },

    // Espera a que terminen los checks en curso, como máximo "limiteMs".
    // Devuelve true si terminaron todos a tiempo.
    async esperarEnCurso(limiteMs) {
      if (enCurso.size === 0) return true;
      let temporizador;
      const limite = new Promise((resolve) => {
        temporizador = setTimeout(() => resolve(false), limiteMs);
      });
      const todos = Promise.allSettled([...enCurso.values()]).then(() => true);
      const terminaron = await Promise.race([todos, limite]);
      clearTimeout(temporizador);
      return terminaron;
    },

    get cantidadEnCurso() {
      return enCurso.size;
    },
  };
}
