import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import IncidenteEstadoBadge from "../components/IncidenteEstadoBadge";
import SeveridadBadge from "../components/SeveridadBadge";
import {
  SEVERIDADES,
  asignarSeveridad,
  cambiarEstado,
  obtenerIncidente,
  siguienteEstado,
} from "../services/incidentesService";
import { formatearFecha } from "../utils/formatoFecha";

/**
 * Detalle de un incidente (ruta /incidentes/:id).
 *
 * - US14 — Como usuario, quiero cambiar el estado de un incidente
 *   respetando el flujo, y que quede registrado con fecha, hora y usuario.
 * - US15 — Como usuario, quiero ver la línea de tiempo del incidente, con
 *   usuario y fecha en cada cambio.
 * - US16 — Como usuario, quiero cerrar un incidente resuelto. El cierre
 *   solo está disponible en estado 'Resuelto'.
 * - US17 — Como usuario, quiero asignarle una severidad al incidente.
 */
export default function DetalleIncidente() {
  const { id } = useParams();
  const [incidente, setIncidente] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    obtenerIncidente(id)
      .then((datos) => {
        if (!cancelado) setIncidente(datos);
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

  // Las dos acciones devuelven el incidente actualizado (con su historial).
  async function guardar(accion) {
    setError("");
    setGuardando(true);
    try {
      setIncidente(await accion());
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <div className="page">
        <p className="subtitle">Cargando incidente...</p>
      </div>
    );
  }

  if (!incidente) {
    return (
      <div className="page">
        <div className="form-error">{error}</div>
        <Link className="btn-link" to="/incidentes">
          ← Volver a Incidentes
        </Link>
      </div>
    );
  }

  const proximo = siguienteEstado(incidente.estado);
  const cerrado = incidente.estado === "Cerrado";

  return (
    <div className="page">
      <Link className="btn-link" to="/incidentes">
        ← Volver a Incidentes
      </Link>

      <div className="page-header">
        <div>
          <h1>
            Incidente en {incidente.servicio_nombre}{" "}
            <IncidenteEstadoBadge estado={incidente.estado} />
          </h1>
          <p className="subtitle">Detectado el {formatearFecha(incidente.fecha_inicio)}</p>
        </div>
        {proximo && (
          <button
            className="btn-primary btn-compact"
            onClick={() => guardar(() => cambiarEstado(incidente.id, proximo))}
            disabled={guardando}
          >
            {guardando
              ? "Guardando..."
              : proximo === "Cerrado"
                ? "Cerrar incidente"
                : `Pasar a "${proximo}"`}
          </button>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="card">
        <h2>Datos del incidente</h2>
        <dl className="datos">
          <div>
            <dt>Servicio afectado</dt>
            <dd>
              <Link className="btn-link" to={`/servicios/${incidente.servicio_id}`}>
                {incidente.servicio_nombre}
              </Link>
            </dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <IncidenteEstadoBadge estado={incidente.estado} />
            </dd>
          </div>
          <div>
            <dt>Severidad</dt>
            <dd>
              <SeveridadBadge severidad={incidente.severidad} />
            </dd>
          </div>
          <div>
            <dt>Inicio</dt>
            <dd>{formatearFecha(incidente.fecha_inicio)}</dd>
          </div>
          <div>
            <dt>Resolución</dt>
            <dd>{formatearFecha(incidente.fecha_resolucion)}</dd>
          </div>
        </dl>

        <div className="field campo-severidad">
          <label htmlFor="severidad">Cambiar severidad</label>
          <select
            id="severidad"
            value={incidente.severidad}
            onChange={(e) => {
              const severidad = e.target.value;
              guardar(() => asignarSeveridad(incidente.id, severidad));
            }}
            disabled={guardando || cerrado}
          >
            {SEVERIDADES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {cerrado && <p className="campo-ayuda">El incidente está cerrado y no admite más cambios.</p>}
        </div>
      </div>

      <div className="card">
        <h2>Línea de tiempo</h2>
        <ol className="linea-tiempo">
          {incidente.historial.map((cambio) => (
            <li key={cambio.id}>
              <IncidenteEstadoBadge estado={cambio.estado_nuevo} />
              <p className="linea-tiempo-detalle">
                {formatearFecha(cambio.fecha_cambio)} · {cambio.usuario}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
