import { findActiveWidgetForSubmission, findExistingSubmissionByIdemKey, insertSubmission, findOwnedWidgetId, listSubmissionsForWidget as listRows } from './submissions.repository.js';
import { buildSubmissionSchemaForWidget } from './submissions.schema.js';
import { resolveGeoForIp } from '../../services/geo/geoClient.js';
import { widgetInngest } from '../../inngest/client.js';
import { recordEnqueueFailure } from './sideEffectLog.repository.js';

export async function storeSubmission({ widgetId, submittedData, idempotencyKey, visitorIp }) {
   const widgetRow = await findActiveWidgetForSubmission({ widgetId });
   if (!widgetRow) return { outcome: 'WIDGET_NOT_FOUND' };
   const existingSubmissionByIdemKey = await findExistingSubmissionByIdemKey({ widgetId, idempotencyKey });
   if (existingSubmissionByIdemKey) {
      return { outcome: 'IDEMPOTENT_REPLAY', submissionRow: existingSubmissionByIdemKey };
   }
   const submissionSchema = buildSubmissionSchemaForWidget(widgetRow.fields);
   const parsedPayload = submissionSchema.safeParse(submittedData);
   if (!parsedPayload.success) {
      return { outcome: 'PAYLOAD_INVALID', validationError: parsedPayload.error.errors[0]?.message ?? 'Invalid submission' };
   }
   const { _hp: honeypotFieldValue, ...cleanPayload } = parsedPayload.data;
   if (typeof honeypotFieldValue === 'string' && honeypotFieldValue.length > 0) {
      console.warn(`spam_dropped widget=${widgetId} ip=${visitorIp}`);
      return { outcome: 'SPAM_DROPPED' };
   }
   const validatedPayload = cleanPayload;
   const enrichedGeo = await resolveGeoForIp(visitorIp);
   try {
      const submissionRow = await insertSubmission({
         widgetId, tenantId: widgetRow.tenant_id,
         validatedPayload, idempotencyKey, visitorIp,
         geoCountry: enrichedGeo.geoCountry,
         geoCity: enrichedGeo.geoCity,
         geoProviderUsed: enrichedGeo.geoProviderUsed,
      });
      try {
         await widgetInngest.send({
         name: 'submission/created',
         id: submissionRow.id,
         data: { submissionId: submissionRow.id, widgetId, tenantId: widgetRow.tenant_id },
         });
      } catch (enqueueError) {
         await recordEnqueueFailure({
           submissionId: submissionRow.id,
           errorMessage: enqueueError?.message ?? 'enqueue failed',
         });
      }
      return { outcome: 'CREATED', submissionRow };
   } catch (insertError) {
      if (insertError?.code === '23505') {
         const racedSubmission = await findExistingSubmissionByIdemKey({ widgetId, idempotencyKey });
         return { outcome: 'IDEMPOTENT_REPLAY', submissionRow: racedSubmission };
      }
      throw insertError;
   }
}

export async function listSubmissionsForWidget({ widgetId, tenantId, listLimit, cursorSubmissionId }) {
   const ownedWidgetId = await findOwnedWidgetId({ widgetId, tenantId });
   if (!ownedWidgetId) return { outcome: 'WIDGET_NOT_FOUND' };
   const { submissionRows, nextCursor } = await listRows({ 
      widgetId, tenantId, listLimit, cursorSubmissionId 
   });
   return { outcome: 'FOUND', submissionRows, nextCursor };
}