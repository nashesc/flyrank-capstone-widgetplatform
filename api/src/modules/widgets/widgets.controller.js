import { createWidgetSchema, patchWidgetSchema, widgetIdParamSchema, listCursorSchema } from './widgets.schema.js';
import { createWidgetForTenant, listWidgetsForTenant, getWidgetForTenant, updateWidgetForTenant, removeWidgetForTenant } from './widgets.service.js';
import { listSubmissionsForWidget } from '../submissions/submissions.service.js';
import { getLatestBundleVersion } from '../../widget-script/bundleVersions.js';

function sendValidationError(res, zodError) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: zodError.errors[0]?.message ?? 'Invalid body' } });
}

function sendNotFound(res) {
  return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
}

function isWidgetIdParamValid(req) {
  return widgetIdParamSchema.safeParse(req.params.id).success;
}

export async function createWidget(req, res) {
  const parsed = createWidgetSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const widgetRow = await createWidgetForTenant({ tenantId: req.tenantId, validatedBody: parsed.data });
  res.status(201).location(`/api/widgets/${widgetRow.id}`).json(widgetRow);
}

export async function listWidgets(req, res) {
  const listLimit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
  const cursorWidgetId = req.query.cursor ?? null;
  if (!listCursorSchema.safeParse(cursorWidgetId).success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid cursor' } });
  }
  const { widgetRows, nextCursor } = await listWidgetsForTenant({ tenantId: req.tenantId, listLimit, cursorWidgetId });
  res.json({ data: widgetRows, nextCursor });
}

export async function getWidget(req, res) {
  if (!isWidgetIdParamValid(req)) return sendNotFound(res);
  const widgetRow = await getWidgetForTenant({ widgetId: req.params.id, tenantId: req.tenantId });
  if (!widgetRow) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
  res.json(widgetRow);
}

export async function patchWidget(req, res) {
  if (!isWidgetIdParamValid(req)) return sendNotFound(res);
  const parsed = patchWidgetSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const widgetRow = await updateWidgetForTenant({ widgetId: req.params.id, tenantId: req.tenantId, patchValues: parsed.data });
  if (!widgetRow) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
  res.json(widgetRow);
}

export async function deleteWidget(req, res) {
  if (!isWidgetIdParamValid(req)) return sendNotFound(res);
  const wasDeleted = await removeWidgetForTenant({ widgetId: req.params.id, tenantId: req.tenantId });
  if (!wasDeleted) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
  res.status(204).end();
}

export async function getWidgetEmbed(req, res) {
  if (!isWidgetIdParamValid(req)) return sendNotFound(res);
  const widgetRow = await getWidgetForTenant({ widgetId: req.params.id, tenantId: req.tenantId });
  if (!widgetRow) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:4000';
  const latestBundleVersion = getLatestBundleVersion();
  res.json({ snippet: `<script src="${baseUrl}/widget.v${latestBundleVersion}.js?id=${widgetRow.id}"></script>` });
}

export async function getWidgetSubmissions(req, res) {
  if (!isWidgetIdParamValid(req)) return sendNotFound(res);
  const listLimit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
  const cursorSubmissionId = req.query.cursor ?? null;
  if (!listCursorSchema.safeParse(cursorSubmissionId).success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid cursor' } });
  }
  const listed = await listSubmissionsForWidget({ 
    widgetId: req.params.id, 
    tenantId: req.tenantId, 
    listLimit, 
    cursorSubmissionId 
  });
  if (listed.outcome === 'WIDGET_NOT_FOUND') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
  }
  res.json({ data: listed.submissionRows, nextCursor: listed.nextCursor });
}