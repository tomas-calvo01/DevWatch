import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import IncidenteEstadoBadge from "../components/IncidenteEstadoBadge";
import SeveridadBadge from "../components/SeveridadBadge";
import { ESTADOS_INCIDENTE, ESTADO_ACTIVOS, listarIncidentes } from "../services/incidentesService";
import { listarServicios } from "../services/serviciosService";
import { armarRango, formatearFecha } from "../utils/formatoFecha";

/**
 * Listado de incidentes (ruta /incidentes).
 *
 * - US13 — Como usuario, quiero que las caídas queden registradas como
 *   incidentes, con severidad, servicio afectado y hora de inicio.
 * - US17 — La severidad de cada incidente se ve en el listado.
 *
 * Los filtros (servicio, estado y rango de fechas) viven en la URL, así
 * se puede llegar con un filtro ya puesto: /incidentes?estado=activos
 * muestra solo los que no están Resueltos ni Cerrados.
 */
export default function ListadoIncidentes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const servicioId = searchParams.get("servicio") || "";
  const estado = searchParams.get("estado") || "";
  const desde = searchParams.get("desde") || "";
  const hasta = searchParams.get("hasta") || "";
  const clave = searchParams.toString();
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);

  const [servicios, setServicios] = useState([]);
  // Resultado de la última búsqueda, con la `clave` de los filtros a los
  // que corresponde: si no coincide con la actual, todavía está cargando.
  const [resultado, setResultado] = useState(null);
  const cargando = !rangoInvalido && resultado?.clave !== clave;

  useEffect(() => {
    let cancelado = false;
    listarServicios()
      .then((datos) => {
        if (!cancelado) setServicios(datos);
      })
      .catch(() => {}); // sin servicios el filtro queda solo con "Todos"
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (rangoInvalido) return;
    let cancelado = false;
    listarIncidentes({ servicioId, estado, ...armarRango(desde, hasta) })
      .then((incidentes) => {
        if (!cancelado) setResultado({ clave, incidentes, error: "" });
      })
      .catch((err) => {
        if (!cancelado) setResultado({ clave, incidentes: [], error: err.message });
      });
    return () => {
      cancelado = true;
    };
  }, [clave, servicioId, estado, desde, hasta, rangoInvalido]);

  function cambiarFiltro(nombre, valor) {
    const nuevos = new URLSearchParams(searchParams);
    if (valor) {
      nuevos.set(nombre, valor);
    } else {
      nuevos.delete(nombre);
    }
    setSearchParams(nuevos, { replace: true });
  }

  const incidentes = resultado ? resultado.incidentes : [];
  const error = rangoInvalido
    ? 'La fecha "Desde" no puede ser posterior a la fecha "Hasta".'
    : !cargando && resultado.error;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Incidentes</h1>
          <p className="subtitle">Las caídas detectadas en tus servicios.</p>
        </div>
      </div>

      <div className="card">
        <div className="filtros">
          <div className="field">
            <label htmlFor="servicio">Servicio</label>
            <select
              id="servicio"
              value={servicioId}
              onChange={(e) => cambiarFiltro("servicio", e.target.value)}
            >
              <option value="">Todos</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="estado">Estado</label>
            <select id="estado" value={estado} onChange={(e) => cambiarFiltro("estado", e.target.value)}>
              <option value="">Todos</option>
              <option value={ESTADO_ACTIVOS}>Activos (sin resolver)</option>
              {ESTADOS_INCIDENTE.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="desde">Desde</label>
            <input
              id="desde"
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => cambiarFiltro("desde", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="hasta">Hasta</label>
            <input
              id="hasta"
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => cambiarFiltro("hasta", e.target.value)}
            />
          </div>
          <button
            className="btn-outline btn-compact"
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            disabled={!clave}
          >
            Limpiar
          </button>
        </div>

        {error && <div className="form-error">{error}</div>}

        {cargando ? (
          <p className="tabla-vacia">Cargando incidentes...</p>
        ) : incidentes.length === 0 ? (
          !error && (
            <p className="tabla-vacia">
              {clave
                ? "No hay incidentes que coincidan con los filtros elegidos."
                : "Todavía no hay incidentes registrados."}
            </p>
          )
        ) : (
          <>
            <p className="tabla-resumen">
              {incidentes.length} {incidentes.length === 1 ? "incidente" : "incidentes"}
            </p>
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
          </>
        )}
      </div>
    </div>
  );
}
