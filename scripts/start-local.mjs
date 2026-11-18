import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://localhost:5173';
const runtime = path.join(root, '.cache', 'local-launcher');
fs.mkdirSync(runtime, { recursive: true });
const stateFile = path.join(runtime, 'process.json');
const logFile = path.join(runtime, 'server.log');

async function ready() {
  try {
    const [home, api] = await Promise.all([
      fetch(origin, { signal: AbortSignal.timeout(1500) }),
      fetch(`${origin}/api/voice-capabilities`, { signal: AbortSignal.timeout(1500) }),
    ]);
    return home.ok && /SpeakNow/i.test(await home.text()) && api.ok && (await api.json()).dynamicTts === 'browser';
  } catch { return false; }
}

let state;
try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); process.kill(state.pid, 0); }
catch { state = null; }
if (!state) {
  const env = {
    ...process.env,
    FORCE_LOCAL_DATA: 'true',
    SPEAKNOW_DATA_DIR: path.join(root, 'data'),
    SPEAKNOW_ORIGIN: origin,
    BACKEND_PORT: '8787',
    BACKEND_HOST: '127.0.0.1',
    LLM_PROVIDER: 'deepseek',
    SPEAKNOW_LOCAL_ASR: 'true',
    SPEAKNOW_DYNAMIC_TTS: 'browser',
    SPEAKNOW_PAYWALL_ENABLED: 'false',
    SPEAKNOW_MEMBERSHIP_TEST_MODE: 'false',
    SPEAKNOW_ENGINEERING_FIXTURE: 'false',
    PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ''}`,
  };
  delete env.VERCEL;
  delete env.VERCEL_ENV;
  delete env.AWS_LAMBDA_FUNCTION_NAME;
  const log = fs.openSync(logFile, 'a', 0o600);
  const child = spawn(process.execPath, ['scripts/dev-with-backend.js'], {
    cwd: root, env, detached: true, stdio: ['ignore', log, log],
  });
  fs.closeSync(log);
  child.unref();
  fs.writeFileSync(stateFile, JSON.stringify({ pid: child.pid, root, origin, started: new Date().toISOString() }), { mode: 0o600 });
}

let healthy = false;
for (let attempt = 0; attempt < 60; attempt++) {
  if (await ready()) { healthy = true; break; }
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!healthy) {
  console.error(`SpeakNow 未能启动。日志：${logFile}\n检查 5173 和 8787 端口是否被其他程序占用。`);
  process.exitCode = 1;
} else {
  console.log(`SpeakNow 本地版已就绪：${origin}\n数据目录：${path.join(root, 'data')}\nAI 对话需要联网；请允许浏览器使用麦克风。`);
  if (!process.argv.includes('--no-open')) {
    const browser = spawn('open', ['-a', 'Google Chrome', origin], { stdio: 'ignore' });
    browser.on('error', () => console.log(`请手动打开 ${origin}`));
  }
}
