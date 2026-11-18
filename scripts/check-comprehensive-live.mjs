// Small real-provider probe with synthetic engineering answers, isolated local storage.
import './load-server-env.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
process.env.FORCE_LOCAL_DATA='true';process.env.SPEAKNOW_PAYWALL_ENABLED='false';
process.env.SPEAKNOW_ORIGIN='http://localhost:5198';process.env.LLM_PROVIDER='deepseek';
delete process.env.SPEAKNOW_ENGINEERING_FIXTURE;
process.env.SPEAKNOW_DATA_DIR=await fs.mkdtemp(path.join(os.tmpdir(),'speaknow-live-comprehensive-'));
const {default:examiner}=await import('../api/exam-examiner.js');
const {default:feedback}=await import('../api/speaking-feedback.js');
const {getSpeakingTask,validateAttempt}=await import('../shared/speakingTasks.js');
const {membershipSubject,usageAudit}=await import('../api/_membership.js');
const response=()=>({code:200,headers:{},headersSent:false,status(value){this.code=value;return this;},setHeader(key,value){this.headers[key]=value;},json(value){this.value=value;this.headersSent=true;return this;}});
const request=body=>({method:'POST',url:'/api/speaking-feedback',headers:{host:'localhost:5198',origin:'http://localhost:5198','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'},body});
const task=getSpeakingTask('ielts-full-mock-demo-v1'), id=randomUUID();
const texts=[
 'I am a computer science student. I chose this subject because I enjoy solving practical problems, especially when a small program can save someone time.',
 'I enjoy the project work most. Last month I built a small study planner with two classmates, and seeing people use it made the work feel worthwhile.',
 'I prefer studying alone when I need to concentrate, but I meet my classmates when we have a difficult problem. Explaining an idea to someone else helps me understand it.',
 'My neighbourhood is close to the university. There is a quiet park and a small market, so I can buy fresh food and go for a walk without taking a bus.',
 'In my free time I like cooking and playing badminton. Cooking helps me relax, and badminton gives me a chance to meet friends after a long day at my desk.',
 'I usually prefer going outdoors at the weekend because I spend so much time inside during the week. If it rains, I enjoy reading or cooking at home.',
 'A useful skill I learned was cooking simple meals. I started in my first year at university because buying lunch every day was expensive. My mother showed me how to prepare vegetables and control the heat. At first I burned a few things, but I improved by following simple recipes and practising at the weekend. The first dish I could make confidently was tomato and egg noodles. This skill is useful because it saves money and lets me choose what I eat. It also helped me become more independent. Now I can prepare dinner for my friends, which gives me a real sense of satisfaction.',
 'Yes, I cook several times a week. When I am busy I make a quick noodle dish, and on weekends I try a new recipe.',
 'Technology makes practical skills easier to learn because people can watch demonstrations and pause them. However, watching a video is not the same as practising, so learners still need to try things themselves.',
 'Schools should provide both. Academic knowledge helps students understand why things work, while practical skills help them apply that understanding. For example, cooking can involve both nutrition and basic science.',
 'I think adults share that responsibility with employers and local communities. Employers can offer training for work, and public libraries can provide affordable courses for people who want to change careers.',
 'Communities can organize small workshops where neighbours share a skill. A retired engineer might help young people repair a bicycle, while a student could show older residents how to use a smartphone.'
];
const attempt=validateAttempt({id,track:'exam',taskId:task.id,practiceMode:'mock',answers:texts.map((text,questionIndex)=>({questionIndex,text,inputMode:'text',durationSeconds:0}))});
const examinerReq=request({taskId:task.id,sessionId:id,questionIndex:0,answers:[]});examinerReq.url='/api/exam-examiner';
const ex=response();await examiner(examinerReq,ex);
const fr=response(),feedbackReq=request({attempt});await feedback(feedbackReq,fr);
const ledger=await usageAudit(membershipSubject(feedbackReq));
const result={environment:'Actual DeepSeek API, synthetic engineering transcripts, no microphone/ASR or official score claim',examiner:{status:ex.code,source:ex.value?.source,text:ex.value?.text,error:ex.value?.error},feedback:{status:fr.code,source:fr.value?.source,provider:fr.value?.provider,model:fr.value?.model,summary:fr.value?.summary,dimensions:Object.keys(fr.value?.dimensions||{}),parts:(fr.value?.parts||[]).map(part=>part.part),improvements:fr.value?.improvements?.length,error:fr.value?.error},usage:Object.values(ledger.operations).map(op=>op.measurements)};
await fs.writeFile('docs/comprehensive-2026-10-29/live-examiner-feedback.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));if(ex.code!==200||fr.code!==200)process.exitCode=1;
