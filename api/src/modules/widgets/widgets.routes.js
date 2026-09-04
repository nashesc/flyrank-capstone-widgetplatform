import { Router } from 'express';
import { upsertTenantFromSupabaseClaims } from '../../middleware/auth.middleware.js';
import { createWidget, listWidgets, getWidget, patchWidget, deleteWidget, getWidgetEmbed } from './widgets.controller.js';

const widgetsRouter = Router();
widgetsRouter.use(upsertTenantFromSupabaseClaims);
widgetsRouter.post('/', createWidget);
widgetsRouter.get('/', listWidgets);
widgetsRouter.get('/:id', getWidget);
widgetsRouter.patch('/:id', patchWidget);
widgetsRouter.delete('/:id', deleteWidget);
widgetsRouter.get('/:id/embed', getWidgetEmbed);

export default widgetsRouter;