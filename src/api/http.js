export function csrfToken() {
  return document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('speaknow_csrf='))?.slice('speaknow_csrf='.length) || '';
}
export function apiFetch(url, options = {}) {
  return fetch(url, { ...options, credentials: 'same-origin', headers: { ...options.headers, 'x-csrf-token': csrfToken() } });
}
export async function apiJson(url, body, options = {}) {
  const response = await apiFetch(url, { method: 'POST', ...options, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(value.error || `Request failed (${response.status})`), { status: response.status, code: value.code });
  return value;
}
