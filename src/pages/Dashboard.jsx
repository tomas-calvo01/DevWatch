import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EstadoBadge from "../components/EstadoBadge";
import GraficoLinea from "../components/GraficoLinea";
import IncidenteEstadoBadge from "../components/IncidenteEstadoBadge";
import SeveridadBadge from "../components/SeveridadBadge";
import { obtenerDashboard } from "../services/dashboardService";
import { formatearFecha } from "../utils/formatoFecha";

/**
 * Dashboard (ruta /dashboard): la pantalla de inicio después del login.
 *
 * - US18 — Como usuario, quiero ver el estado actual de cada servicio
 *   (activo, degradado, caído) y poder actualizarlo manualmente.
 * - US19 — Como usuario, quiero ver el uptime sobre un período
 *   configurable (24 horas, 7 días o 30 días).
 * - US20 — Como usuario, quiero ver el MTTR calculado automáticamente.
 * - US21 — Como usuario, quiero ver cuántos incidentes activos hay y
 *   llegar desde ahí al listado de incidentes activos.
 * - US22 — Como usuario, quiero ver un historial básico de incidentes y
 *   llegar al listado completo con filtros.
 */
const PERIODOS = [
  { dias: 1, texto: "24 horas", descripcion: "Últimas 24 horas" },
  { dias: 7, texto: "7 días", descripcion: "Últimos 7 días" },
  { dias: 30, texto: "30 días", descripcion: "Últimos 30 días" },
];

