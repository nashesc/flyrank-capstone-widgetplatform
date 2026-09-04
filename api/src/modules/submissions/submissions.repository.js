import pool from '../../db/pool.js';

export async function findActiveWidgetForSubmission({ widgetId }) {
   const found = await pool.query(
      `SELECT id, tenant_id, fields FROM widgets WHERE id = $1 AND deleted_at IS NULL`,
      [widgetId]
   );
   return found.rows[0] ?? null;
}

export async function findExistingSubmissionByIdemKey({ widgetId, idempotencyKey }) {
   const found = await pool.query(
      `SELECT * FROM submissions WHERE widget_id = $1 AND idempotency_key = $2`,
      [widgetId, idempotencyKey]
   );
   return found.rows[0] ?? null;
}

export async function insertSubmission({ widgetId, tenantId, validatedPayload, idempotencyKey, visitorIp, geoCountry, geoCity, geoProviderUsed }) {
  const inserted = await pool.query(
    `INSERT INTO submissions (widget_id, tenant_id, payload, idempotency_key, ip, geo_country, geo_city, geo_provider_used)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [widgetId, tenantId, JSON.stringify(validatedPayload), idempotencyKey, visitorIp, geoCountry, geoCity, geoProviderUsed]
  );
   return inserted.rows[0];
}