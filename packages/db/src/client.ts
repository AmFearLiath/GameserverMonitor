import mysql, { type Connection, type Pool } from 'mysql2/promise';
import { config } from '@gm/config';

let pool: Pool | null = null;

export const getPool = (): Pool => {
  if (pool) {
    return pool;
  }

  pool = mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    connectionLimit: 10,
    namedPlaceholders: true,
    timezone: 'Z',
    multipleStatements: true
  });

  return pool;
};

export const createDbConnection = async (): Promise<Connection> => {
  return mysql.createConnection({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    timezone: 'Z'
  });
};
