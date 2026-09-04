import { Router } from 'express';
import publicCors from '../../middleware/cors.middleware.js';
import { createSubmission } from './submissions.controller.js';

const submissionsRouter = Router();
submissionsRouter.use(publicCors);
submissionsRouter.post('/', createSubmission);
submissionsRouter.options('/', publicCors);

export default submissionsRouter;