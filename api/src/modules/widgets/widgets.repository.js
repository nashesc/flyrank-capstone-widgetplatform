import pool from '../../db/pool.js';

export async function insertWidget({ tenantId, type, title, description, widgetFields, buttonText, displayOptions }) {
   const inserted = await pool.query(
      `INSERT INTO widgets (tenant_id, type, title, description, fields, button_text, display_options)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tenantId, type, title, description, JSON.stringify(widgetFields), buttonText, JSON.stringify(displayOptions)]
   );
   return inserted.rows[0];
}

export async function listWidgetsByTenant({ tenantId, listLimit, cursorWidgetId }) {
   let cursorCreatedAt = null;
   if (cursorWidgetId) {
      const cursorRow = await pool.query(
         `SELECT created_at FROM widgets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
         [cursorWidgetId, tenantId]
      );
      if (cursorRow.rows.length === 0) return { widgetRows: [], nextCursor: null };
      cursorCreatedAt = cursorRow.rows[0].created_at;
   }
   const widgetRows = cursorWidgetId
      ? (await pool.query(
         `SELECT * FROM widgets WHERE tenant_id = $1 AND deleted_at IS NULL
            AND (created_at, id) < ($3, $4)
            ORDER BY created_at DESC, id DESC LIMIT $2`,
         [tenantId, listLimit, cursorCreatedAt, cursorWidgetId]
         )).rows
      : (await pool.query(
         `SELECT * FROM widgets WHERE tenant_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC, id DESC LIMIT $2`,
         [tenantId, listLimit]
         )).rows;
   const nextCursor = widgetRows.length === listLimit ? widgetRows[widgetRows.length - 1].id : null;
   return { widgetRows, nextCursor };
}

export async function findWidgetByIdForTenant({ widgetId, tenantId }) {
  const found = await pool.query(
    `SELECT * FROM widgets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [widgetId, tenantId]
  );
  return found.rows[0] ?? null;
}

export async function findPublicWidgetConfig({ widgetId }) {
  const found = await pool.query(
    `SELECT type, title, description, fields, button_text, display_options, config_version
     FROM widgets WHERE id = $1 AND deleted_at IS NULL`,
    [widgetId]
  );
  return found.rows[0] ?? null;
}

function hasWidgetValueChanged(columnName, newValue, storedRow) {
  if (columnName === 'fields' || columnName === 'display_options') {
    return JSON.stringify(newValue) !== JSON.stringify(storedRow[columnName]);
  }
  return newValue !== storedRow[columnName];
}

export async function patchWidgetForTenant({ widgetId, tenantId, patchValues }) {
  const currentRow = await findWidgetByIdForTenant({ widgetId, tenantId });
  if (!currentRow) return null;
  const columns = [];
  const values = [];
  let paramIndex = 1;
  for (const [columnName, columnValue] of Object.entries(patchValues)) {
    if (!hasWidgetValueChanged(columnName, columnValue, currentRow)) continue;
    const dbValue = (columnName === 'fields' || columnName === 'display_options')
      ? JSON.stringify(columnValue) : columnValue;
    columns.push(`${columnName} = $${paramIndex++}`);
    values.push(dbValue);
  }
  if (columns.length === 0) return currentRow;
  columns.push(`config_version = config_version + 1`);
  columns.push(`updated_at = now()`);
  values.push(widgetId, tenantId);
   const patched = await pool.query(
      `UPDATE widgets SET ${columns.join(', ')}
      WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++} AND deleted_at IS NULL
      RETURNING *`,
      values
   );
   return patched.rows[0] ?? null;
}

export async function softDeleteWidgetForTenant({ widgetId, tenantId }) {
   const deleted = await pool.query(
      `UPDATE widgets SET deleted_at = now() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [widgetId, tenantId]
   );
   return deleted.rowCount > 0;
}