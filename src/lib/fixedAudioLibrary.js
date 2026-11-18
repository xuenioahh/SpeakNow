let manifestPromise;
const digest = async text => {
  const bytes = new TextEncoder().encode(text.trim().normalize('NFC'));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};
async function manifest() {
  manifestPromise ||= fetch('/fixed-audio/manifest.json', { cache: 'no-cache' }).then(async response => {
    if (!response.ok) throw new Error('Saved voice manifest unavailable');
    const value = await response.json();
    if (value.version !== 1 || !Array.isArray(value.entries)) throw new Error('Saved voice manifest invalid');
    return value.entries;
  }).catch(() => []);
  return manifestPromise;
}
export async function savedFixedAudio(audioId, text) {
  if (!audioId || !text || !globalThis.crypto?.subtle) return null;
  const entries = await manifest();
  const item = entries.find(entry => entry.audioId === audioId);
  if (!item || item.generationStatus !== 'ready' || item.provider !== 'elevenlabs' || !item.model || !item.voiceId || !Number.isFinite(item.duration) || item.duration <= 0 || !/^\/fixed-audio\/v\d+\/[a-zA-Z0-9-]+\.mp3$/.test(item.audioUrl)) return null;
  return item.textHash === await digest(text) ? item : null;
}
