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
   try {
      const submissionRow = await insertSubmission({
         widgetId, tenantId: widgetRow.tenant_id,
         validatedPayload: parsedPayload.data, idempotencyKey, visitorIp,
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