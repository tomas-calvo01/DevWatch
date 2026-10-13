import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser, logout } from "../services/authService";
import { EVENTO_NOTIFICACIONES, contarNoLeidas } from "../services/incidentesService";

/**
 * Barra de navegación persistente (definida en el Documento de Diseño
 * de Interfaz, sección "Componentes de UI reutilizables"). Tiene los
 * links a Dashboard (2.3), Servicios (2.2), Incidentes, Alertas (2.3)
 * y Perfil.
 *
 * El link "Alertas" muestra cuántas notificaciones de caída y de
 * recuperación (US23, US24) están sin leer.
 */
export default function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const usuario = getCurrentUser();
  const usuarioId = usuario ? usuario.id : null;
  const [noLeidas, setNoLeidas] = useState(0);

  // El contador se vuelve a pedir al navegar y cada vez que el servicio
  // avisa que cambiaron las notificaciones (por ejemplo, al marcarlas
  // como leídas desde la pantalla de Alertas).
  useEffect(() => {
    if (!usuarioId) return;
    let cancelado = false;
    function actualizar() {
      contarNoLeidas()
        .then((cantidad) => {
          if (!cancelado) setNoLeidas(cantidad);
        })
        .catch(() => {}); // el contador no es crítico: si falla, queda como estaba
    }
    actualizar();
    window.addEventListener(EVENTO_NOTIFICACIONES, actualizar);
    return () => {
      cancelado = true;
      window.removeEventListener(EVENTO_NOTIFICACIONES, actualizar);
    };
  }, [usuarioId, pathname]);

  function handleLogout() {
    logout();
    setNoLeidas(0);
    navigate("/login");
  }

  if (!usuario) return null; // No se muestra en Login/Registro

  return (
    <nav className="navbar">
      <span className="brand">DevWatch</span>
      <div className="nav-links">
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/servicios">Servicios</Link>
        <Link to="/incidentes">Incidentes</Link>
        <Link to="/alertas">
          Alertas
          {noLeidas > 0 && (
            <span className="nav-contador" aria-label={`${noLeidas} sin leer`}>
              {noLeidas > 99 ? "99+" : noLeidas}
            </span>
          )}
        </Link>
        <Link to="/perfil">👤 {usuario.nombre}</Link>
        <button onClick={handleLogout}>Cerrar sesión</button>
      </div>
    </nav>
  );
}
