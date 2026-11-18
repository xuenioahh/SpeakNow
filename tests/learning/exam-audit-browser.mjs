import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({permissions:['microphone','camera'],viewport:{width:1365,height:950}}),page=await context.newPage();
const origin=process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:5198', passed=[], errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
await context.addInitScript(()=>{
 const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.__streams=[];window.__count=0;
 navigator.mediaDevices.getUserMedia=async opt=>{window.__count++;if(window.__micError)throw new DOMException('Fixture',window.__micError);const stream=await original(opt);window.__streams.push(stream);return stream;};
 class Recognition{start(){if(window.__hangASR)return;setTimeout(()=>{this.onstart?.();this.onaudiostart?.();setTimeout(()=>{if(window.__emptyASR)return;const item=[{transcript:'I am a student and I enjoy learning new skills.'}];item.isFinal=true;this.onresult?.({results:[item]});},100);},30);}stop(){this.onaudioend?.();setTimeout(()=>this.onend?.(),30);}abort(){}}
 window.SpeechRecognition=Recognition;window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'en-US',name:'Controlled'}],addEventListener(){},resume(){},cancel(){},speak(u){u.onstart?.();setTimeout(()=>window.__ttsFail?u.onerror?.():u.onend?.(),60);}}});
});
async function test(name,fn){await fn();passed.push(name);console.log('PASS',name);}
async function enter(task='ielts-part1-study-v1',query=''){await page.goto(`${origin}/exam/prepare?task=${task}${query}`);await page.getByRole('button',{name:/^Start (Practice|Exam)$/,exact:true}).click();await page.getByText(/Question 1 \/ /,{exact:true}).waitFor();}
async function record(){await page.getByRole('button',{name:'Record answer',exact:true}).click();await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();await page.waitForTimeout(700);await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.locator('audio').waitFor();await page.getByRole('textbox',{name:'Your transcript',exact:true}).waitFor();}
async function rows(store){return page.evaluate(async store=>{const {learningStore}=await import('/src/lib/learningStore.js');return learningStore.all(store);},store);}
try{
await test('IELTS selection → centered introduction → exam; no empty UI or teaching text',async()=>{
 await page.goto(origin+'/exam');await page.locator('article').filter({hasText:'Part 1 · Familiar topics'}).getByRole('link',{name:'Full practice set (3)'}).click();
 await page.getByRole('button',{name:/^Start (Practice|Exam)$/,exact:true}).waitFor();assert.equal(await page.getByRole('button').count(),1);assert.equal(await page.locator('textarea,audio').count(),0);assert.match(await page.locator('main').innerText(),/60 seconds per answer \(practice limit\)/);
 await page.screenshot({path:'docs/button-audit-2026-10-24/intro-desktop.png',fullPage:true});await page.getByRole('button',{name:/^Start (Practice|Exam)$/,exact:true}).click();
 await page.getByRole('heading',{name:'Do you work or are you a student?'}).waitFor();await page.waitForURL(/session=/);assert.equal(await page.locator('textarea,audio').count(),0);assert.equal(await page.getByRole('button',{name:'Finish and get feedback'}).count(),0);
 assert.doesNotMatch(await page.locator('main').innerText(),/Ready to answer|Review recognition|Drafts and recordings|practice limit|pronunciation|Sign in|Original simulation|Record your answer\./);
 assert.equal(await page.getByRole('button',{name:'Listen to question'}).count(),0);await page.getByRole('button',{name:'Record answer'}).waitFor();await page.screenshot({path:'docs/button-audit-2026-10-24/exam-desktop.png',fullPage:true});
});
await test('double Record/Stop are single flight; actual MediaRecorder audio and timer; editing retains raw ASR',async()=>{
 const recordButton=page.getByRole('button',{name:'Record answer',exact:true});await recordButton.evaluate(b=>{b.click();b.click();});await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__count),1);assert.match(await page.getByRole('timer').innerText(),/Recording/);assert.equal(await page.locator('textarea').count(),0);
 await page.waitForTimeout(1200);await page.getByRole('button',{name:'Stop recording',exact:true}).evaluate(b=>{b.click();b.click();});await page.locator('audio').waitFor();
 await page.locator('audio').evaluate(a=>a.play());await page.waitForFunction(()=>document.querySelector('audio').currentTime>0);await page.locator('audio').evaluate(a=>a.pause());
 await page.getByRole('textbox',{name:'Your transcript'}).fill('Edited answer: I study computer science.');await page.reload();await page.getByRole('textbox',{name:'Your transcript'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Your transcript'}).inputValue(),'Edited answer: I study computer science.');
 const draft=(await rows('drafts'))[0];assert.match(draft.rawTranscript,/I am a student/);assert.equal(draft.text,'Edited answer: I study computer science.');assert.ok(await page.evaluate(async()=>{const {learningStore}=await import('/src/lib/learningStore.js');return (await learningStore.all('recordings'))[0].blob.size>0;}));assert.equal(await page.getByRole('button',{name:'Start Practice'}).count(),0);
});
let completedUrl,completedId,sessionUrl;
await test('three distinct questions; no early Finish; save, submit double-click, refresh and old session recovery',async()=>{
 sessionUrl=page.url();await page.route('**/api/speaking-feedback',r=>r.fulfill({status:503,json:{error:'Controlled failure'}}),{times:1});for(let i=0;i<3;i++){
 if(i>0)await record();const label=i<2?'Next Question':'Finish and get feedback';assert.equal(await page.getByRole('button',{name:i<2?'Finish and get feedback':'Next Question'}).count(),0);
 await page.getByRole('button',{name:label,exact:true}).evaluate(b=>{b.click();b.click();});if(i<2)await page.getByText(`Question ${i+2} / 3`,{exact:true}).waitFor();
 }await page.waitForURL('**/practice/review?id=*');completedUrl=page.url();completedId=new URL(completedUrl).searchParams.get('id');const attempt=(await rows('attempts')).find(a=>a.id===completedId);assert.equal(attempt.answers.length,3);assert.equal(new Set(attempt.answers.map(a=>a.recordingId)).size,3);assert.match(attempt.answers[0].rawTranscript,/I am a student/);assert.match(attempt.answers[0].text,/Edited answer/);
 await page.getByRole('alert').waitFor();assert.equal((await rows('attempts')).find(a=>a.id===completedId).feedback,undefined);
});
await test('failed feedback keeps saved data; Retry real API; targeted retry/compare/original preserved',async()=>{
 await page.getByRole('button',{name:'Retry feedback'}).click();await page.getByText('Engineering fixture: your answer gives a clear reason.',{exact:true}).waitFor();
 await page.goto(sessionUrl);await page.waitForURL(`**/practice/review?id=${completedId}`);assert.equal((await rows('attempts')).filter(a=>a.id===completedId).length,1);await page.getByRole('button',{name:'Practise this focus',exact:true}).click();
 assert.equal(new URL(page.url()).searchParams.get('question'),'0');await page.getByRole('button',{name:'Start Practice'}).click();await record();await page.getByRole('button',{name:'Finish and get feedback'}).click();await page.waitForURL('**/practice/review?id=*');await page.getByRole('button',{name:'Compare both attempts'}).click();await page.getByRole('heading',{name:'Previous attempt'}).waitFor();assert.ok((await rows('attempts')).find(a=>a.id===completedId));
});
await test('permission denied, missing/busy microphone recover; no unsolicited error',async()=>{
 await enter('ielts-part3-learning-v1','&question=0');assert.equal(await page.getByRole('alert').count(),0);
 for(const code of ['NotAllowedError','NotFoundError','NotReadableError']){await page.evaluate(code=>window.__micError=code,code);await page.getByRole('button',{name:'Record answer',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('textarea,audio').count(),0);assert.equal(await page.getByRole('button',{name:'Finish and get feedback'}).count(),0);}
 await page.evaluate(()=>window.__micError=null);await record();await page.getByRole('button',{name:'Save and exit'}).click();await page.waitForURL('**/exam');
});
await test('history continuation and browser Back retain clip; rererecord cancellation preserves previous take',async()=>{
 await page.goto(origin+'/practice/history');await page.getByRole('link',{name:'Continue exam practice →'}).first().click();await page.locator('audio').waitFor();const before=(await rows('drafts')).find(d=>d.recordingId);
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Record another take'}).click();assert.equal((await rows('drafts')).find(d=>d.recordingId).recordingId,before.recordingId);
 await page.goBack();await page.getByRole('link',{name:'Continue exam practice →'}).first().click();await page.locator('audio').waitFor();assert.equal(await page.getByRole('button',{name:'Start Practice'}).count(),0);
});
await test('empty ASR does not fake transcript; manual text with real audio submits; original raw remains empty',async()=>{
 await enter('toefl-interview-campus-v1','&question=0');await page.evaluate(()=>window.__emptyASR=true);await record();assert.equal(await page.getByRole('textbox',{name:'Your transcript'}).inputValue(),'');assert.equal(await page.getByRole('button',{name:'Finish and get feedback'}).count(),0);await page.getByRole('textbox',{name:'Your transcript'}).fill('A real answer supplied for this recording.');await page.getByRole('button',{name:'Finish and get feedback'}).click();await page.waitForURL('**/practice/review?id=*');
});
await test('Part 2 preparation → recording → follow-up without second preparation; save exit recovery',async()=>{
 await enter('ielts-part2-skill-v1');assert.ok(await page.getByRole('button',{name:'Record answer',exact:true}).isDisabled());await page.getByRole('button',{name:'Start 1-minute preparation'}).click();await page.getByRole('textbox',{name:'Preparation notes'}).fill('Learning to cook');await page.getByRole('button',{name:'Finish preparation early'}).click();await record();await page.getByRole('button',{name:'Next Question'}).click();await page.getByRole('heading',{name:'Do you use this skill often?'}).waitFor();assert.equal(await page.getByRole('button',{name:'Start 1-minute preparation'}).count(),0);await record();await page.getByRole('button',{name:'Finish and get feedback'}).click();await page.waitForURL('**/practice/review?id=*');
});
await test('TOEFL repeat requires actual playback and time cap stops tracks; refresh does not reintroduce intro',async()=>{
 await enter('toefl-repeat-campus-v1','&question=0');assert.ok(await page.getByRole('button',{name:'Record answer',exact:true}).isDisabled());await page.getByRole('button',{name:'Play sentence'}).click();await page.getByRole('button',{name:'Listen again'}).waitFor();await page.getByRole('button',{name:'Record answer',exact:true}).click();await page.getByRole('button',{name:'Stop recording'}).waitFor();await page.waitForTimeout(800);await page.clock.setSystemTime(new Date(Date.now()+13000));await page.locator('audio').waitFor();assert.ok(await page.evaluate(()=>window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));await page.reload();await page.locator('audio').waitFor();assert.equal(await page.getByRole('button',{name:'Start Practice'}).count(),0);
});
await test('320/390 mobile introduction and active exam have no overflow or instructional copy',async()=>{
 for(const width of [320,390]){await page.setViewportSize({width,height:844});await page.goto(origin+'/exam/practice?task=ielts-part1-study-v1&question=0');await page.getByRole('button',{name:'Start Practice'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`docs/button-audit-2026-10-24/intro-${width}.png`,fullPage:true});await page.getByRole('button',{name:'Start Practice'}).click();await page.getByRole('button',{name:'Record answer'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`docs/button-audit-2026-10-24/exam-${width}.png`,fullPage:true});await record();await page.getByRole('button',{name:'Finish and get feedback'}).click();await page.waitForURL('**/practice/review?id=*');}
});
assert.deepEqual(errors,[]);
} catch(e){console.error(e);console.log(page.url(),await page.locator('body').innerText());await page.screenshot({path:'docs/button-audit-2026-10-24/failure.png',fullPage:true});throw e;}
finally{await fs.writeFile('docs/button-audit-2026-10-24/exam-results.json',JSON.stringify({passed,pageErrors:errors,environment:'Real Chrome MediaRecorder + fake microphone; controlled ASR/TTS; isolated backend AI fixture. Hardware microphone and external recognition/model quality not verified.'},null,2));await browser.close();}
