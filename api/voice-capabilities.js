export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const enabled = process.env.SPEAKNOW_DYNAMIC_TTS === 'elevenlabs' && Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ dynamicTts: enabled ? 'elevenlabs' : 'browser', model: enabled ? process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5' : null, transcription: localTranscriptionAvailable() ? 'local' : 'browser' });
}
import { localTranscriptionAvailable } from './_localTranscription.js';
