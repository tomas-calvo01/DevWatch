// ecosystem.config.cjs
// Configuración de PM2 (actividades 5.1/5.2): el API y el Motor de Monitoreo
// corren como dos procesos independientes. Ambos cargan las variables de entorno
// desde .env (dotenv) porque se ejecutan con esta misma carpeta como cwd.
// Uso: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "devwatch-api",
      script: "src/server.js",
      cwd: __dirname,
      autorestart: true,
      env: { NODE_ENV: "production" },
    },
    {
      name: "devwatch-monitor",
      script: "src/monitor/index.js",
      cwd: __dirname,
      autorestart: true,
      // Da tiempo al apagado ordenado (espera hasta 10 s a los checks en curso).
      kill_timeout: 12000,
      env: { NODE_ENV: "production" },
    },
  ],
};
