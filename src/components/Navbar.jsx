import { Link, useNavigate } from "react-router-dom";
import { getCurrentUser, logout } from "../services/authService";

/**
 * Barra de navegación persistente (definida en el Documento de Diseño
 * de Interfaz, sección "Componentes de UI reutilizables"). Por ahora
 * solo tiene el link a Perfil; cuando construyamos 2.2 y 2.3 se agregan
 * acá los links a Servicios y Dashboard.
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
        <Link to="/perfil">👤 {usuario.nombre}</Link>
        <button onClick={handleLogout}>Cerrar sesión</button>
      </div>
    </nav>
  );
}
