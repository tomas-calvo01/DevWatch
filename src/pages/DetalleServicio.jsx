import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import EstadoBadge from "../components/EstadoBadge";
import { obtenerServicio, obtenerComprobaciones } from "../services/serviciosService";

/**
 * Detalle de un servicio (ruta /servicios/:id).
 *
 * US12 — Como usuario, quiero ver el historial de comprobaciones de un
 * servicio, para analizar su comportamiento en el tiempo.
 *
 * Criterios de aceptación:
 * - Listado cronológico (de la más reciente a la más antigua).
 * - Estado y tiempo de respuesta de cada comprobación.
 * - Filtro por rango de fechas.
 */
function formatearFecha(timestamp) {
  return new Date(timestamp).toLocaleString("es-AR");
}

// Los <input type="date"> devuelven "AAAA-MM-DD": se convierten al inicio
// y al fin de ese día en hora local, para que el rango sea inclusivo.
function armarRango(desde, hasta) {
  return {
    desde: desde ? new Date(`${desde}T00:00:00`) : null,
    hasta: hasta ? new Date(`${hasta}T23:59:59.999`) : null,
  };
}

export default function DetalleServicio() {
  const { id } = useParams();
  const [servicio, setServicio] = useState(null);
  const [comprobaciones, setComprobaciones] = useState([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtroAplicado, setFiltroAplicado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [filtrando, setFiltrando] = useState(false);
  const [error, setError] = useState("");
  const [errorFiltro, setErrorFiltro] = useState("");

  useEffect(() => {
    let cancelado = false;
    Promise.all([obtenerServicio(id), obtenerComprobaciones(id)])
      .then(([datosServicio, datosComprobaciones]) => {
        if (cancelado) return;
        setServicio(datosServicio);
        setComprobaciones(datosComprobaciones);
      })
      .catch((err) => {
        if (!cancelado) setError(err.message);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [id]);

  async function cargarComprobaciones(valorDesde, valorHasta) {
    setErrorFiltro("");
    setFiltrando(true);
    try {
      setComprobaciones(await obtenerComprobaciones(id, armarRango(valorDesde, valorHasta)));
      setFiltroAplicado(Boolean(valorDesde || valorHasta));
    } catch (err) {
      setErrorFiltro(err.message);
    } finally {
      setFiltrando(false);
    }
  }

  function handleFiltrar(e) {
    e.preventDefault();
    if (desde && hasta && desde > hasta) {
      setErrorFiltro('La fecha "Desde" no puede ser posterior a la fecha "Hasta".');
      return;
    }
    cargarComprobaciones(desde, hasta);
  }

  function handleLimpiar() {
    setDesde("");
    setHasta("");
    cargarComprobaciones("", "");
  }

  if (cargando) {
    return (
      <div className="page">
        <p className="subtitle">Cargando servicio...</p>
      </div>
    );
  }

  if (!servicio) {
    return (
      <div className="page">
        <div className="form-error">{error}</div>
        <Link className="btn-link" to="/servicios">
          ← Volver a Servicios
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <Link className="btn-link" to="/servicios">
        ← Volver a Servicios
      </Link>

      <div className="page-header">
        <div>
          <h1>
            {servicio.nombre}{" "}
            <EstadoBadge estado={servicio.activo ? servicio.ultimo_estado : "PAUSADO"} />
          </h1>
          <p className="subtitle">
            {servicio.url} · {servicio.tipo} · cada {servicio.intervalo_segundos} s
          </p>
        </div>
        <Link className="btn-outline btn-compact" to={`/servicios/${servicio.id}/editar`}>
          Editar
        </Link>
      </div>

      <div className="card">
        <h2>Historial de comprobaciones</h2>

        <form className="filtros" onSubmit={handleFiltrar}>
          <div className="field">
            <label htmlFor="desde">Desde</label>
            <input
              id="desde"
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="hasta">Hasta</label>
            <input
              id="hasta"
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
          <button className="btn-primary btn-compact" type="submit" disabled={filtrando}>
            {filtrando ? "Filtrando..." : "Filtrar"}
          </button>
          <button
            className="btn-outline btn-compact"
            type="button"
            onClick={handleLimpiar}
            disabled={filtrando || (!desde && !hasta && !filtroAplicado)}
          >
            Limpiar
          </button>
        </form>

        {errorFiltro && <div className="form-error">{errorFiltro}</div>}

        {comprobaciones.length === 0 ? (
          <p className="tabla-vacia">
            {filtroAplicado
              ? "No hay comprobaciones en el rango de fechas elegido."
              : "Este servicio todavía no tiene comprobaciones."}
          </p>
        ) : (
          <>
            <p className="tabla-resumen">
              {comprobaciones.length}{" "}
              {comprobaciones.length === 1 ? "comprobación" : "comprobaciones"}
            </p>
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Código</th>
                    <th>Tiempo de respuesta</th>
                  </tr>
                </thead>
                <tbody>
                  {comprobaciones.map((c) => (
                    <tr key={c.id}>
                      <td>{formatearFecha(c.timestamp)}</td>
                      <td>
                        <EstadoBadge estado={c.estado} />
                      </td>
                      <td>{c.status_code ?? "—"}</td>
                      <td>{c.tiempo_respuesta_ms != null ? `${c.tiempo_respuesta_ms} ms` : "—"}</td>
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
