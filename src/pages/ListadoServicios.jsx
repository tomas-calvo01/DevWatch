import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EstadoBadge from "../components/EstadoBadge";
import { listarServicios, eliminarServicio, cambiarActivo } from "../services/serviciosService";

/**
 * Listado de servicios del usuario (ruta /servicios).
 *
 * - US05 — El servicio dado de alta aparece en este listado.
 * - US07 — Como usuario, quiero eliminar un servicio, para dejar de
 *   monitorearlo. Pide confirmación y lo saca del listado.
 * - US08 — Como usuario, quiero activar o desactivar el monitoreo de un
 *   servicio. El switch se refleja de inmediato.
 */
export default function ListadoServicios() {
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aEliminar, setAEliminar] = useState(null); // servicio pendiente de confirmación
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    listarServicios()
      .then((datos) => {
        if (!cancelado) setServicios(datos);
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

  function marcarActivo(id, activo) {
    setServicios((actuales) => actuales.map((s) => (s.id === id ? { ...s, activo } : s)));
  }

  // US08: se actualiza la pantalla al instante y, si el guardado falla,
  // se vuelve al valor anterior.
  async function handleCambiarActivo(servicio) {
    const nuevoValor = !servicio.activo;
    setError("");
    marcarActivo(servicio.id, nuevoValor);
    try {
      await cambiarActivo(servicio.id, nuevoValor);
    } catch (err) {
      marcarActivo(servicio.id, servicio.activo);
      setError(err.message);
    }
  }

  // US07: solo se elimina después de confirmar en el diálogo.
  async function handleConfirmarEliminar() {
    setError("");
    setEliminando(true);
    try {
      await eliminarServicio(aEliminar.id);
      setServicios((actuales) => actuales.filter((s) => s.id !== aEliminar.id));
      setAEliminar(null);
    } catch (err) {
      setError(err.message);
      setAEliminar(null);
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Servicios</h1>
          <p className="subtitle">Los servicios web que estás monitoreando.</p>
        </div>
        <Link className="btn-primary btn-compact" to="/servicios/nuevo">
          Nuevo servicio
        </Link>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="card">
        {cargando ? (
          <p className="tabla-vacia">Cargando servicios...</p>
        ) : servicios.length === 0 ? (
          <p className="tabla-vacia">
            Todavía no tenés servicios. Creá el primero con "Nuevo servicio".
          </p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>URL</th>
                  <th>Estado</th>
                  <th>Intervalo</th>
                  <th>Activo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {servicios.map((servicio) => (
                  <tr key={servicio.id}>
                    <td>{servicio.nombre}</td>
                    <td className="celda-url">{servicio.url}</td>
                    <td>
                      <EstadoBadge estado={servicio.activo ? servicio.ultimo_estado : "PAUSADO"} />
                    </td>
                    <td>{servicio.intervalo_segundos} s</td>
                    <td>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={servicio.activo}
                          onChange={() => handleCambiarActivo(servicio)}
                          aria-label={`Monitoreo activo de ${servicio.nombre}`}
                        />
                        <span className="switch-slider" />
                      </label>
                    </td>
                    <td>
                      <div className="acciones">
                        <Link className="btn-link" to={`/servicios/${servicio.id}`}>
                          Ver detalle
                        </Link>
                        <Link className="btn-link" to={`/servicios/${servicio.id}/editar`}>
                          Editar
                        </Link>
                        <button
                          className="btn-link btn-link-danger"
                          onClick={() => setAEliminar(servicio)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aEliminar && (
        <div className="modal-fondo">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
            <h2 id="modal-titulo">Eliminar servicio</h2>
            <p>
              ¿Seguro que querés eliminar <strong>{aEliminar.nombre}</strong>? También se borra
              su historial de comprobaciones. Esta acción no se puede deshacer.
            </p>
            <div className="modal-acciones">
              <button
                className="btn-outline btn-compact"
                onClick={() => setAEliminar(null)}
                disabled={eliminando}
              >
                Cancelar
              </button>
              <button
                className="btn-danger btn-compact"
                onClick={handleConfirmarEliminar}
                disabled={eliminando}
              >
                {eliminando ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
