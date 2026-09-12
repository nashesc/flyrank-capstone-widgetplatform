import express from 'express';
import path from 'node:path';
import { upsertTenantFromSupabaseClaims } from './middleware/auth.middleware.js';
import publicCors from './middleware/cors.middleware.js';
import widgetsRouter from './modules/widgets/widgets.routes.js';
import publicWidgetsRouter from './modules/widgets/widgets.public.routes.js';
import submissionsRouter from './modules/submissions/submissions.routes.js';
import dashboardRouter from './modules/dashboard/dashboard.routes.js';
import { notFoundToJson, mapErrorToJsonResponse } from './middleware/errorHandler.js';
import { serve } from 'inngest/express';
import { widgetInngest } from './inngest/client.js';
import { widgetFunctions } from './inngest/functions.js';
import { bundleDir, servedBundleFiles } from './widget-script/bundleVersions.js';

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
   app.use('/api/dashboard', dashboardRouter);
   app.use('/api/inngest', serve({ client: widgetInngest, functions: widgetFunctions }));
   for (const bundleFileName of servedBundleFiles) {
     app.get(`/${bundleFileName}`, publicCors, (req, res) => {
     res.set('Cache-Control', 'public, max-age=31536000, immutable');
     res.set('Content-Type', 'application/javascript');
     res.sendFile(path.join(bundleDir, bundleFileName));
     });
   }
   app.use(notFoundToJson);
   app.use(mapErrorToJsonResponse);
   return app;
}