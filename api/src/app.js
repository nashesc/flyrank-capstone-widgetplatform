import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upsertTenantFromSupabaseClaims } from './middleware/auth.middleware.js';
import publicCors from './middleware/cors.middleware.js';
import widgetsRouter from './modules/widgets/widgets.routes.js';
import publicWidgetsRouter from './modules/widgets/widgets.public.routes.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
   const app = express();
   app.use(express.json());
   app.get('/health', (req, res) => res.json({ status: 'ok' }));
   app.get('/api/me', upsertTenantFromSupabaseClaims, (req, res) =>
      res.json({ tenantId: req.tenantId, supabaseUserId: req.supabaseUserId })
   );
   app.use('/api/widgets', publicWidgetsRouter);
   app.use('/api/widgets', widgetsRouter);
   app.get('/widget.v1.js', publicCors, (req, res) => {
   res.set('Cache-Control', 'public, max-age=31536000, immutable');
   res.set('Content-Type', 'application/javascript');
   res.sendFile(path.join(currentDir, 'widget-script', 'dist', 'widget.v1.js'));
   });
   return app;
}