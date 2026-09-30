import { Navigate } from "react-router-dom";
import { getCurrentUser } from "../services/authService";

/**
 * Envuelve las pantallas que requieren sesión iniciada (ej. Perfil,
 * y más adelante Dashboard, Servicios, Incidentes). Si no hay sesión,
 * redirige a Login en vez de mostrar la pantalla.
 */
export default function ProtectedRoute({ children }) {
  const usuario = getCurrentUser();
  if (!usuario) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
