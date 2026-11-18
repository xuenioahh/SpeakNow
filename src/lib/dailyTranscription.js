import { apiFetch, apiJson } from '@/api/http';
import { learningStore } from './learningStore';

export async function prepareRecordedTranscription(capture, audioTake) {
    const response = await apiFetch('/api/voice-capabilities', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Voice capabilities unavailable');
    const capabilities = await response.json();
    if (capabilities.transcription === 'local') {
      capture.recordingOnly = true;
      capture.allowRecordingOnly = true;
      capture.transcribe = async ({ signal }) => {
        const id = await audioTake?.stop();
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const recording = id && await learningStore.get('recordings', id);
        if (!recording?.blob?.size) throw new Error('No audio was saved. Check your microphone and record again.');
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('Could not read your recording. Please retry.'));
          reader.readAsDataURL(recording.blob);
        });
        return apiJson('/api/local-transcription', { data }, { signal, timeoutMs: 100000 });
      };
    } else {
      capture.recordingOnly = false;
      capture.transcribe = null;
    }
}

export function attachDailyTranscription(session) {
  session.prepareCapture = () => prepareRecordedTranscription(session.capture, session.audioTake);
}