function formatearPorcentaje(valor) {
  if (valor === null) return "Sin datos";
  return `${valor.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function formatearMs(valor) {
  return valor === null ? "—" : `${valor.toLocaleString("es-AR")} ms`;
}

// US20: "14 min" o "2 h 5 min".
function formatearDuracion(minutos) {
  if (minutos === null) return "Sin datos";
  if (minutos < 1) return "< 1 min";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

function etiquetaDeTramo(iso, porHora) {
  const fecha = new Date(iso);
  return porHora
    ? fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })
    : fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function plural(cantidad, singular, plural) {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

export default function Dashboard() {
  const [dias, setDias] = useState(7);
  const [recarga, setRecarga] = useState(0); // cambia con el botón "Actualizar"
  // Resultado del último pedido, con la `clave` a la que corresponde: si
  // no coincide con la actual, todavía se está cargando. Mientras tanto
  // se siguen mostrando los datos anteriores.
  const [resultado, setResultado] = useState(null);
  const clave = `${dias}|${recarga}`;
  const cargando = resultado?.clave !== clave;

  useEffect(() => {
    let cancelado = false;
    obtenerDashboard({ dias })
      .then((datos) => {
        if (!cancelado) setResultado({ clave, datos, error: "" });
      })
      .catch((err) => {
        if (cancelado) return;
        setResultado((anterior) => ({
          clave,
          datos: anterior ? anterior.datos : null,
          error: err.message,
        }));
      });
    return () => {
      cancelado = true;
    };
  }, [clave, dias]);

  const datos = resultado ? resultado.datos : null;
  const error = !cargando && resultado.error;

  const encabezado = (
    <div className="page-header">
      <div>
        <h1>Dashboard</h1>
        <p className="subtitle">
          {datos ? `Actualizado: ${formatearFecha(datos.hasta)}` : "Estado general de tus servicios."}
        </p>
      </div>
      <div className="dashboard-controles">
        <div className="segmentos" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              className={p.dias === dias ? "segmento activo" : "segmento"}
              aria-pressed={p.dias === dias}
              onClick={() => setDias(p.dias)}
            >
              {p.texto}
            </button>
          ))}
        </div>
        <button
          className="btn-outline btn-compact"
          onClick={() => setRecarga((n) => n + 1)}
          disabled={cargando}
        >
          {cargando ? "Actualizando..." : "Actualizar"}
        </button>
      </div>
    </div>
  );

  if (!datos) {
    return (
      <div className="page">
        {encabezado}
        {error ? (
          <div className="form-error">{error}</div>
        ) : (
          <div className="card">
            <p className="tabla-vacia">Cargando dashboard...</p>
          </div>
        )}
      </div>
    );
  }

  if (datos.servicios.length === 0) {
    return (
      <div className="page">
        {encabezado}
        {error && <div className="form-error">{error}</div>}
        <div className="card estado-vacio">
          <p className="tabla-vacia">
            Todavía no tenés servicios. Registrá el primero para empezar a ver su estado acá.
          </p>
          <Link className="btn-primary btn-compact" to="/servicios/nuevo">
            Registrar servicio
          </Link>
        </div>
      </div>
    );
  }

  const { resumen, servicios, serie, incidentes_recientes: incidentes } = datos;
  const periodo = PERIODOS.find((p) => p.dias === datos.dias).descripcion;
  const puntos = serie.map((tramo) => ({
    etiqueta: etiquetaDeTramo(tramo.fecha, datos.serie_por_hora),
    valor: tramo.tiempo_respuesta_promedio,
  }));

  return (
    <div className="page">
      {encabezado}
      {error && <div className="form-error">{error}</div>}

      <div className="kpis">
        <div className="kpi">
          <p className="kpi-titulo">Servicios activos</p>
          <p className="kpi-valor">{resumen.servicios_activos}</p>
          <p className="kpi-detalle">de {plural(servicios.length, "servicio", "servicios")}</p>
        </div>
        <div className="kpi">
          <p className="kpi-titulo">Uptime promedio</p>
          <p className="kpi-valor">{formatearPorcentaje(resumen.uptime_promedio)}</p>
          <p className="kpi-detalle">{periodo}</p>
        </div>
        <Link className="kpi kpi-link" to="/incidentes?estado=activos">
          <p className="kpi-titulo">Incidentes activos</p>
          <p className="kpi-valor">{resumen.incidentes_activos}</p>
          <p className="kpi-detalle">Ver incidentes activos →</p>
        </Link>
        <div className="kpi">
          <p className="kpi-titulo">MTTR</p>
          <p className="kpi-valor">{formatearDuracion(resumen.mttr_minutos)}</p>
          <p className="kpi-detalle">
            {plural(resumen.cantidad_incidentes, "incidente", "incidentes")} en el período
          </p>
        </div>
      </div>

      <p className="conteos">
        <span>
          <span className="punto punto-activo" aria-hidden="true" />
          {plural(resumen.servicios_activos, "activo", "activos")}
        </span>
        <span>
          <span className="punto punto-degradado" aria-hidden="true" />
          {plural(resumen.servicios_degradados, "degradado", "degradados")}
        </span>
        <span>
          <span className="punto punto-caido" aria-hidden="true" />
          {plural(resumen.servicios_caidos, "caído", "caídos")}
        </span>
        {resumen.servicios_pausados > 0 && (
          <span>
            <span className="punto punto-pausado" aria-hidden="true" />
            {plural(resumen.servicios_pausados, "pausado", "pausados")}
          </span>
        )}
      </p>

      <div className="card">
        <h2>
          Tiempo de respuesta promedio por {datos.serie_por_hora ? "hora" : "día"}
        </h2>
        <GraficoLinea
          puntos={puntos}
          unidad="ms"
          descripcion={`Tiempo de respuesta promedio de todos los servicios. ${periodo}.`}
        />
      </div>

      <div className="card">
        <h2>Servicios</h2>
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Estado</th>
                <th>Uptime</th>
                <th>Tiempo de respuesta</th>
                <th>Última comprobación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {servicios.map((servicio) => (
                <tr key={servicio.id}>
                  <td>{servicio.nombre}</td>
                  <td>
                    <EstadoBadge estado={servicio.estado} />
                  </td>
                  <td>{formatearPorcentaje(servicio.uptime)}</td>
                  <td>{formatearMs(servicio.tiempo_respuesta_promedio)}</td>
                  <td>{formatearFecha(servicio.ultima_comprobacion)}</td>
                  <td>
                    <Link className="btn-link" to={`/servicios/${servicio.id}`}>
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Últimos incidentes</h2>
          <Link className="btn-link" to="/incidentes">
            Ver todos los incidentes →
          </Link>
        </div>
        {incidentes.length === 0 ? (
          <p className="tabla-vacia">Todavía no hay incidentes registrados.</p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Severidad</th>
                  <th>Estado</th>
                  <th>Inicio</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {incidentes.map((incidente) => (
                  <tr key={incidente.id}>
                    <td>{incidente.servicio_nombre}</td>
                    <td>
                      <SeveridadBadge severidad={incidente.severidad} />
                    </td>
                    <td>
                      <IncidenteEstadoBadge estado={incidente.estado} />
                    </td>
                    <td>{formatearFecha(incidente.fecha_inicio)}</td>
                    <td>
                      <Link className="btn-link" to={`/incidentes/${incidente.id}`}>
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
