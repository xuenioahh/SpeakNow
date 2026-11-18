// Real provider, synthetic learner text, no account/database writes or audio upload.
import './load-server-env.mjs';
import fs from 'node:fs/promises';
const { handler } = await import('../api/voice-chat.js');
const output='docs/optimization-2026-11-08/real-conversation.json';
const prompts=[
 'I prefer tea because coffee makes me nervous. What would you recommend?',
 'Something without much caffeine, please.',
 'I usually drink tea with my friend Maya on Sundays.',
 'Actually, can we talk about a train trip to the coast instead?',
 'I want to sketch buildings there. What should I bring?',
 'What could I do if it rains all day?',
 'Maya cannot join this time; my brother Leo will come instead.',
 'Who is coming with me now, and who cannot come?',
 'What drink did I say I preferred, and why?',
 'The order is sorted, but I would like to keep chatting about travel. What interests you about old train stations?'
];
const history=[],traces=[];
if(!process.env.DEEPSEEK_API_KEY) throw Error('Missing DEEPSEEK_API_KEY');
for(const [index,userText] of prompts.entries()) {
 let status=200,body='';
 await handler({method:'POST',body:{action:'conversation_stream',scenario:{id:'cafe'},sceneCueId:'menu',history,userText},on(){}}, {
  status(code){status=code;return this;},json(value){body=JSON.stringify(value);},setHeader(){},flushHeaders(){},on(){},write(chunk){body+=chunk;},end(){}
 });
 const event=body.split('\n\n').find(item=>item.startsWith('event: done'));
 if(status!==200||!event){await fs.writeFile(output,JSON.stringify({category:'real API integration',status:'failed',turn:index+1,httpStatus:status,traces},null,2));throw Error(`Real conversation failed at turn ${index+1}, HTTP ${status}`);}
 const value=JSON.parse(event.split('\ndata: ')[1]);
 traces.push({turn:index+1,userText,...value});
 history.push({role:'user',content:userText},{role:'ai',content:value.reply});
 await fs.writeFile(output,JSON.stringify({category:'real API integration',status:index===9?'completed; requires contextual review':'running',physicalDevices:'not tested',traces},null,2));
 console.log(`Real provider turn ${index+1} completed`);
}
