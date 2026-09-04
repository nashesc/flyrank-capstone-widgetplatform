import rateLimit from 'express-rate-limit';

export const submissionRateLimiter = rateLimit({
   windowMs: 60 * 1000,
   limit: 60,
   standardHeaders: 'draft-7',
   legacyHeaders: false,
   keyGenerator: (incomingRequest) => incomingRequest.ip,
   handler: (_req, res) => {
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
   },
});