import './load-server-env.mjs';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { handler as converse } from '../api/voice-chat.js';
import { handler as feedback } from '../api/speaking-feedback.js';
import { conversationMemory } from '../shared/conversationMemory.js';

// Real providers only. No fetch substitution, speech synthesis fixtures, or fake
// camera observations. Text turns below are engineering test inputs, not speech.
const folder='docs/daily-conversation-2026-11-01';
await fs.mkdir(folder,{recursive:true});
const report={scope:'Real DeepSeek text conversation and transcript feedback; no physical audio/video acceptance',status:'RUNNING',traces:[],checks:{},physicalMicrophone:'NOT VERIFIED',physicalCameraMotion:'NOT VERIFIED'};
const persist=()=>fs.writeFile(`${folder}/real-model.json`,JSON.stringify(report,null,2));
const prompts=[
 'I prefer mint tea because coffee keeps me awake. My friend Maya lives in Suzhou, and we usually meet on Fridays.',
 'We are planning a train trip to the coast, and our budget is 800 yuan each. What would you prioritize?',
 'I prefer quiet places to crowded attractions. Do you think that makes a trip less interesting?',
 'Why do some people enjoy a very full travel schedule?',
 'I would rather leave room for surprises. Do you agree?',
 'Actually, can we talk about sketching? I started drawing old buildings last month.',
 'Give me a simple exercise I could try at a railway station.',
 'I tend to rush the details. How would you approach it differently?',
 'Yes, that sounds manageable.',
 'What do you find interesting about old stations compared with airports?',
 'My friend has changed her plans: Maya now lives in Hangzhou, not Suzhou.',
 'I might visit her before the trip. What could we do on a rainy afternoon?',
 'I am also trying to cook more at home. Can you suggest a simple meal for two?',
 'Would you use fresh or dried herbs, and why?',
 'We disagree about spicy food. I like it, but she prefers mild food.',
 'The café order is finished, but I would like to keep chatting about everyday routines.',
 'I have started walking before breakfast. What do you think makes a new habit stick?',
 'My schedule changes a lot, so a fixed time is difficult.',
 'Could a short routine work better than a strict schedule?',
 'Who did I say I usually meet, and on which day?',
 'Where does Maya live now? Please use the most recent information I gave you.',
 'What drink did I say I prefer, and why do I avoid coffee?',
 'What is our budget per person for the train trip?',
 'We still have time to chat. Which of our ideas would you try first, and why?',
];
const response=()=>({code:200,chunks:[],value:null,setHeader(){},flushHeaders(){},on(){},write(text){this.chunks.push(text);},end(){},status(code){this.code=code;return this;},json(value){this.value=value;return this;}});
const sessionId=randomUUID(),history=[];
try {
 if(!process.env.DEEPSEEK_API_KEY)throw new Error('DEEPSEEK_API_KEY is not configured');
 const feedbackOnly=process.argv.includes('--feedback-only');
 if(feedbackOnly){const previous=JSON.parse(await fs.readFile(`${folder}/real-model.json`,'utf8'));report.traces=previous.traces;for(const trace of report.traces)history.push({role:'user',content:trace.userText},{role:'ai',content:trace.reply});report.previousFeedbackSummary=previous.feedback?.summary;}
 for(const [index,userText] of (feedbackOnly?[]:prompts).entries()){
  const memory=conversationMemory(history,userText),res=response(),started=performance.now();
  await converse({method:'POST',body:{action:'conversation_stream',sessionId,turnId:`turn-${index+1}`,scenario:{id:'cafe'},sceneCueId:'menu',history:memory.recent,memorySummary:memory.summary,userText}},res);
  const event=res.chunks.join('').split('\n\n').find(value=>value.startsWith('event: done'));
  if(res.code!==200||!event)throw new Error(`Provider turn ${index+1} failed: ${res.value?.code||res.code}`);
  const result=JSON.parse(event.split('\ndata: ')[1]);
  if(/fixture|mock/i.test(result.model||''))throw new Error('Fixture response refused');
  report.traces.push({turn:index+1,userText,reply:result.reply,model:result.model,usage:result.usage,firstTokenMs:result.firstTokenMs,completionMs:result.totalMs,wallMs:Math.round(performance.now()-started),summaryUsed:Boolean(memory.summary)});
  history.push({role:'user',content:userText},{role:'ai',content:result.reply});
  await persist();console.log(`Real turn ${index+1}/24: ${result.reply}`);
 }
 const reply=index=>report.traces[index-1].reply;
 report.checks={completedTurns:report.traces.length,
  remembersPersonAndDay:/Maya/i.test(reply(20))&&/Friday/i.test(reply(20)),
  respectsCorrection:/Hangzhou/i.test(reply(21)),
  remembersDrink:/mint/i.test(reply(22))&&/awake|sleep|caffeine/i.test(reply(22)),
  remembersBudget:/800/.test(reply(23)),
  usesLongHistorySummary:report.traces.some(trace=>trace.summaryUsed),
  continuesPastOpeningTask:report.traces.slice(15).every(trace=>trace.reply.trim()),
  repliesWithoutQuestion:report.traces.filter(trace=>!trace.reply.trim().endsWith('?')).length,
  stockPraiseCount:report.traces.filter(trace=>/^(that's interesting|that's a great answer|can you tell me more)/i.test(trace.reply.trim())).length,
 };
 const res=response();
 await feedback({method:'POST',body:{attempt:{id:sessionId,track:'daily',taskId:'daily-cafe',title:'Real model conversation test',answers:prompts.map((text,index)=>({questionIndex:index,turnId:`turn-${index+1}`,text,prompt:index?reply(index):'Welcome to the café.',inputMode:'text'})),turns:history,context:{scenario:'cafe',cue:'menu'}}}},res);
 report.feedback={httpStatus:res.code,...(res.code===200?res.value:{code:res.value?.code,error:res.value?.error})};
 const samples=key=>report.traces.map(trace=>trace[key]).filter(Number.isFinite).sort((a,b)=>a-b);
 report.latency=Object.fromEntries(['firstTokenMs','completionMs'].map(key=>{const values=samples(key);return[key,{median:values[Math.floor(values.length/2)],p95:values[Math.min(values.length-1,Math.floor(values.length*.95))]}];}));
 report.status=Object.entries(report.checks).filter(([key])=>/^remembers|respects/.test(key)).every(([,value])=>value)&&res.code===200?'PASS — real text chain; human naturalness review still needed':'REVIEW REQUIRED';
 await persist();console.log(JSON.stringify({status:report.status,checks:report.checks,latency:report.latency,feedbackStatus:res.code}));
} catch(error){report.status='FAILED';report.error=String(error.message);await persist();console.error(report.error);process.exitCode=1;}
