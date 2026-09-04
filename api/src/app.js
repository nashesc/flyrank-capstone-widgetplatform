import express from 'express';
import { upsertTenantFromSupabaseClaims } from './middleware/auth.middleware.js';

export function createApp() {
   const app = express();
   app.get('/health', (req, res) => res.json({ status: 'ok' }));

   app.get('/api/me', upsertTenantFromSupabaseClaims, (req, res) =>
      res.json({ 
         tenantId: req.tenantId, 
         supabaseUserId: req.supabaseUserId
      })
   );
   return app;
}