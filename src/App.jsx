import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import ListadoServicios from "./pages/ListadoServicios";
import FormularioServicio from "./pages/FormularioServicio";
import DetalleServicio from "./pages/DetalleServicio";
import { getCurrentUser } from "./services/authService";
import "./App.css";

/**
 * Rutas del Módulo de Usuarios (actividad 2.1 de la EDT) y del Módulo
 * de Servicios (actividad 2.2: US05, US06, US07, US08 y US12).
 * Cuando construyamos el siguiente módulo (2.3 Dashboard) se van a
 * agregar acá sus rutas, siguiendo el mismo mapa de navegación del
 * Documento de Diseño de Interfaz.
 */
function InicioRedirect() {
  const usuario = getCurrentUser();
  return <Navigate to={usuario ? "/servicios" : "/login"} replace />;
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
            <Route
              path="/servicios"
              element={
                <ProtectedRoute>
                  <ListadoServicios />
                </ProtectedRoute>
              }
            />
            <Route
              path="/servicios/nuevo"
              element={
                <ProtectedRoute>
                  <FormularioServicio />
                </ProtectedRoute>
              }
            />
            <Route
              path="/servicios/:id"
              element={
                <ProtectedRoute>
                  <DetalleServicio />
                </ProtectedRoute>
              }
            />
            <Route
              path="/servicios/:id/editar"
              element={
                <ProtectedRoute>
                  <FormularioServicio />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
