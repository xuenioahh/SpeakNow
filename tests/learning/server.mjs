// Explicit engineering fixture server. Never used by npm run dev or deployed APIs.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.FORCE_LOCAL_DATA='true';process.env.SPEAKNOW_DATA_DIR=await fs.mkdtemp(path.join(os.tmpdir(),'speaknow-learning-browser-'));
process.env.BACKEND_PORT='8794';process.env.SPEAKNOW_ORIGIN='http://127.0.0.1:5194';process.env.OPENAI_API_KEY='fixture-only-not-a-key';process.env.LLM_PROVIDER='openai';
process.env.SPEAKNOW_AI_DAILY_TOKEN_BUDGET='10000000';process.env.SPEAKNOW_AI_GLOBAL_TOKEN_BUDGET='100000000';
globalThis.fetch=async(url,options)=>{
  if(!String(url).endsWith('/chat/completions'))throw new Error('Fixture server refuses external network');
  const request=JSON.parse(options.body),input=request.messages[1].content;
  let parsed;
  if(request.messages[0].content.includes('TRANSCRIPT ONLY')) {const {attempt}=JSON.parse(input);parsed={summary:'Engineering fixture: your answer gives a clear reason.',strengths:['Engineering fixture: a relevant example.'],improvements:[{answerIndex:0,quote:attempt.answers[0].text.slice(0,25),reason:'Engineering fixture: expand this idea.',suggestion:'Add one concrete example.',exercise:'Give a specific example related to this answer.'}]};}
  else parsed={reply:'Engineering fixture: would you like a small or large coffee?',feedback:{grammar:'',vocabulary:'',pronunciation:'',task:'Engineering fixture only.'}};
  return {ok:true,json:async()=>({model:'engineering-fixture',choices:[{message:{content:JSON.stringify(parsed)}}]})};
};
await import('../../backend/server.js');
