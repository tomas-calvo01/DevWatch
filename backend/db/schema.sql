-- schema.sql
-- Módulo de Usuarios (US01, US02, US03, US04).
-- Las demás tablas se agregan en las próximas actividades.

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'administrador' CHECK (rol IN ('administrador','operador')),
  fecha_creacion TIMESTAMP NOT NULL DEFAULT now()
);
