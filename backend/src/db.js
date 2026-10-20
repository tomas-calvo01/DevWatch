// db.js
// Pool de conexiones a PostgreSQL. Lo usan todos los módulos (US01-US04 por ahora).
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export function query(texto, params) {
  return pool.query(texto, params);
}
