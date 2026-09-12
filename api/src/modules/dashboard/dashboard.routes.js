import { Router } from 'express';
import { upsertTenantFromSupabaseClaims } from '../../middleware/auth.middleware.js';
import { getStats } from './dashboard.controller.js';

const dashboardRouter = Router();
dashboardRouter.use(upsertTenantFromSupabaseClaims);
dashboardRouter.get('/stats', getStats);

export default dashboardRouter;
