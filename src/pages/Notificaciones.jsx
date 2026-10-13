import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listarNotificaciones,
  marcarNotificacionLeida,
  marcarTodasLeidas,
} from "../services/incidentesService";
import { formatearFecha } from "../utils/formatoFecha";

/**
 * Notificaciones dentro de la plataforma (ruta /alertas).
 *
 * - US23 — Como usuario, quiero recibir una notificación cuando un
 *   servicio se cae.
 * - US24 — Como usuario, quiero recibir una notificación cuando un
 *   servicio se recupera.
 *
 * Se listan de la más reciente a la más antigua; un click sobre una
 * notificación la marca como leída.
 */
export default function Notificaciones() {
  const [notificaciones, setNotificaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    listarNotificaciones()
      .then((datos) => {
        if (!cancelado) setNotificaciones(datos);
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
  }, []);

  function marcarLeida(id, leida) {
    setNotificaciones((actuales) => actuales.map((n) => (n.id === id ? { ...n, leida } : n)));
  }

  // Se actualiza la pantalla al instante y, si el guardado falla, se
  // vuelve a mostrar como no leída.
  async function handleMarcarLeida(notificacion) {
    if (notificacion.leida) return;
    setError("");
    marcarLeida(notificacion.id, true);
    try {
      await marcarNotificacionLeida(notificacion.id);
    } catch (err) {
      marcarLeida(notificacion.id, false);
      setError(err.message);
    }
  }

  async function handleMarcarTodas() {
    setError("");
    setMarcandoTodas(true);
    try {
      await marcarTodasLeidas();
      setNotificaciones((actuales) => actuales.map((n) => ({ ...n, leida: true })));
    } catch (err) {
      setError(err.message);
    } finally {
      setMarcandoTodas(false);
    }
  }

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Alertas</h1>
          <p className="subtitle">
            {cargando
              ? "Notificaciones de caída y recuperación de tus servicios."
              : noLeidas === 0
                ? "No tenés notificaciones sin leer."
                : `${noLeidas} sin leer de ${notificaciones.length}.`}
          </p>
        </div>
        <button
          className="btn-outline btn-compact"
          onClick={handleMarcarTodas}
          disabled={marcandoTodas || noLeidas === 0}
        >
          {marcandoTodas ? "Marcando..." : "Marcar todas como leídas"}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="card">
        {cargando ? (
          <p className="tabla-vacia">Cargando notificaciones...</p>
        ) : notificaciones.length === 0 ? (
          <p className="tabla-vacia">Todavía no hay notificaciones.</p>
        ) : (
          <ul className="notificaciones">
            {notificaciones.map((n) => (
              <li key={n.id} className={n.leida ? "notificacion" : "notificacion no-leida"}>
                <button
                  className="notificacion-cuerpo"
                  onClick={() => handleMarcarLeida(n)}
                  title={n.leida ? undefined : "Marcar como leída"}
                >
                  <span className="notificacion-punto" aria-hidden="true" />
                  <span className={`badge ${n.tipo === "Caída" ? "badge-down" : "badge-up"}`}>
                    {n.tipo}
                  </span>
                  <span className="notificacion-texto">
                    {n.tipo === "Caída"
                      ? `Se detectó una caída en ${n.servicio_nombre}.`
                      : `${n.servicio_nombre} volvió a responder.`}
                    <span className="notificacion-fecha">
                      {formatearFecha(n.fecha_envio)} · {n.leida ? "Leída" : "No leída"}
                    </span>
                  </span>
                </button>
                <Link className="btn-link" to={`/incidentes/${n.incidente_id}`}>
                  Ver incidente
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
