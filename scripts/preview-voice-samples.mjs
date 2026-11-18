// Creates only three review samples. Never generates the full catalog.
import './load-server-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixedAudioCatalog } from './fixed-audio-catalog.mjs';

const key = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;
const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5';
if (!key || !voiceId) {
  console.log(JSON.stringify({ provider: 'elevenlabs', configured: false, samplesGenerated: 0, required: ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'] }));
  process.exitCode = 1;
} else {
  const headers = { 'xi-api-key': key };
  const [modelsResponse, voiceResponse] = await Promise.all([
    fetch('https://api.elevenlabs.io/v1/models', { headers, signal: AbortSignal.timeout(10000) }),
    fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, { headers, signal: AbortSignal.timeout(10000) }),
  ]);
  if (!modelsResponse.ok || !voiceResponse.ok) throw new Error(`ElevenLabs model/voice check failed (${modelsResponse.status}/${voiceResponse.status}); no samples generated.`);
  const models = await modelsResponse.json();
  const voice = await voiceResponse.json();
  if (!Array.isArray(models) || !models.some(model => model.model_id === modelId && model.can_do_text_to_speech) || voice.voice_id !== voiceId) throw new Error('Selected ElevenLabs model or voice is unavailable; no samples generated.');
  const catalog = fixedAudioCatalog();
  const samples = [catalog.find(item => item.type === 'repeat'), catalog.find(item => item.type === 'interview'), catalog.find(item => item.type === 'daily-opening')].filter(Boolean);
  const directory = path.resolve('audio-review');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const priorManifest = await fs.readFile(path.join(directory, 'manifest.json'), 'utf8').then(JSON.parse).catch(() => ({ samples: [] }));
  const manifest = [];
  let generatedNow = 0, charactersSent = 0;
  const saveManifest = () => fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), samples: manifest }, null, 2));
  for (const item of samples) {
    const filename = `${item.audioId}.mp3`;
    const destination = path.join(directory, filename);
    const prior = await fs.stat(destination).catch(() => null);
    if (prior) {
      const metadata = priorManifest.samples?.find(saved => saved.audioId === item.audioId);
      if (!prior.isFile() || prior.size < 1000 || metadata?.textHash !== item.textHash || metadata?.model !== modelId || metadata?.voiceId !== voiceId) throw new Error(`Existing sample ${filename} cannot be safely reused; review it before retrying.`);
      manifest.push({ ...item, text: undefined, provider: 'elevenlabs', model: modelId, voiceId, file: filename, bytes: prior.size, generationStatus: 'sample-review', version: 1 });
      continue;
    }
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ text: item.text, model_id: modelId }),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('audio/')) throw new Error(`ElevenLabs sample generation failed (${response.status}); remaining samples were not requested.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000) throw new Error('ElevenLabs returned an empty or invalid sample.');
    await fs.writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
    generatedNow += 1; charactersSent += item.text.length;
    manifest.push({ ...item, text: undefined, provider: 'elevenlabs', model: modelId, voiceId, file: filename, bytes: bytes.length, generationStatus: 'sample-review', version: 1 });
    await saveManifest();
  }
  console.log(JSON.stringify({ provider: 'elevenlabs', model: modelId, voice: voice.name, samplesAvailable: manifest.length, samplesGeneratedNow: generatedNow, charactersSent, reviewDirectory: directory }));
}
