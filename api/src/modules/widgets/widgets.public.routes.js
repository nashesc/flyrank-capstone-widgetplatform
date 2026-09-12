import { Router } from 'express';
import publicCors from '../../middleware/cors.middleware.js';
import { widgetIdParamSchema } from './widgets.schema.js';
import { findPublicWidgetConfig } from './widgets.repository.js';

const publicWidgetsRouter = Router();

publicWidgetsRouter.use('/:id/config', publicCors);

publicWidgetsRouter.get('/:id/config', async (req, res) => {
  if (!widgetIdParamSchema.safeParse(req.params.id).success) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
  }
  const widgetRow = await findPublicWidgetConfig({ widgetId: req.params.id });
  if (!widgetRow) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Widget not found' } });
  }
   const configEtag = `"${widgetRow.config_version}"`;
   res.set('ETag', configEtag);
   res.set('Cache-Control', 'public, max-age=30');
   if (req.headers['if-none-match'] === configEtag) {
      return res.status(304).end();
   }
   const { config_version: _omitted, ...publicConfig } = widgetRow;
   res.json(publicConfig);
});

export default publicWidgetsRouter;