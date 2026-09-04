import { submissionEnvelopeSchema, idempotencyKeySchema } from './submissions.schema.js';
import { storeSubmission } from './submissions.service.js';

export async function createSubmission(req, res, next) {
   try {
      const parsedKey = idempotencyKeySchema.safeParse(req.headers['idempotency-key']);
      if (!parsedKey.success) {
         return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Missing or malformed Idempotency-Key' } });
      }
      const parsedBody = submissionEnvelopeSchema.safeParse(req.body);
      if (!parsedBody.success) {
         return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsedBody.error.errors[0]?.message ?? 'Invalid body' } });
      }
      const stored = await storeSubmission({
         widgetId: parsedBody.data.widgetId,
         submittedData: parsedBody.data.data,
         idempotencyKey: parsedKey.data,
         visitorIp: req.ip ?? null,
      });
      if (stored.outcome === 'WIDGET_NOT_FOUND') {
         return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
      }
      if (stored.outcome === 'PAYLOAD_INVALID') {
         return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: stored.validationError } });
      }
      if (stored.outcome === 'IDEMPOTENT_REPLAY') {
         return res.status(200).json(stored.submissionRow);
      }
      if (stored.outcome === 'SPAM_DROPPED') {
         return res.status(200).json({ ok: true });
      }
      return res.status(201).json(stored.submissionRow);
   } catch (controllerError) {
      next(controllerError)
   }
}