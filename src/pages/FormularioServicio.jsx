import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { crearServicio, editarServicio, obtenerServicio } from "../services/serviciosService";

/**
 * Formulario de alta y edición de servicios
 * (rutas /servicios/nuevo y /servicios/:id/editar).
 *
 * - US05 — Como usuario, quiero registrar un servicio web con nombre, URL,
 *   tipo e intervalo, para que la plataforma lo monitoree. Incluye la
 *   validación de la URL.
 * - US06 — Como usuario, quiero editar un servicio, para corregir sus
 *   datos. Se guardan los cambios sin perder el historial de comprobaciones.
 */
const INTERVALO_MINIMO = 10;

function validar({ nombre, url, intervalo }) {
  const errores = {};

  if (!nombre.trim()) {
    errores.nombre = "El nombre es obligatorio.";
  }

  const urlLimpia = url.trim();
  if (!urlLimpia) {
    errores.url = "La URL es obligatoria.";
  } else if (!/^https?:\/\//i.test(urlLimpia)) {
    errores.url = "La URL tiene que empezar con http:// o https://.";
  } else if (!URL.canParse(urlLimpia)) {
    errores.url = "La URL no es válida. Ejemplo: https://www.ejemplo.com";
  }

  const intervaloLimpio = intervalo.trim();
  if (!intervaloLimpio) {
    errores.intervalo = "El intervalo es obligatorio.";
  } else if (!/^\d+$/.test(intervaloLimpio)) {
    errores.intervalo = "El intervalo tiene que ser un número entero de segundos.";
  } else if (Number(intervaloLimpio) < INTERVALO_MINIMO) {
    errores.intervalo = `El intervalo mínimo es de ${INTERVALO_MINIMO} segundos.`;
  }

  return errores;
}

export default function FormularioServicio() {
  const { id } = useParams();
  const esEdicion = Boolean(id);
  const navigate = useNavigate();

  const [nombre, setNombre] = useState("");
  const [url, setUrl] = useState("");
  const [tipo, setTipo] = useState("HTTP");
  const [intervalo, setIntervalo] = useState("60");
  const [errores, setErrores] = useState({});
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [cargandoDatos, setCargandoDatos] = useState(esEdicion);
  const [noEncontrado, setNoEncontrado] = useState(false);

  // En modo edición se precargan los datos actuales del servicio.
  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    obtenerServicio(id)
      .then((servicio) => {
        if (cancelado) return;
        setNombre(servicio.nombre);
        setUrl(servicio.url);
        setTipo(servicio.tipo);
        setIntervalo(String(servicio.intervalo_segundos));
      })
      .catch((err) => {
        if (cancelado) return;
        setError(err.message);
        setNoEncontrado(true);
      })
      .finally(() => {
        if (!cancelado) setCargandoDatos(false);
      });
    return () => {
      cancelado = true;
    };
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const nuevosErrores = validar({ nombre, url, intervalo });
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;

    const datos = {
      nombre: nombre.trim(),
      url: url.trim(),
      tipo,
      intervalo_segundos: Number(intervalo.trim()),
    };

    setCargando(true);
    try {
      if (esEdicion) {
        await editarServicio(id, datos);
      } else {
        await crearServicio(datos);
      }
      navigate("/servicios");
    } catch (err) {
      setError(err.message);
      setCargando(false);
    }
  }

  if (cargandoDatos) {
    return (
      <div className="auth-card form-servicio">
        <p className="subtitle">Cargando servicio...</p>
      </div>
    );
  }

  if (noEncontrado) {
    return (
      <div className="auth-card form-servicio">
        <div className="form-error">{error}</div>
        <p className="form-footer">
          <Link to="/servicios">Volver a Servicios</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-card form-servicio">
      <h1>{esEdicion ? "Editar servicio" : "Nuevo servicio"}</h1>
      <p className="subtitle">
        {esEdicion
          ? "Modificá los datos del servicio. El historial de comprobaciones se conserva."
          : "Registrá un servicio web para empezar a monitorearlo."}
      </p>

      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="nombre">Nombre</label>
          <input
            id="nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            aria-invalid={Boolean(errores.nombre)}
            autoFocus
          />
          {errores.nombre && <p className="field-error">{errores.nombre}</p>}
        </div>
        <div className="field">
          <label htmlFor="url">URL</label>
          <input
            id="url"
            type="url"
            placeholder="https://www.ejemplo.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-invalid={Boolean(errores.url)}
          />
          {errores.url && <p className="field-error">{errores.url}</p>}
        </div>
        <div className="field">
          <label htmlFor="tipo">Tipo</label>
          <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="HTTP">HTTP</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="intervalo">Intervalo (segundos)</label>
          <input
            id="intervalo"
            type="number"
            min={INTERVALO_MINIMO}
            step="1"
            value={intervalo}
            onChange={(e) => setIntervalo(e.target.value)}
            aria-invalid={Boolean(errores.intervalo)}
          />
          {errores.intervalo && <p className="field-error">{errores.intervalo}</p>}
        </div>
        <button className="btn-primary" type="submit" disabled={cargando}>
          {cargando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear servicio"}
        </button>
      </form>

      <p className="form-footer">
        <Link to="/servicios">Cancelar</Link>
      </p>
    </div>
  );
}
