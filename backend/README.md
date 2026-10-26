# DevWatch — Backend

Node.js (ESM) + Express + PostgreSQL. Requiere Node 18 o superior.

```bash
npm install
cp .env.example .env   # completar DATABASE_URL, JWT_SECRET, etc.
```

## Motor de Monitoreo

Proceso worker **independiente del API** (actividad 3.3). Cada `MONITOR_TICK_SECONDS`
relee la base, toma los servicios con `activo = true` cuya última comprobación tiene
al menos `intervalo_segundos` de antigüedad (o que nunca se comprobaron), les hace un
`GET` HTTP y guarda el resultado en la tabla `comprobaciones`. No crea incidentes ni
alertas: después de cada comprobación llama a `alResultado()` de
`src/monitor/hooks.js`, que es donde se engancha la actividad 3.4.

Como el API y el monitor son procesos distintos, el monitor no recibe avisos: las
altas, ediciones, bajas y activaciones de servicios se reflejan solas en el próximo tick.

### 1. Aplicar el esquema

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

Usa `CREATE TABLE IF NOT EXISTS`, así que se puede volver a ejecutar sin perder datos.

### 2. Arrancar el API y el monitor (dos terminales)

```bash
# Terminal 1 — API
npm run dev

# Terminal 2 — Motor de Monitoreo
npm run monitor:dev    # o "npm run monitor" sin recarga automática
```

`Ctrl+C` detiene el monitor ordenadamente: deja de lanzar checks, espera hasta 10 s a
los que están en curso y cierra la conexión a la base.

En producción se pueden levantar ambos con PM2: `pm2 start ecosystem.config.cjs`.

### 3. Prueba de humo

```bash
npm run probar-monitor
```

No usa internet: levanta servidores HTTP locales, crea un usuario y servicios de prueba,
corre el scheduler ~15 s, verifica los resultados y borra los datos de prueba.
Detené `npm run monitor` antes de correrla para que no compruebe también esos servicios.

### Variables de entorno

| Variable                   | Por defecto | Descripción                                          |
| -------------------------- | ----------- | ---------------------------------------------------- |
| `DATABASE_URL`             | —           | Conexión a PostgreSQL (obligatoria).                 |
| `MONITOR_TIMEOUT_MS`       | `10000`     | Tiempo máximo de espera de cada health check (ms).   |
| `MONITOR_TICK_SECONDS`     | `5`         | Cada cuántos segundos revisa qué servicios comprobar. |
| `MONITOR_MAX_CONCURRENTES` | `20`        | Máximo de health checks en paralelo.                 |

### Estados de una comprobación

| Estado    | Significado                                                                 | `status_code` | `tiempo_respuesta_ms` |
| --------- | --------------------------------------------------------------------------- | ------------- | --------------------- |
| `UP`      | Respondió con un status 200–399.                                            | sí            | sí                    |
| `DOWN`    | Respondió con 4xx/5xx.                                                       | sí            | sí                    |
| `DOWN`    | No se pudo conectar (error de red, DNS, conexión rechazada, URL inválida).  | `null`        | `null`                |
| `TIMEOUT` | No respondió dentro de `MONITOR_TIMEOUT_MS`.                                 | `null`        | `null`                |

El `tiempo_respuesta_ms` se mide hasta recibir el status y las cabeceras. Las
redirecciones se siguen, así que se registra el status de la respuesta final.
