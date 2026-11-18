import { apiFetch } from './http';
import { conversationMemory } from '../../shared/conversationMemory.js';

/** @param {Record<string, unknown>} body @param {{ signal?: AbortSignal, onDelta?: (text: string) => void, onFeedback?: (feedback: any) => void }} [options] */
export async function conversationStream(body, { signal, onDelta, onFeedback } = {}) {
  const memory=conversationMemory(body.history,String(body.userText||''));
  body={...body,history:memory.recent,memorySummary:memory.summary};
  // One language review per complete learner turn; audio/video metrics remain
  // independent and are never inferred from transcript text.
  if(onFeedback)void apiFetch('/api/speaking-feedback', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, action: 'conversation_analysis' }),
  }).then(response => response.ok ? response.json() : null).then(value => { if (!signal?.aborted && value?.feedback) onFeedback?.(value.feedback); }).catch(() => null);
  const response = await apiFetch('/api/speaking-feedback', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ ...body, action: 'conversation_stream' }),
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw Object.assign(new Error(value.error || `AI request failed (${response.status}). Your reply is kept.`), { status: response.status, code: value.code });
  }
  if (!response.body) throw new Error('The AI stream is unavailable. Your reply is kept.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', result = null, streamError = null;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const kind = event.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim();
        const raw = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
        if (!raw) continue;
        let value;
        try { value = JSON.parse(raw); } catch { throw new Error('The AI stream returned invalid data. Your reply is kept.'); }
        if (kind === 'delta' && typeof value.text === 'string') onDelta?.(value.text);
        if (kind === 'done') result = value;
        if (kind === 'error') streamError = Object.assign(new Error(value.message || 'AI reply unavailable. Your words are kept.'), { code: value.code, status: value.status, retryable: value.retryable });
      }
    }
    if (streamError) throw streamError;
    if (!result || typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('The AI stream ended without a complete reply. Your words are kept.');
    return result;
  } finally { reader.releaseLock(); }
}
