import fs from 'node:fs/promises';
import {handler} from '../api/voice-chat.js';

// Calls the production handler and real provider. No fixture imports or fetch
// substitution. This checks model conversation, not a physical speech chain.
try {for(const line of (await fs.readFile('.env','utf8')).split('\n')){const match=line.match(/^(DEEPSEEK_[A-Z_]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2].trim().replace(/^['"]|['"]$/g,'');}}catch{}
const folder='docs/daily-core-2026-10-26';await fs.mkdir(folder,{recursive:true});
if(!process.env.DEEPSEEK_API_KEY){await fs.writeFile(folder+'/real-model.json',JSON.stringify({status:'NOT RUN',reason:'DEEPSEEK_API_KEY is not configured',physicalSpeech:'NOT RUN'},null,2));console.error('NOT RUN: DEEPSEEK_API_KEY is not configured. No fake responses were generated.');process.exit(2);}
const prompts=[
 'I actually prefer tea because coffee makes me nervous. What would you recommend?',
 'Something without much caffeine.', 'Why do some teas taste bitter?', 'I usually drink it with my friend Maya on Sundays.',
 'What do you like about quiet cafés?', 'Yes.', 'Actually I am planning a train trip to the coast.',
 'Would you rather visit the coast or the mountains, and why?', 'What would you bring for a rainy day?',
 'Do you remember who I usually have tea with?', 'We might invite her brother Leo too.',
 'How could we choose a place everyone enjoys?', 'I have been learning to sketch buildings.',
 'Can you suggest a simple sketching exercise?', 'I need a moment to think.', 'I like that idea.',
 'What drink did I say I preferred, and why?', 'Maybe I will sketch the station before we leave.',
 'The order is sorted, but I would like to keep chatting about travel.', 'What do you find interesting about train stations?',
];
const traces=[];
for(const [scene,cue,turns] of [['cafe','menu',prompts],['university','plan',prompts.slice(0,7)],['cafe','pastry',prompts.slice(13)]]){
 const history=[];
 for(const [index,userText] of turns.entries()){
  let status=200,body='';const started=performance.now();
  const response={status(code){status=code;return this;},json(value){body=JSON.stringify(value);},setHeader(){},flushHeaders(){},on(){},write(chunk){body+=chunk;},end(){}};
  await handler({method:'POST',body:{action:'conversation_stream',scenario:{id:scene},sceneCueId:cue,history,userText},on(){}},response);
  const done=body.split('\n\n').find(event=>event.startsWith('event: done'));
  if(status!==200||!done)throw new Error(`Real model failed (${status}): ${body.slice(0,300)}`);
  const result=JSON.parse(done.split('\ndata: ')[1]);
  if(/fixture|mock/i.test(result.model||'')||/Engineering fixture/.test(result.reply))throw new Error('Fixture result refused');
  traces.push({scene,cue,turn:index+1,userText,reply:result.reply,model:result.model,firstTokenMs:result.firstTokenMs,totalMs:performance.now()-started});
  history.push({role:'user',content:userText},{role:'ai',content:result.reply});
  await fs.writeFile(folder+'/real-model.json',JSON.stringify({status:'RUNNING',traces,physicalSpeech:'NOT RUN'},null,2));
  console.log(`${scene}/${cue} turn ${index+1}: ${result.reply}`);
 }
}
await fs.writeFile(folder+'/real-model.json',JSON.stringify({status:'MODEL TEXT CHAIN COMPLETED — human naturalness review required',traces,physicalSpeech:'NOT RUN'},null,2));
