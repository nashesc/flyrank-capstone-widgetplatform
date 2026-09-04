import express from 'express';
import { upsertTenantFromSupabaseClaims } from './middleware/auth.middleware.js';
import widgetsRouter from './modules/widgets/widgets.routes.js';

export function createApp() {
   const app = express();
   app.use(express.json());
   app.get('/health', (req, res) => res.json({ status: 'ok' }));
   app.get('/api/me', upsertTenantFromSupabaseClaims, (req, res) =>
      res.json({ tenantId: req.tenantId, supabaseUserId: req.supabaseUserId })
   );
   app.use('/api/widgets', widgetsRouter);
   return app;
}