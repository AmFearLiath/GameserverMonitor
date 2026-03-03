import { getPool } from '../client.js';

const run = async (): Promise<void> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT
        s.id,
        s.name,
        s.normalized_status,
        s.last_reason_code,
        s.last_reason_source,
        s.last_check_at,
        COUNT(e.id) AS endpoint_count,
        SUM(CASE WHEN e.host IN ('0.0.0.0', '::', '::0') THEN 1 ELSE 0 END) AS wildcard_endpoints
      FROM servers s
      LEFT JOIN endpoints e
        ON e.server_id = s.id
       AND e.is_enabled = 1
      WHERE s.deleted_at IS NULL
      GROUP BY
        s.id,
        s.name,
        s.normalized_status,
        s.last_reason_code,
        s.last_reason_source,
        s.last_check_at
      ORDER BY s.name ASC
      LIMIT 50
    `
  );

  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
};

void run();
