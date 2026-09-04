import cors from 'cors';

const publicCors = cors({
   origin: '*',
   allowedHeaders: ['Content-Type', 'Idempotency-Key'],
});

export default publicCors;