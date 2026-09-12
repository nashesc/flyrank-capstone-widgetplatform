import pool from '../../db/pool.js';

export async function recordSideEffect({ submissionId, kind, status, errorMessage }) {
  await pool.query(
    `INSERT INTO side_effect_log (submission_id, kind, status, error)
     VALUES ($1,$2,$3,$4)`,
    [submissionId, kind, status, errorMessage ?? null]
  );
}

export async function recordEnqueueFailure({ submissionId, errorMessage }) {
  await recordSideEffect({ submissionId, kind: 'enqueue', status: 'failed', errorMessage });
}
