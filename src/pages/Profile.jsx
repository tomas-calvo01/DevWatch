import { useState } from "react";
import { getCurrentUser, updateProfile } from "../services/authService";

/**
 * US04 — Como usuario, quiero editar mis datos básicos de perfil,
 * para mantener mi información actualizada.
 *
 * (US03, cerrar sesión, está resuelto desde el botón del Navbar,
 * visible en todas las pantallas autenticadas.)
 */
export default function Profile() {
  const usuarioActual = getCurrentUser();
  const [nombre, setNombre] = useState(usuarioActual.nombre);
  const [email, setEmail] = useState(usuarioActual.email);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMensaje("");
    setCargando(true);
    try {
      await updateProfile({ nombre, email });
      setMensaje("Perfil actualizado correctamente.");
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Mi perfil</h1>
      <p className="subtitle">Editá tus datos básicos de cuenta.</p>

      {error && <div className="form-error">{error}</div>}
      {mensaje && <div className="form-success">{mensaje}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="nombre">Nombre</label>
          <input
            id="nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <button className="btn-primary" type="submit" disabled={cargando}>
          {cargando ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}
