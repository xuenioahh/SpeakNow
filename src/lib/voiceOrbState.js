// UI adaptation only. These states do not change API/session data.
export function resolveVoiceOrbState({ status = undefined, inputState = 'idle', isAiThinking = false, isSpeaking = false, completed = false, hasError = false } = {}) {
  if (status) return ({ requesting_permission: 'idle', starting: 'idle', stopping: 'processing', finalizing: 'processing', submitting: 'processing' })[status] || status;
  if (completed) return 'completed';
  if (inputState === 'listening') return 'listening';
  if (isAiThinking) return 'processing';
  if (isSpeaking) return 'speaking';
  if (inputState === 'error' || hasError) return 'error';
  return 'idle';
}

// Older implementations silently ignore start(track). Only enable the shared
// path for the desktop Chromium implementations documented to accept it.
// Safari/Android/iOS retain native recognition without a parallel meter capture.
// https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json
export function supportsRecognitionAudioTrack(userAgent = '') {
  if (/Android|Mobile|iPhone|iPad|iPod|CriOS|EdgiOS/i.test(userAgent)) return false;
  const major = Number(userAgent.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1]);
  return Number.isFinite(major) && major >= 135;
}
