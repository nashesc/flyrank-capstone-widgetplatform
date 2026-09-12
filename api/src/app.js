import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upsertTenantFromSupabaseClaims } from './middleware/auth.middleware.js';
import publicCors from './middleware/cors.middleware.js';
import widgetsRouter from './modules/widgets/widgets.routes.js';
import publicWidgetsRouter from './modules/widgets/widgets.public.routes.js';
import submissionsRouter from './modules/submissions/submissions.routes.js';
import { notFoundToJson, mapErrorToJsonResponse } from './middleware/errorHandler.js';
import { serve } from 'inngest/express';
import { widgetInngest } from './inngest/client.js';
import { widgetFunctions } from './inngest/functions.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
   const app = express();
   app.use(express.json({ limit: '20kb' }));
   app.get('/health', (req, res) => res.json({ status: 'ok' }));
   app.get('/api/me', upsertTenantFromSupabaseClaims, (req, res) =>
      res.json({ tenantId: req.tenantId, supabaseUserId: req.supabaseUserId })
   );
   app.use('/api/widgets', publicWidgetsRouter);
   app.use('/api/widgets', widgetsRouter);
   app.use('/api/submissions', submissionsRouter);
   app.use('/api/inngest', serve({ client: widgetInngest, functions: widgetFunctions }));
   app.get('/widget.v1.js', publicCors, (req, res) => {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.set('Content-Type', 'application/javascript');
      res.sendFile(path.join(currentDir, 'widget-script', 'dist', 'widget.v1.js'));
   });
   app.use(notFoundToJson);
   app.use(mapErrorToJsonResponse);
   return app;
}