import './load-server-env.mjs';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../api/_requestContext.js';
import { handler as feedback } from '../api/speaking-feedback.js';
import { handler as examiner } from '../api/exam-examiner.js';
import { handler as converse } from '../api/voice-chat.js';
import { getSpeakingTask, validateAttempt } from '../shared/speakingTasks.js';
import { estimateModelCost } from '../shared/usagePricing.js';
process.env.LLM_PROVIDER='deepseek';
delete process.env.SPEAKNOW_ENGINEERING_FIXTURE;
const folder='docs/pitch-cost-2026-11-05';
await fs.mkdir(folder,{recursive:true});
const old=await fs.readFile('scripts/check-comprehensive-live.mjs','utf8');
const ieltsTexts=Function('return '+old.slice(old.indexOf('const texts=')+12,old.indexOf('\n];',old.indexOf('const texts='))+2))();
const dailyTexts=['I would like a small cappuccino with oat milk, please.','Please make it iced without sugar. I will take it away.','Actually, I have a few minutes. What is a quiet place to sit nearby?','I usually meet my friend Maya on Fridays. We enjoy walking in the park.','We are planning a weekend train trip with a budget of eight hundred yuan each.','Can you remind me of our budget and suggest one affordable activity?'];
const toeflTexts=['I use the library most often because it is quiet and has reliable internet access. I usually go there after lunch to read course materials and work on programming assignments. The desks near the windows are my favourite because there is plenty of natural light. If I need a break, I can take a short walk outside and return without losing much time.', 'Last semester I worked with a classmate to prepare for a statistics exam. I understood the formulas but struggled to explain when to use them. My classmate suggested that we each teach one example to the other. That helped me notice gaps in my reasoning. We also checked each other’s calculations and finished our revision with a clearer understanding.', 'Universities should provide both, but I would prioritise quiet study spaces. Students who live in shared accommodation may have nowhere else to concentrate. Social spaces are useful for teamwork, but they can also be found in cafes and common rooms. A quiet library gives everyone fair access to an environment where they can read and solve difficult problems.', 'Online learning may reduce the need for large lecture halls, but it will not make campuses unnecessary. Students will still need laboratories, project rooms and places to meet their teachers. I think universities will create more flexible spaces that support both online meetings and practical collaboration. Students may visit less frequently but use campus facilities more deliberately.'];
const report={createdAt:new Date().toISOString(),scope:'3 engineering text sessions per module; actual production handlers and actual DeepSeek API. No physical microphone, ASR, TTS, infrastructure or invoice measurement.',priceSource:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',priceVerifiedAt:'2026-11-05',receipts:[],operations:[],sessions:[]};
let label;
const persist=()=>fs.writeFile(`${folder}/receipts.json`,JSON.stringify(report,null,2));
const originalFetch=globalThis.fetch;
globalThis.fetch=async(...args)=>{
 const response=await originalFetch(...args);
 if(String(args[0]).startsWith('https://api.deepseek.com/')&&String(args[0]).includes('completions')){
  const raw=await response.clone().text();const objects=[];
  try{objects.push(JSON.parse(raw));}catch{for(const line of raw.split('\n'))if(line.startsWith('data: ')&&line.slice(6)!=='[DONE]')try{objects.push(JSON.parse(line.slice(6)));}catch{}}
  const obj=objects.findLast(value=>value.usage);
  report.receipts.push({...label,at:new Date().toISOString(),httpStatus:response.status,responseId:obj?.id||null,model:obj?.model||null,usage:obj?.usage||null});await persist();
 }
 return response;
};
const res=()=>({code:200,chunks:[],setHeader(){},flushHeaders(){},on(){},off(){},write(v){this.chunks.push(v);},end(){},status(v){this.code=v;return this;},json(v){this.value=v;return this;}});
async function run(module,sample,stage,body,handler){
 label={module,sample,stage};const req={method:'POST',url:'/api/'+stage,body},out=res();
 const start=report.receipts.length;
 try{await requestContext.run(req,()=>handler(req,out));}catch(error){out.code=error.status||500;out.value={error:error.message};}
 report.operations.push({...label,status:out.code,calls:req.aiUsage?.calls||[],receiptStart:start,receiptEnd:report.receipts.length,error:out.code===200?null:out.value?.error});
 await persist();console.log(`${module} sample ${sample} ${stage}: ${out.code}, receipts ${report.receipts.length-start}`);
 if(out.code!==200)throw new Error(`${module} ${stage} failed: ${out.value?.error}`);
 return out;
}
try{
 for(let sample=1;sample<=3;sample++){
  for(const module of ['IELTS','TOEFL','Daily']){
   const id=randomUUID(),start=report.receipts.length;let attempt;
   if(module==='Daily'){
    const history=[];
    for(const [i,text]of dailyTexts.entries()){
     const out=await run(module,sample,'conversation_stream',{action:'conversation_stream',sessionId:id,turnId:`turn-${i+1}`,scenario:{id:'cafe'},sceneCueId:'menu',history,userText:text},converse);
     const event=out.chunks.join('').split('\n\n').find(v=>v.startsWith('event: done'));
     if(!event)throw new Error('Missing conversation completion');
     const done=JSON.parse(event.split('\ndata: ')[1]);history.push({role:'user',content:text},{role:'ai',content:done.reply});
    }
    attempt={id,track:'daily',taskId:'daily-cafe',turns:history,answers:dailyTexts.map((text,i)=>({questionIndex:i,turnId:`turn-${i+1}`,text,prompt:i?history[i*2-1].content:'Welcome to the cafe.',inputMode:'text'}))};
   }else{
    const task=getSpeakingTask(module==='IELTS'?'ielts-full-mock-demo-v1':'toefl-mock-campus-v1');
    const texts=module==='IELTS'?ieltsTexts:[...task.prompts.slice(0,7),...toeflTexts];
    const answers=texts.map((text,questionIndex)=>({questionIndex,text,inputMode:'text',durationSeconds:0}));
    const examinerTurns=[];
    if(module==='IELTS')for(let i=0;i<task.prompts.length;i++){
     const out=await run(module,sample,'exam-examiner',{taskId:task.id,sessionId:id,questionIndex:i,answers:answers.slice(0,i)},examiner);
     examinerTurns.push({questionIndex:i,text:out.value.text,source:'ai'});
    }
    attempt=validateAttempt({id,track:'exam',taskId:task.id,practiceMode:'mock',answers,examinerTurns});
   }
   await run(module,sample,'speaking-feedback',{attempt},feedback);
   report.sessions.push({module,sample,sessionId:id,answers:attempt.answers.length,receiptStart:start,receiptEnd:report.receipts.length});await persist();
  }
 }
 report.status='complete';
}catch(error){report.status='partial';report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{globalThis.fetch=originalFetch;await persist();}
const rows=report.receipts.map(r=>{const u=r.usage;const call={provider:'deepseek',model:r.model,inputTokens:u?.prompt_tokens,outputTokens:u?.completion_tokens,cacheHitTokens:u?.prompt_cache_hit_tokens,cacheMissTokens:u?.prompt_cache_miss_tokens};return{...r,...call,cost:estimateModelCost(call)};});
const summary=['IELTS','TOEFL','Daily'].map(module=>{const a=rows.filter(r=>r.module===module);return{module,sessions:report.sessions.filter(s=>s.module===module).length,calls:a.length,reportedCalls:a.filter(r=>r.usage).length,inputTokens:a.reduce((n,r)=>n+(r.inputTokens||0),0),outputTokens:a.reduce((n,r)=>n+(r.outputTokens||0),0),cacheHitTokens:a.reduce((n,r)=>n+(r.cacheHitTokens||0),0),cacheMissTokens:a.reduce((n,r)=>n+(r.cacheMissTokens||0),0),low:a.reduce((n,r)=>n+(r.cost?.low||0),0),high:a.reduce((n,r)=>n+(r.cost?.high||0),0),unpriced:a.filter(r=>!r.cost).length};});
await fs.writeFile(`${folder}/summary.json`,JSON.stringify({status:report.status,summary},null,2));
await fs.writeFile(`${folder}/calls.csv`,'module,sample,stage,response_id,model,input_tokens,output_tokens,cache_hit,cache_miss,cny_low,cny_high\n'+rows.map(r=>[r.module,r.sample,r.stage,r.responseId,r.model,r.inputTokens,r.outputTokens,r.cacheHitTokens,r.cacheMissTokens,r.cost?.low,r.cost?.high].join(',')).join('\n'));
console.log(JSON.stringify(summary));
