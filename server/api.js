// One deployed function preserves the existing API URLs on Vercel Hobby.
// Every request still passes through its original authentication and quotas.
const handlers = Object.freeze({
  'admin-track': () => import('../api/admin-track.js'),
  'dynamic-tts': () => import('../api/dynamic-tts.js'),
  'exam-examiner': () => import('../api/exam-examiner.js'),
  'expression-review': () => import('../api/expression-review.js'),
  'expression-service': () => import('../api/expression-service.js'),
  'learning-dashboard': () => import('../api/learning-dashboard.js'),
  'local-data': () => import('../api/local-data.js'),
  'local-transcription': () => import('../api/local-transcription.js'),
  membership: () => import('../api/membership.js'),
  'presentation-analysis': () => import('../api/presentation-analysis.js'),
  'presentation-impact': () => import('../api/presentation-impact.js'),
  'presentation-media': () => import('../api/presentation-media.js'),
  'presentation-pause-feedback': () => import('../api/presentation-pause-feedback.js'),
  'presentation-practice': () => import('../api/presentation-practice.js'),
  'presentation-report': () => import('../api/presentation-report.js'),
  'question-bank': () => import('../api/question-bank.js'),
  'speaking-audio': () => import('../api/speaking-audio.js'),
  'speaking-feedback': () => import('../api/speaking-feedback.js'),
  'speaking-practice': () => import('../api/speaking-practice.js'),
  'voice-capabilities': () => import('../api/voice-capabilities.js'),
  'voice-chat': () => import('../api/voice-chat.js'),
});

export const config = { maxDuration: 120, api: { bodyParser: { sizeLimit: '6mb' } } };

export function resolveApiRoute(url, query = {}) {
  const parsed = new URL(url || '/', 'http://localhost');
  const requested = parsed.pathname.startsWith('/api/') ? parsed.pathname.slice(5) : parsed.searchParams.get('__speaknow_route') || query.__speaknow_route || '';
  if (typeof requested !== 'string') return null;
  const name = requested.replace(/\.js$/, '');
  if (!Object.hasOwn(handlers, name)) return null;
  parsed.searchParams.delete('__speaknow_route');
  return { name, url: `/api/${name}${parsed.search}`, query: Object.fromEntries(parsed.searchParams) };
}

export default async function api(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const route = resolveApiRoute(req.url, req.query);
  if (!route) return res.status(404).json({ error: 'API route not found' });
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  req.url = route.url;
  req.query = route.query;
  try {
    const { default: handler } = await handlers[route.name]();
    return await handler(req, res);
  } catch (error) {
    console.error('API request failed:', route.name, error.message);
    if (!res.headersSent) return res.status(error.status || 503).json({ error: error.status ? error.message : 'Service unavailable. Your work is kept; retry shortly.', code: error.code || 'service_unavailable' });
    res.end();
  }
}
