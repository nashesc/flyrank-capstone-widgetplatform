import { z } from 'zod';
import { getDashboardStats } from './dashboard.service.js';

const widgetIdQuerySchema = z.string().uuid().optional();

export async function getStats(req, res) {
  const parsed = widgetIdQuerySchema.safeParse(req.query.widgetId);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid widgetId' } });
  }
  const statsResult = await getDashboardStats({ tenantId: req.tenantId, widgetId: parsed.data ?? null });
  if (statsResult.outcome === 'WIDGET_NOT_FOUND') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
  }
  res.json(statsResult.stats);
}
