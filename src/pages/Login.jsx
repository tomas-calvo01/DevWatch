import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../services/authService";

/**
 * US02 — Como usuario registrado, quiero iniciar sesión, para acceder
 * a mi cuenta y mis servicios.
 *
 * Criterios de aceptación (Documento de Requerimientos):
 * - Login con email/contraseña.
 * - Mensaje de error ante credenciales inválidas.
 * - Redirección al dashboard tras login exitoso (por ahora, a Perfil,
 *   hasta que construyamos el Dashboard real en 2.3).
 */
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await login({ email, password });
      navigate("/perfil");
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Iniciar sesión</h1>
      <p className="subtitle">Accedé a tu cuenta de DevWatch.</p>

      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn-primary" type="submit" disabled={cargando}>
          {cargando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>

      <p className="form-footer">
        ¿No tenés cuenta? <Link to="/registro">Registrate</Link>
      </p>
    </div>
  );
}
