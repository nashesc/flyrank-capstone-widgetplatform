export function notFoundToJson(req, res) {
   res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
}

export function mapErrorToJsonResponse(mappedError, _req, res, _next) {
   if (mappedError?.type === 'entity.too.large' || mappedError?.code === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Body exceeds 20kb limit' } });
   }
   if (mappedError instanceof SyntaxError && 'body' in mappedError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' } });
   }
  if (mappedError?.status === 429) {
    return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
  }
  if (mappedError?.code === '22P02') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  }
   console.error(mappedError);
   res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } });
}