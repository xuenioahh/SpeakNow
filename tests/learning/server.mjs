// Explicit engineering fixture server. Never used by npm run dev or deployed APIs.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.VITE_ADMIN_EMAILS = 'speech-admin-fixture@example.invalid';
process.env.SPEAKNOW_TRIAL_MINUTE_REQUESTS='1000';process.env.SPEAKNOW_TRIAL_DAILY_REQUESTS='10000';process.env.SPEAKNOW_AI_MINUTE_REQUESTS='1000';process.env.SPEAKNOW_ENGINEERING_FIXTURE='true';process.env.FORCE_LOCAL_DATA='true';process.env.SPEAKNOW_DATA_DIR=await fs.mkdtemp(path.join(os.tmpdir(),'speaknow-learning-browser-'));
process.env.BACKEND_PORT=process.env.BACKEND_PORT || '8794';process.env.SPEAKNOW_ORIGIN=process.env.SPEAKNOW_ORIGIN || 'http://127.0.0.1:5194';process.env.OPENAI_API_KEY='fixture-only-not-a-key';process.env.LLM_PROVIDER='openai';
process.env.DEEPSEEK_API_KEY='fixture-only-not-a-key';
if (process.env.SPEAKNOW_TEST_TTS === '1') { process.env.SPEAKNOW_DYNAMIC_TTS = 'elevenlabs'; process.env.ELEVENLABS_API_KEY = 'fixture-only-not-a-key'; process.env.ELEVENLABS_VOICE_ID = 'fixture-voice'; }
process.env.SPEAKNOW_AI_DAILY_TOKEN_BUDGET='10000000';process.env.SPEAKNOW_AI_GLOBAL_TOKEN_BUDGET='100000000';
process.env.DEEPSEEK_API_KEY='fixture-only-not-a-key';
globalThis.fetch=async(url,options)=>{
  if (process.env.SPEAKNOW_TEST_TTS === '1' && String(url).includes('/text-to-speech/')) {
    const bytes = new Uint8Array((await fs.readFile(path.resolve('public/profile-bgm-139.mp3'))).subarray(0, 80000));
    return { ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, body: new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 16000)); controller.enqueue(bytes.subarray(16000)); controller.close(); } }) };
  }
  if(!String(url).endsWith('/chat/completions'))throw new Error('Fixture server refuses external network');
  const request=JSON.parse(options.body),input=request.messages[1].content;
  if (request.stream) {
    const reply = 'Engineering fixture: would you like a small or large coffee?';
    const encoder = new TextEncoder();
    const events = [
      {choices:[{delta:{content:reply.slice(0,24)}}]},
      {choices:[{delta:{content:reply.slice(24)},finish_reason:'stop'}]},
      {usage:{prompt_tokens:10,completion_tokens:12}},
    ].map(value=>`data: ${JSON.stringify(value)}\n\n`).join('')+'data: [DONE]\n\n';
    return {ok:true,body:new ReadableStream({start(controller){controller.enqueue(encoder.encode(events));controller.close();}})};
  }
  let parsed;
  if(request.messages[0].content.includes('IELTS speaking examiner')) parsed={transition:'Let us continue.'};
  else if(request.messages[0].content.includes('Review one learner turn')) parsed={relevance:'Engineering fixture only: the reply addresses the café request.',grammar:'',vocabulary:''};
  else if(request.messages[0].content.includes('TRANSCRIPT ONLY')) {const {attempt}=JSON.parse(input);parsed={summary:'Engineering fixture: your answer gives a clear reason.',strengths:['Engineering fixture: a relevant example.'],improvements:[{answerIndex:0,quote:attempt.answers[0].text.slice(0,25),reason:'Engineering fixture: expand this idea.',suggestion:'Add one concrete example.',exercise:'Give a specific example related to this answer.'}]};}
  if(parsed?.summary){
    const {attempt}=JSON.parse(input),index=attempt.answers.findIndex(answer=>answer.text.trim());
    parsed.dimensions=Object.fromEntries(['coherence','lexical','grammar'].map(key=>[key,{observation:'Engineering fixture: transcript evidence only.',answerIndex:index,quote:attempt.answers[index].text.slice(0,25),suggestion:'Give a concrete example.'}]));
    const parts=[...new Set(attempt.answers.map(answer=>answer.part).filter(Boolean))];
    parsed.parts=parts.map(part=>{const answerIndex=attempt.answers.findIndex(answer=>answer.part===part&&answer.text.trim());return {part,summary:`Engineering fixture: Part ${part} transcript review.`,answerIndex,quote:attempt.answers[answerIndex]?.text.slice(0,25)||''};});
  }
  if(!parsed) parsed={reply:'Engineering fixture: would you like a small or large coffee?',feedback:{grammar:'',vocabulary:'',pronunciation:'',task:'Engineering fixture only.'}};
  return {ok:true,json:async()=>({model:'engineering-fixture',choices:[{message:{content:JSON.stringify(parsed)}}]})};
};
await import('../../backend/server.js');
