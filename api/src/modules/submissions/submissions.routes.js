import { Router } from 'express';
import publicCors from '../../middleware/cors.middleware.js';
import { submissionRateLimiter } from '../../middleware/rateLimit.middleware.js';
import { createSubmission } from './submissions.controller.js';

const submissionsRouter = Router();
submissionsRouter.use(publicCors);
submissionsRouter.post('/', submissionRateLimiter, createSubmission);
submissionsRouter.options('/', publicCors);

export default submissionsRouter;