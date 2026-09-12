import { widgetInngest } from './client.js';
import pool from '../db/pool.js';

async function recordSideEffect({ submissionId, kind, status, errorMessage }) {
   await pool.query(
      `INSERT INTO side_effect_log (submission_id, kind, status, error)
      VALUES ($1,$2,$3,$4)`,
      [submissionId, kind, status, errorMessage ?? null]
   );
}

export const submissionConfirmedFn = widgetInngest.createFunction(
   {
      id: 'submission-confirmed',
      triggers: [{ event: 'submission/created' }],
      retries: 3,
      onFailure: async ({ event, error }) => {
         const failedEventData = event?.data ?? {};
         const originalEventData = failedEventData.event?.data ?? failedEventData;
         await recordSideEffect({
         submissionId: originalEventData.submissionId,
         kind: 'email',
         status: 'failed',
         errorMessage: error?.message ?? failedEventData.error?.message ?? 'unknown',
         });
      },
   },
   async ({ event }) => {
      if (process.env.EMAIL_FAIL === 'true') {
         throw new Error('EMAIL_FAIL forced failure');
      }
      await recordSideEffect({
         submissionId: event.data.submissionId, kind: 'email', status: 'sent',
      });
      return { ok: true };
   }
);

export const widgetFunctions = [submissionConfirmedFn];
