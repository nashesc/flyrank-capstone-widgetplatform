import { createWidgetSchema, patchWidgetSchema } from './widgets.schema.js';
import { createWidgetForTenant, listWidgetsForTenant, getWidgetForTenant, updateWidgetForTenant, removeWidgetForTenant } from './widgets.service.js';
import { listSubmissionsForWidget } from '../submissions/submissions.service.js';

function sendValidationError(res, zodError) {
   return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: zodError.errors[0]?.message ?? 'Invalid body' } });
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
   const { widgetRows, nextCursor } = await listWidgetsForTenant({ tenantId: req.tenantId, listLimit, cursorWidgetId });
   res.json({ data: widgetRows, nextCursor });
}

export async function getWidget(req, res) {
   const widgetRow = await getWidgetForTenant({ widgetId: req.params.id, tenantId: req.tenantId });
   if (!widgetRow) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
   res.json(widgetRow);
}

export async function patchWidget(req, res) {
   const parsed = patchWidgetSchema.safeParse(req.body);
   if (!parsed.success) return sendValidationError(res, parsed.error);
   const widgetRow = await updateWidgetForTenant({ widgetId: req.params.id, tenantId: req.tenantId, patchValues: parsed.data });
   if (!widgetRow) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
   res.json(widgetRow);
}

export async function deleteWidget(req, res) {
   const wasDeleted = await removeWidgetForTenant({ widgetId: req.params.id, tenantId: req.tenantId });
   if (!wasDeleted) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
   res.status(204).end();
}

export async function getWidgetEmbed(req, res) {
   const widgetRow = await getWidgetForTenant({ widgetId: req.params.id, tenantId: req.tenantId });
   if (!widgetRow) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
   const baseUrl = process.env.BASE_URL ?? 'http://localhost:4000';
   res.json({ snippet: `<script src="${baseUrl}/widget.v1.js?id=${widgetRow.id}"></script>` });
}

export async function getWidgetSubmissions(req, res) {
   const listLimit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
   const cursorSubmissionId = req.query.cursor ?? null;
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