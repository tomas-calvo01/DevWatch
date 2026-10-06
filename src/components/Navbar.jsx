import { Link, useNavigate } from "react-router-dom";
import { getCurrentUser, logout } from "../services/authService";

/**
 * Barra de navegación persistente (definida en el Documento de Diseño
 * de Interfaz, sección "Componentes de UI reutilizables"). Tiene los
 * links a Servicios (2.2) y Perfil; cuando construyamos 2.3 se agrega
 * acá el link a Dashboard.
 */
export default function Navbar() {
  const navigate = useNavigate();
  const usuario = getCurrentUser();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  if (!usuario) return null; // No se muestra en Login/Registro

  return (
    <nav className="navbar">
      <span className="brand">DevWatch</span>
      <div className="nav-links">
        <Link to="/servicios">Servicios</Link>
        <Link to="/perfil">👤 {usuario.nombre}</Link>
        <button onClick={handleLogout}>Cerrar sesión</button>
      </div>
    </nav>
  );
}
