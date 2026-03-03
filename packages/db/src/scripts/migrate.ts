import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import { getPool } from '../client.js';
import { createLogger } from '@gm/logger';
import { getRepoRoot } from './paths.js';
import { config } from '@gm/config';

const logger = createLogger('db-migrate');

const run = async (): Promise<void> => {
  const requestId = randomUUID();

  const bootstrapConnection = await mysql.createConnection({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    timezone: 'Z'
  });

  await bootstrapConnection.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await bootstrapConnection.end();

  const pool = getPool();
  const repoRoot = getRepoRoot();

  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(191) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );

  const migrationDir = path.join(repoRoot, 'migrations');
  const files = (await fs.readdir(migrationDir))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const fileName of files) {
    const migrationId = fileName.replace('.sql', '');
    const [rows] = await pool.query<(RowDataPacket & { id: string })[]>(
      'SELECT id FROM schema_migrations WHERE id = ?',
      [migrationId]
    );

    if (rows.length > 0) {
      logger.info('migration already applied', { request_id: requestId }, { migration_id: migrationId });
      continue;
    }

    const sql = await fs.readFile(path.join(migrationDir, fileName), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [migrationId]);
    logger.info('migration applied', { request_id: requestId }, { migration_id: migrationId });
  }

  await pool.end();
};

run().catch((error: unknown) => {
  const requestId = randomUUID();
  logger.error('migration failed', { request_id: requestId }, { error: String(error) });
  process.exitCode = 1;
});
