export function csrfToken() {
  return document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('speaknow_csrf='))?.slice('speaknow_csrf='.length) || '';
}
export function apiFetch(url, options = {}) {
  return fetch(url, { ...options, credentials: 'same-origin', headers: { ...options.headers, 'x-csrf-token': csrfToken() } });
}
export async function apiJson(url, body, options = {}) {
  const { timeoutMs = 60000, signal, headers = {}, ...fetchOptions } = options;
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timeoutError = Object.assign(new Error('Request timed out. Your work is kept; retry when ready.'), { code: 'request_timeout', retryable: true });
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  try {
    controller.signal.throwIfAborted();
    const response = await apiFetch(url, { method: 'POST', ...fetchOptions, signal: controller.signal, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let value;
    try { value = await response.json(); }
    catch {
      controller.signal.throwIfAborted();
      throw Object.assign(new Error('The server returned an invalid response. Your work is kept; retry the request.'), { status: response.status, code: 'invalid_api_response', retryable: true });
    }
    if (!response.ok) throw Object.assign(new Error(value?.error || `Request failed (${response.status})`), { status: response.status, code: value?.code, retryable: value?.retryable, resetsAt: value?.resetsAt });
    return value;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
