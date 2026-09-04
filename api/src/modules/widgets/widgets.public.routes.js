import { Router } from 'express';
import publicCors from '../../middleware/cors.middleware.js';
import pool from '../../db/pool.js';

const publicWidgetsRouter = Router();
publicWidgetsRouter.use(publicCors);

publicWidgetsRouter.get('/:id/config', async (req, res) => {
   const found = await pool.query(
      `SELECT type, title, description, fields, button_text, display_options, config_version
      FROM widgets WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
   );
   const widgetRow = found.rows[0];
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