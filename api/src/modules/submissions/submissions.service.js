import { findActiveWidgetForSubmission, findExistingSubmissionByIdemKey, insertSubmission } from './submissions.repository.js';
import { buildSubmissionSchemaForWidget } from './submissions.schema.js';

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
   try {
      const submissionRow = await insertSubmission({
         widgetId, tenantId: widgetRow.tenant_id,
         validatedPayload, idempotencyKey, visitorIp,
      });
      return { outcome: 'CREATED', submissionRow };
   } catch (insertError) {
      if (insertError?.code === '23505') {
         const racedSubmission = await findExistingSubmissionByIdemKey({ widgetId, idempotencyKey });
         return { outcome: 'IDEMPOTENT_REPLAY', submissionRow: racedSubmission };
      }
      throw insertError;
   }
}