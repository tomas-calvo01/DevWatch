import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import { getCurrentUser } from "./services/authService";
import "./App.css";

/**
 * Rutas del Módulo de Usuarios (actividad 2.1 de la EDT).
 * A medida que construyamos los siguientes módulos (2.2 Servicios,
 * 2.3 Dashboard) se van a agregar acá sus rutas, siguiendo el mismo
 * mapa de navegación del Documento de Diseño de Interfaz.
 */
function InicioRedirect() {
  const usuario = getCurrentUser();
  return <Navigate to={usuario ? "/perfil" : "/login"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Navbar />
        <div className="app-content">
          <Routes>
            <Route path="/" element={<InicioRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/registro" element={<Register />} />
            <Route
              path="/perfil"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
