import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {SPEAKING_TASKS,validateAttempt,validateFeedback,compareRepeat} from '../../shared/speakingTasks.js';
import {normalizeExamScore} from '../../src/lib/examStandards.js';
process.env.FORCE_LOCAL_DATA='true';process.env.SPEAKNOW_DATA_DIR=await fs.mkdtemp(path.join(os.tmpdir(),'speaknow-learning-test-'));process.env.SPEAKNOW_ORIGIN='http://localhost:5194';
const {default:practice}=await import('../../api/speaking-practice.js');
const {default:feedback}=await import('../../api/speaking-feedback.js');
const {default:accounts}=await import('../../api/local-data.js');
const {getOwned}=await import('../../api/_appStore.js');
const response=()=>({code:200,headers:{},status(n){this.code=n;return this;},setHeader(k,v){this.headers[k]=v;},json(v){this.value=v;this.headersSent=true;return this;}});
async function call(handler,body,auth={},extra={}){const res=response();await handler({method:'POST',url:'/api/test',body,socket:{remoteAddress:extra.ip||'127.0.0.9'},headers:{host:'localhost:5194',origin:'http://localhost:5194','content-type':'application/json',...auth,...extra.headers}},res);return res;}
async function account(){const res=await call(accounts,{action:'register',email:`${randomUUID()}@example.invalid`,full_name:'Learning test',password:'test-safe-password'});assert.equal(res.code,200);const cookies=res.headers['Set-Cookie'];return {id:res.value.data.id,headers:{cookie:cookies.map(s=>s.split(';')[0]).join('; '),'x-csrf-token':cookies.find(s=>s.startsWith('speaknow_csrf=')).split(';')[0].split('=')[1]}};}
const a=await account(),b=await account();
const make=(taskId='ielts-part2-skill-v1')=>({id:randomUUID(),track:'exam',taskId,answers:[{questionIndex:0,text:'I learned to cook because it helps me save money.',recordingId:randomUUID(),inputMode:'voice'}],createdAt:new Date().toISOString()});
let first;
test('five separate tasks, authoritative timing, version and simulation provenance',()=>{assert.equal(new Set(SPEAKING_TASKS.map(t=>t.type)).size,5);assert.equal(SPEAKING_TASKS[0].prompts.length,7);assert.equal(SPEAKING_TASKS[1].prompts.length,4);assert.equal(SPEAKING_TASKS[1].timing.answerSeconds,45);assert.equal(SPEAKING_TASKS[3].timing.preparationSeconds,60);assert.equal(SPEAKING_TASKS[3].timing.answerSeconds,120);assert.ok(SPEAKING_TASKS.every(t=>t.source.kind==='original'));assert.equal(normalizeExamScore(25,'toefl',{legacyToefl:true}),null);});
test('malformed tasks, empty transcripts and mismatched feedback evidence are rejected',()=>{assert.throws(()=>validateAttempt({...make(),taskId:'fake'}));assert.throws(()=>validateAttempt({...make(),answers:[{text:'',questionIndex:0}]}));const attempt=validateAttempt(make());assert.throws(()=>validateFeedback({summary:'Test',improvements:[{answerIndex:0,quote:'invented words',reason:'r',suggestion:'s',exercise:'e'}]},attempt));assert.throws(()=>validateFeedback({summary:'Test',improvements:[]},attempt));const result=validateFeedback({summary:'Test',score:9,pronunciation:'excellent',improvements:[{answerIndex:0,quote:'I learned to cook',reason:'Add a concrete example',suggestion:'For example, I prepare lunch.',exercise:'Give one example.'}]},attempt);assert.equal(result.score,null);assert.equal(result.pronunciation,null);});
test('anonymous inference has origin limits and cannot save/read account practices',async()=>{assert.equal((await call(practice,{action:'list'})).code,401);assert.equal((await call(feedback,{attempt:make()},{},{headers:{origin:'https://evil.example'}})).code,403);assert.equal((await call(feedback,{attempt:make()},{cookie:'speaknow_session=forged'})).code,401);});
test('saving is idempotent and retries retain immutable originals with ownership checks',async()=>{first=make();assert.equal((await call(practice,{action:'save',attempt:first},a.headers)).code,200);assert.equal((await call(practice,{action:'save',attempt:first},a.headers)).code,200);const altered={...first,answers:[{...first.answers[0],text:'Changed transcript'}]};assert.equal((await call(practice,{action:'save',attempt:altered},a.headers)).code,409);const retry={...make(),parentId:first.id};assert.equal((await call(practice,{action:'save',attempt:retry},b.headers)).code,409);assert.equal((await call(practice,{action:'save',attempt:retry},a.headers)).code,200);assert.equal((await call(practice,{action:'get',id:first.id},b.headers)).code,404);assert.equal((await call(practice,{action:'list'},a.headers)).value.length,2);});
test('private media roundtrip, duplicate uploads and changed audio are checked',async()=>{const args={id:first.id,recordingId:first.answers[0].recordingId,mime:'audio/webm',data:Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.from('container-header-fixture-not-real-audio')]).toString('base64')};assert.equal((await call(practice,{...args,action:'upload'},a.headers)).code,200);assert.equal((await call(practice,{...args,action:'upload'},a.headers)).code,200);assert.equal((await call(practice,{...args,action:'upload',data:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64')},a.headers)).code,409);assert.equal((await call(practice,{...args,action:'media'},b.headers)).code,404);assert.equal((await call(practice,{...args,action:'media'},a.headers)).value.data,args.data);});
test('provider outage is an explicit failure, never a synthetic successful report',async()=>{for(const key of ['OPENAI_API_KEY','OPENROUTER_API_KEY','DEEPSEEK_API_KEY','ZHIPU_API_KEY','LONGCAT_API_KEY','PARTNER_API_KEY'])delete process.env[key];const res=await call(feedback,{attempt:first},a.headers);assert.equal(res.code,503);assert.equal((await getOwned('voiceSessions',a.id,first.id)).report.learning.feedback,null);});
test('structured provider response is validated and stored server-side; retry reuses it',async()=>{process.env.OPENAI_API_KEY='test-fixture';process.env.LLM_PROVIDER='openai';const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({model:'fixture',choices:[{message:{content:JSON.stringify({summary:'Explain how the skill helps.',strengths:['A clear reason is present.'],improvements:[{answerIndex:0,quote:'save money',reason:'Make this reason concrete.',suggestion:'I spend less on lunches.',exercise:'Add a specific example of a meal.'}]})}}]})};};try{const res=await call(feedback,{attempt:first},a.headers);assert.equal(res.code,200);assert.equal(res.value.source,'ai');assert.equal(res.value.basis,'transcript-only');assert.equal((await call(feedback,{attempt:first},a.headers)).code,200);assert.equal(calls,1);assert.equal((await getOwned('voiceSessions',a.id,first.id)).report.learning.feedback.improvements[0].quote,'save money');}finally{globalThis.fetch=original;delete process.env.OPENAI_API_KEY;}});

test('repeat alignment reports actual missing words, not a pronunciation score',()=>{assert.deepEqual(compareRepeat('The library opens at nine.','The library open nine'),{matched:3,expected:5,missing:['opens','at'],extra:['open'],substitutions:[{reference:'opens',spoken:'open'}],omissions:['at'],additions:[],possibleReordered:[]});});

test('invalid practice input returns a client error, not a fake server success',async()=>{assert.equal((await call(practice,{action:'save',attempt:{id:'invalid'}},a.headers)).code,400);});

test('camera features retain only bounded observations with no raw video or psychological labels',async()=>{
 const {validateVisualEvidence}=await import('../../shared/visualEvidence.js');
 const {landmarkMetrics}=await import('../../src/lib/expressionLandmarks.js');
 assert.deepEqual(landmarkMetrics(undefined,undefined),{});
 const face=Array.from({length:469},()=>({x:.5,y:.5}));face[33]={x:.3,y:.4};face[263]={x:.7,y:.4};face[133]={x:.4,y:.4};face[468]={x:.35,y:.4};face[13]={x:.5,y:.5};face[14]={x:.5,y:.54};
 const measured=landmarkMetrics(face,undefined);assert.ok(Math.abs(measured.mouth-.1)<.0001);assert.equal(measured.faceX,.5);assert.equal(measured.hands,undefined);
 const value=validateVisualEvidence({source:'device-mediapipe',rawVideo:'secret',confidence:'high',windows:[{start:0,end:8,metrics:{head:.2,eyes:NaN,personality:1},observations:{luminance:.5,faceX:2},coverage:2},{start:-1,end:1,metrics:{head:0}}]});
 assert.equal(value.rawVideoStored,false);assert.equal(value.rawVideo,undefined);assert.equal(value.confidence,undefined);assert.equal(value.windows.length,1);assert.deepEqual(value.windows[0].metrics,{head:.2});assert.deepEqual(value.windows[0].observations,{luminance:.5});assert.equal(value.windows[0].coverage,1);
 assert.equal(validateAttempt({...make(),visualEvidence:value}).visualEvidence,null,'exam answers never gain visual scores');
 const daily=validateAttempt({...make(),track:'daily',visualEvidence:value});assert.equal(daily.visualEvidence.windows.length,1);
});
test('TOEFL mock contains ordered task-specific timers and supports recorded answers without fabricated transcripts',async()=>{
 const {getSpeakingTask}=await import('../../shared/speakingTasks.js');const mock=getSpeakingTask('toefl-mock-campus-v1');
 assert.equal(mock.prompts.length,11);assert.deepEqual(mock.steps.map(s=>s.answerSeconds),[8,8,10,10,12,12,12,45,45,45,45]);assert.equal(mock.steps[6].type,'listen-repeat');assert.equal(mock.steps[7].type,'interview');assert.equal(mock.timing.preparationSeconds,0);
 assert.equal(validateAttempt({...make(mock.id),answers:[{questionIndex:0,text:'',recordingId:randomUUID(),inputMode:'voice'}]}).answers[0].text,'');
 assert.throws(()=>validateAttempt({...make(mock.id),answers:[{questionIndex:0,text:''}]}));
});
test('deleting owned attempts removes private media, rejects other owners and protects linked retries',async()=>{
 const original=make(),retry={...make(),parentId:original.id};
 await call(practice,{action:'save',attempt:original},a.headers);await call(practice,{action:'save',attempt:retry},a.headers);
 assert.equal((await call(practice,{action:'delete',id:original.id},b.headers)).code,404);
 assert.equal((await call(practice,{action:'delete',id:original.id},a.headers)).code,409);
 assert.equal((await call(practice,{action:'delete',id:retry.id},a.headers)).code,200);
 const {mediaObject}=await import('../../api/_mediaStore.js');const key=`${a.id}/${original.id}/${original.answers[0].recordingId}`;
 await mediaObject(key,{method:'POST',data:Buffer.from([0x1a,0x45,0xdf,0xa3]),mime:'audio/webm'});
 assert.equal((await call(practice,{action:'delete',id:original.id},a.headers)).code,200);
 assert.equal(await getOwned('voiceSessions',a.id,original.id),null);await assert.rejects(()=>mediaObject(key));
});
test('remote media deletion uses the Storage API prefixes contract and propagates failures',async()=>{
 const {mediaObject}=await import('../../api/_mediaStore.js');const old={force:process.env.FORCE_LOCAL_DATA,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,fetch:globalThis.fetch};
 try{
  process.env.FORCE_LOCAL_DATA='false';process.env.SUPABASE_URL='https://storage.example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-only';
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://storage.example.invalid/storage/v1/object/speaknow-recordings');assert.equal(options.method,'DELETE');assert.deepEqual(JSON.parse(options.body),{prefixes:['owner/practice/recording']});return {ok:true};};
  await mediaObject('owner/practice/recording',{method:'DELETE'});
  globalThis.fetch=async()=>({ok:false});await assert.rejects(()=>mediaObject('owner/practice/recording',{method:'DELETE'}),error=>error.status===503);
 }finally{for(const [env,value]of [['FORCE_LOCAL_DATA',old.force],['SUPABASE_URL',old.url],['SUPABASE_SERVICE_ROLE_KEY',old.key]]){if(value===undefined)delete process.env[env];else process.env[env]=value;}globalThis.fetch=old.fetch;}
});
test('older saved snapshots remain immutable when optional answer metadata is introduced',async()=>{
 const value=make();await call(practice,{action:'save',attempt:value},a.headers);
 const row=await getOwned('voiceSessions',a.id,value.id);delete row.report.learning.answers[0].startSeconds;row.report.learning.taskSnapshot.prompts=row.report.learning.taskSnapshot.prompts.slice(0,1);row.report.learning.taskSnapshot.source.version=1;
 const {saveOwned}=await import('../../api/_appStore.js');await saveOwned('voiceSessions',a.id,row,{update:true});
 const result=await call(practice,{action:'save',attempt:value},a.headers);assert.equal(result.code,200);assert.equal(result.value.taskSnapshot.prompts.length,1);assert.equal(result.value.taskSnapshot.source.version,1);
});
test('audio-only mock without transcription is retained but cannot get fabricated text feedback',async()=>{
 const value={...make('toefl-mock-campus-v1'),answers:[{questionIndex:0,text:'',recordingId:randomUUID(),inputMode:'voice'}]};
 assert.equal((await call(practice,{action:'save',attempt:value},b.headers)).code,200);
 assert.equal((await call(feedback,{attempt:value},b.headers)).code,422);
});
