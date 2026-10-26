-- schema.sql
-- Módulo de Usuarios (US01, US02, US03, US04).
-- Motor de Monitoreo (actividad 3.3): servicios y comprobaciones.
-- Las demás tablas se agregan en las próximas actividades.

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'administrador' CHECK (rol IN ('administrador','operador')),
  fecha_creacion TIMESTAMP NOT NULL DEFAULT now()
);

-- Motor de Monitoreo (actividad 3.3).
-- La tabla servicios también la usa el módulo de Servicios (actividad 3.2):
-- no cambiar nombres ni tipos sin acordarlo.
CREATE TABLE IF NOT EXISTS servicios (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre VARCHAR(120) NOT NULL,
  url VARCHAR(255) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'HTTP',
  intervalo_segundos INTEGER NOT NULL DEFAULT 60,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT now()
);

-- Resultado de cada health check que hace el worker.
CREATE TABLE IF NOT EXISTS comprobaciones (
  id BIGSERIAL PRIMARY KEY,
  servicio_id INTEGER NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  timestamp TIMESTAMP NOT NULL DEFAULT now(),
  estado VARCHAR(10) NOT NULL CHECK (estado IN ('UP','DOWN','TIMEOUT')),
  status_code INTEGER NULL,
  tiempo_respuesta_ms INTEGER NULL
);

CREATE INDEX IF NOT EXISTS idx_comprobaciones_servicio_ts ON comprobaciones (servicio_id, timestamp DESC);

-- Módulo de Servicios (actividad 3.2).
-- Listado de servicios de un usuario.
CREATE INDEX IF NOT EXISTS idx_servicios_usuario ON servicios (usuario_id);

-- Un usuario no puede registrar dos servicios con la misma URL.
-- La API traduce la violación de este índice (23505) a un 409.
CREATE UNIQUE INDEX IF NOT EXISTS uq_servicios_usuario_url ON servicios (usuario_id, url);

-- Gestión de Incidentes (actividad 3.4).
CREATE TABLE IF NOT EXISTS incidentes (
  id SERIAL PRIMARY KEY,
  servicio_id INTEGER NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  estado VARCHAR(20) NOT NULL DEFAULT 'Detectado'
    CHECK (estado IN ('Detectado','Investigando','Identificado','Resuelto','Cerrado')),
  severidad VARCHAR(10) NOT NULL DEFAULT 'Alta' CHECK (severidad IN ('Crítica','Alta','Media','Baja')),
  fecha_inicio TIMESTAMP NOT NULL DEFAULT now(),
  fecha_resolucion TIMESTAMP NULL
);

-- MODIFICACIÓN DEL DISEÑO DE BD (actualizar ese documento): se agrega la columna
-- usuario_id, que el diseño no tenía. US14 y US15 exigen mostrar el usuario
-- responsable de cada cambio de estado. NULL = cambio hecho por el Sistema
-- (apertura y resolución automáticas del Motor de Monitoreo).
CREATE TABLE IF NOT EXISTS historial_incidentes (
  id SERIAL PRIMARY KEY,
  incidente_id INTEGER NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
  estado_anterior VARCHAR(20) NULL,
  estado_nuevo VARCHAR(20) NOT NULL,
  fecha_cambio TIMESTAMP NOT NULL DEFAULT now(),
  usuario_id INTEGER NULL REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_incidentes_servicio_estado ON incidentes (servicio_id, estado);
CREATE INDEX IF NOT EXISTS idx_historial_incidente_fecha ON historial_incidentes (incidente_id, fecha_cambio);

-- Un solo incidente activo (ni Resuelto ni Cerrado) por servicio.
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidente_activo_por_servicio
  ON incidentes (servicio_id) WHERE estado NOT IN ('Resuelto','Cerrado');
