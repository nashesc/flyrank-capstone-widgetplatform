import { createClient } from '@supabase/supabase-js';
import pool from '../db/pool.js';

const supabaseAuthClient = createClient(
   process.env.SUPABASE_URL,
   process.env.SUPABASE_ANON_KEY
);

export async function upsertTenantFromSupabaseClaims(req, res, next) {
   const authorizationHeader = req.headers.authorization;
   if (!authorizationHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' } });
   }

   const accessToken = authorizationHeader.slice('Bearer '.length).trim();
   if (!accessToken) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' } });
   }

   try {
      const { data: claimsResult, error: claimsError } = await supabaseAuthClient.auth.getClaims(accessToken)
      const supabaseUserId = claimsResult?.claims?.sub

      if (claimsError || !supabaseUserId) {
         return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
      }

      const tenantName = claimsResult.claims.email ?? null;
      const upsertedTenant = await pool.query(
         `INSERT INTO tenants (supabase_user_id, name)
         VALUES ($1, $2)
         ON CONFLICT (supabase_user_id) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
         [supabaseUserId, tenantName]
      )

      req.tenantId = upsertedTenant.rows[0].id;
      req.supabaseUserId = supabaseUserId;
      next();
   } catch {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
   }
}