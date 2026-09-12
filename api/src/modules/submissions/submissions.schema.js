import { z } from 'zod';

export const submissionEnvelopeSchema = z.object({
   widgetId: z.string().uuid(),
   data: z.record(z.unknown()),
}).strict();

export function buildSubmissionSchemaForWidget(widgetFields) {
   const shape = {};
   for (const fieldDef of widgetFields) {
      let fieldValidator;
      if (fieldDef.type === 'email') {
         fieldValidator = fieldDef.required
            ? z.string().email()
            : z.union([z.literal(''), z.string().email()]);
      }
      else if (fieldDef.type === 'checkbox') fieldValidator = z.boolean();
      else if (fieldDef.type === 'textarea') fieldValidator = z.string().max(fieldDef.maxLength ?? 5000);
      else fieldValidator = z.string().max(fieldDef.maxLength ?? 500);
      if (!fieldDef.required) fieldValidator = fieldValidator.optional();
      shape[fieldDef.name] = fieldValidator;
   }
   shape._hp = z.string().max(500).optional();
   return z.object(shape).strict();
}

export const idempotencyKeySchema = z.string().uuid();