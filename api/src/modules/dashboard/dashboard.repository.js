import pool from '../../db/pool.js';

export async function countWidgetsForTenant({ tenantId }) {
  const counted = await pool.query(
    `SELECT count(*)::int AS total FROM widgets WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  return counted.rows[0].total;
}

export async function countSubmissionsForTenant({ tenantId }) {
  const counted = await pool.query(
    `SELECT count(*)::int AS total FROM submissions WHERE tenant_id = $1`,
    [tenantId]
  );
  return counted.rows[0].total;
}

export async function summarizeWidgetForTenant({ widgetId, tenantId }) {
  const owned = await pool.query(
    `SELECT id FROM widgets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [widgetId, tenantId]
  );
  if (owned.rows.length === 0) return null;
  const summary = await pool.query(
    `SELECT count(*)::int AS total_submissions, max(created_at) AS last_submission_at
     FROM submissions WHERE widget_id = $1 AND tenant_id = $2`,
    [widgetId, tenantId]
  );
  const dailyCounts = await pool.query(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
     FROM submissions WHERE widget_id = $1 AND tenant_id = $2
       AND created_at >= now() - interval '14 days'
     GROUP BY 1 ORDER BY 1`,
    [widgetId, tenantId]
  );
  const countryCounts = await pool.query(
    `SELECT coalesce(geo_country, 'unknown') AS country, count(*)::int AS count
     FROM submissions WHERE widget_id = $1 AND tenant_id = $2
     GROUP BY 1 ORDER BY 2 DESC`,
    [widgetId, tenantId]
  );
  return {
    widgetId,
    totalSubmissions: summary.rows[0].total_submissions,
    lastSubmissionAt: summary.rows[0].last_submission_at,
    submissionsByDay: dailyCounts.rows,
    submissionsByCountry: countryCounts.rows,
  };
}
