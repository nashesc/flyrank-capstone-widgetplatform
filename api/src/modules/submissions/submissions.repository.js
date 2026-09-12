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

export async function findOwnedWidgetId({ widgetId, tenantId }) {
   const found = await pool.query(
      `SELECT id FROM widgets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [widgetId, tenantId]
   );
   return found.rows[0]?.id ?? null;
}

export async function listSubmissionsForWidget({ widgetId, tenantId, listLimit, cursorSubmissionId }) {
   let cursorCreatedAt = null;
   if (cursorSubmissionId) {
      const cursorRow = await pool.query(
         `SELECT created_at FROM submissions WHERE id = $1 AND widget_id = $2 AND tenant_id = $3`,
         [cursorSubmissionId, widgetId, tenantId]
      );
      if (cursorRow.rows.length === 0) return { submissionRows: [], nextCursor: null };
      cursorCreatedAt = cursorRow.rows[0].created_at;
   }
   const submissionRows = cursorSubmissionId
      ? (await pool.query(
         `SELECT * FROM submissions WHERE widget_id = $1 AND tenant_id = $2
            AND (created_at, id) < ($4, $5)
            ORDER BY created_at DESC, id DESC LIMIT $3`,
         [widgetId, tenantId, listLimit, cursorCreatedAt, cursorSubmissionId]
         )).rows
      : (await pool.query(
         `SELECT * FROM submissions WHERE widget_id = $1 AND tenant_id = $2
            ORDER BY created_at DESC, id DESC LIMIT $3`,
         [widgetId, tenantId, listLimit]
         )).rows;
   const nextCursor = submissionRows.length === listLimit ? submissionRows[submissionRows.length - 1].id : null;
   return { submissionRows, nextCursor };
}