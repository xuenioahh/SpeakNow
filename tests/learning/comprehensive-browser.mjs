import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { getSpeakingTask } from '../../shared/speakingTasks.js';
import { examPath, IELTS_QUESTION_SETS } from '../../shared/questionBank.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin=process.env.SPEAKNOW_TEST_ORIGIN||'http://127.0.0.1:5198',output='docs/comprehensive-2026-10-29';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({permissions:['microphone','camera'],viewport:{width:1365,height:950}});
await context.route(/fonts\.(googleapis|gstatic)\.com/,route=>route.abort());
await context.addInitScript(()=>{
 window.__streams=[];window.__answer='I enjoy learning because it helps me solve practical problems. For example, I built a study planner last month.';
 const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 navigator.mediaDevices.getUserMedia=async options=>{const stream=await get(options);window.__streams.push(stream);return stream;};
 class Recognition{start(){setTimeout(()=>{this.onstart?.();this.onaudiostart?.();setTimeout(()=>{const item=[{transcript:window.__answer}];item.isFinal=true;this.onresult?.({results:[item]});},80);},25);}stop(){this.onaudioend?.();setTimeout(()=>this.onend?.(),25);}abort(){}}
 window.SpeechRecognition=Recognition;window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 let current,timer;Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'en-US',name:'Engineering voice'}],addEventListener(){},resume(){},cancel(){clearTimeout(timer);current=null;},speak(value){current=value;window.__spoken=value.text;value.onstart?.();timer=setTimeout(()=>{if(current===value){value.onend?.();current=null;}},50);}}});
});
const page=await context.newPage(),passed=[],errors=[],contrast=[];page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
const api=(url,body)=>page.evaluate(async({url,body})=>{const {apiJson}=await import('/src/api/http.js');return apiJson(url,body);},{url,body});
async function test(name,fn){await fn();passed.push(name);console.log('PASS',name);}
async function visit(route){await page.goto(origin+route,{waitUntil:'domcontentloaded'});await page.locator('h1,h2').first().waitFor();}
async function record(){await page.getByRole('button',{name:'Record answer',exact:true}).click();await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();await page.waitForTimeout(500);await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.getByRole('textbox',{name:'Your transcript',exact:true}).waitFor();}
async function finishFeedback(){await page.getByRole('button',{name:'Finish and get feedback',exact:true}).click();await page.waitForURL('**/practice/review?id=*');await page.getByText('Engineering fixture: your answer gives a clear reason.',{exact:true}).waitFor();}
async function audit(route,width){
 const findings=await page.evaluate(()=>{
  const parse=value=>{const n=value.match(/[\d.]+/g)?.map(Number);return n?.length>=3?[n[0],n[1],n[2],n[3]??1]:[0,0,0,0];};
  const blend=(top,base)=>top.slice(0,3).map((c,i)=>c*top[3]+base[i]*(1-top[3]));
  const bg=node=>{const nodes=[];for(let cur=node;cur;cur=cur.parentElement)nodes.unshift(cur);let value=[255,255,255];for(const el of nodes)value=blend(parse(getComputedStyle(el).backgroundColor),value);return value;};
  const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const problems=[];for(const el of document.querySelectorAll('body *')){
   if(![...el.childNodes].some(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim()))continue;
   const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
   if(rect.width<3||rect.height<3||style.visibility==='hidden'||Number(style.opacity)<.1||el.closest('button:disabled,[hidden]'))continue;
   const foreground=parse(style.color);if(foreground[3]===0)continue;
   const background=bg(el),color=blend(foreground,background),a=lum(color),b=lum(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   const large=parseFloat(style.fontSize)>=24||parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700;
   if(ratio<(large?3:4.5)-.03)problems.push({text:el.textContent.trim().slice(0,85),selector:`${el.tagName}.${String(el.className).slice(0,100)}`,ratio:+ratio.toFixed(2),color:style.color,background:background.map(Math.round),font:style.fontSize});
  }return problems;
 });
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 contrast.push({route,width,overflow,findings});assert.equal(overflow,false,`Overflow on ${route} at ${width}`);
 return findings;
}
let mockId;
try{
 await test('major routes use the light system and fit desktop and mobile widths',async()=>{
  const routes=['/','/exam','/exam/ielts','/exam/bank/repeat','/exam/bank/ielts-part1','/exam/bank/ielts-part2','/exam/bank/ielts-part3','/voice','/progress','/membership','/auth'];
  for(const width of [1365,390,320]){await page.setViewportSize({width,height:950});for(const route of routes){await visit(route);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');await audit(route,width);if(width!==320&&['/','/exam/ielts','/progress','/membership'].includes(route))await page.screenshot({path:`${output}/light-${route==='/'?'home':route.split('/').at(-1)}-${width}.png`,fullPage:true});}}
  await page.setViewportSize({width:1365,height:950});
 });
 if(!process.argv.includes('--visual-only')){
 await test('complete IELTS mock runs Part 1 → preparation and long turn → related Part 3 → final feedback and save',async()=>{
  const task=getSpeakingTask('ielts-full-mock-bank-v1');
  await visit('/exam/ielts');await page.getByRole('link',{name:'Start Full Mock Test',exact:true}).click();await page.getByRole('button',{name:/^Start (Practice|Exam)$/,exact:true}).click();
  for(let index=0;index<task.questions.length;index++){
   await page.getByText(`Question ${index+1} / ${task.questions.length}`,{exact:true}).waitFor();
   await page.getByRole('heading',{name:task.prompts[index],exact:true}).waitFor();
   if(task.steps[index].preparationSeconds){await page.getByRole('textbox',{name:'Preparation notes'}).waitFor();await page.getByRole('textbox',{name:'Preparation notes'}).fill('A useful experience, a reason, and a concrete example.');assert.match(await page.getByRole('timer').innerText(),/60s|59s/);await page.getByRole('button',{name:'Finish preparation early'}).click();}
   await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();
   if(task.steps[index].part===2){assert.match(await page.getByRole('timer').innerText(),/120s|119s/);await page.screenshot({path:`${output}/full-mock-part2.png`,fullPage:true});}
   await page.waitForTimeout(500);await page.getByRole('button',{name:'Stop recording',exact:true}).click();
  }
  await page.waitForURL('**/practice/review?id=*');await page.getByText('Engineering fixture: your answer gives a clear reason.',{exact:true}).waitFor();mockId=new URL(page.url()).searchParams.get('id');
  const attempt=await page.evaluate(async id=>(await import('/src/lib/learningStore.js')).learningStore.get('attempts',id),mockId);
  assert.equal(attempt.answers.length,task.questions.length);assert.equal(attempt.completed,true);assert.deepEqual([...new Set(attempt.answers.map(answer=>answer.part))],[1,2,3]);assert.ok(attempt.answers.every(answer=>answer.recordingId));assert.equal(attempt.examinerTurns.length,task.questions.length);assert.ok(attempt.examinerTurns.every(turn=>turn.source==='ai'));
  assert.equal(await page.getByRole('heading',{name:'Overall Performance',exact:true}).count(),1);assert.equal(await page.getByRole('heading',{name:'Top 3 Improvements',exact:true}).count(),1);await page.getByRole('heading',{name:'Speech & Recording Quality',exact:true}).waitFor();
  await page.getByText('Performance by Part',{exact:true}).click();for(const part of [1,2,3])await page.getByRole('heading',{name:`Part ${part}`,exact:true}).waitFor();
  await audit('/practice/review',1365);await page.screenshot({path:`${output}/full-mock-feedback.png`,fullPage:true});
  await page.reload();await page.getByRole('heading',{name:'Overall Performance',exact:true}).waitFor();
 });
 await test('retrying a selected Part retains its source questions, parent and transcript comparison',async()=>{
  const task=getSpeakingTask('ielts-full-mock-bank-v1');await page.getByRole('button',{name:'Retry Part 3',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('part'),'3');assert.equal(new URL(page.url()).searchParams.get('retry'),mockId);await page.getByRole('button',{name:'Start Practice'}).click();
  const indices=task.steps.flatMap((step,index)=>step.part===3?[index]:[]);
  for(let index=0;index<indices.length;index++){await page.getByText(`Question ${index+1} / ${indices.length}`,{exact:true}).waitFor();await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();await page.waitForTimeout(400);await page.getByRole('button',{name:'Stop recording',exact:true}).click();}
  await page.waitForURL('**/practice/review?id=*');await page.getByText('Engineering fixture: your answer gives a clear reason.',{exact:true}).waitFor();await page.getByRole('button',{name:'Compare both attempts'}).click();await page.getByRole('heading',{name:'Previous attempt'}).waitFor();
 });
 await test('IELTS quick practice for each Part keeps preparation, real clips and evidence feedback',async()=>{
  for(const part of ['part1','part2','part3']){
   const set=IELTS_QUESTION_SETS.find(set=>set.taskType===`ielts-${part}`);await visit(examPath(getSpeakingTask(set.setId),{questionIndex:0}));await page.getByRole('button',{name:'Start Practice'}).click();
   if(part==='part2'){await page.getByRole('button',{name:'Start 1-minute preparation'}).click();await page.clock.setSystemTime(new Date(await page.evaluate(()=>Date.now())+61000));await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Record answer')?.disabled);}
   await record();await finishFeedback();await page.getByRole('button',{name:'Try the same task again'}).waitFor();
  }
 });
 await test('both TOEFL task types still record, submit and produce feedback',async()=>{
  for(const type of ['repeat','interview']){await visit(`/exam/bank/${type}`);await page.locator('.bank-set').first().locator('summary').click();await page.locator('.bank-set').first().locator('ol a').first().click();await page.getByRole('button',{name:'Start Practice'}).click();if(type==='repeat'){await page.getByRole('button',{name:'Play sentence'}).click();await page.getByRole('button',{name:'Listen again'}).waitFor();}await record();await finishFeedback();}
 });
 await test('My Progress reads saved attempts once, filters three modes and preserves old routes',async()=>{
  await visit('/progress');await page.getByText('Loading practice records…').waitFor({state:'hidden'});await page.getByRole('button',{name:'Practice History',exact:true}).click();const all=await page.locator('.progress-record').count();assert.ok(all>=6);await page.getByLabel('Practice type',{exact:true}).selectOption('ielts');assert.ok(await page.locator('.progress-record').count()>0);await page.getByRole('button',{name:'Performance & Insights',exact:true}).click();await page.getByText('Compare transcripts',{exact:true}).first().waitFor();
  await visit('/practice/history');await page.waitForURL('**/progress?tab=history');await visit('/analysis');await page.waitForURL('**/progress?tab=insights');await visit('/voice/history?session=old-record-id');assert.equal(new URL(page.url()).searchParams.get('record'),'old-record-id');
 });
 await test('account history and Profile use the same identity, and membership offers no payment flow',async()=>{
  const email=`comprehensive-${randomUUID()}@example.invalid`;
  const account=await api('/api/local-data',{action:'register',email,full_name:'Comprehensive Test',password:'safe-test-password'});assert.ok(account.ok);
  await visit('/profile');await page.getByRole('heading',{name:'Your account'}).waitFor();await page.getByRole('button',{name:'Edit profile & goal'}).click();await page.getByLabel('Display name',{exact:true}).fill('Updated Account');await page.getByRole('button',{name:'Save changes'}).click();await page.getByRole('heading',{name:'Updated Account',exact:true}).waitFor();await audit('/profile',1365);await page.screenshot({path:`${output}/light-profile.png`,fullPage:true});
  await visit('/membership');await page.getByText('Coming Soon',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/buy|subscribe|pay now/i}).count(),0);const membership=await api('/api/membership',{action:'status',planType:'vip'});assert.equal(membership.effectivePlan,'free');assert.equal(membership.paymentsEnabled,false);
 });
 await test('Daily keeps the 3D scene, Orb, continuous media, camera and saved feedback',async()=>{
  await visit('/voice/prepare?scenario=cafe&cue=coffee');await page.locator('.scenario-canvas canvas').waitFor();await page.waitForFunction(()=>document.querySelector('.scenario-canvas')?.__scene&&!document.querySelector('.scenario-canvas').__scene.snapshot().transitioning);await page.getByText('Camera options',{exact:true}).click();await page.getByLabel('Camera preview',{exact:true}).check();await page.getByRole('button',{name:'Start Conversation',exact:true}).click();await page.waitForURL('**stage=conversation*');await page.locator('.camera-preview video').waitFor();await page.waitForFunction(()=>document.querySelector('.camera-preview video').readyState>=2);
  if(await page.getByRole('button',{name:'Start voice conversation',exact:true}).count())await page.getByRole('button',{name:'Start voice conversation',exact:true}).click();await page.getByRole('button',{name:'Pause conversation',exact:true}).waitFor();await page.waitForTimeout(1000);await page.getByRole('button',{name:'Pause conversation',exact:true}).click();await page.waitForTimeout(500);await page.getByLabel('Conversation options',{exact:true}).click();
  await page.locator('.daily-audio-orb .voice-orb canvas').waitFor();assert.equal(await page.locator('.daily-audio-orb .voice-orb').getAttribute('data-renderer'),'webgl');await page.screenshot({path:`${output}/daily-camera-orb.png`,fullPage:true});await audit('/voice/chat',1365);
  // The typed fallback sends a real request through the same continuous interaction.
  const text=page.getByRole('button',{name:'Text reply',exact:true});if(await text.count())await text.click();else await page.getByRole('button',{name:'Type a reply',exact:true}).click();await page.getByRole('textbox',{name:'Your reply'}).fill('Could you make that a small coffee with oat milk?');await page.getByRole('button',{name:'Send reply',exact:true}).click();await page.waitForTimeout(1500);
  await page.getByRole('button',{name:'Finish & review',exact:true}).click();await page.waitForURL('**/practice/review?id=*');await page.getByRole('heading',{name:'Overall Performance',exact:true}).waitFor();
  await visit('/progress?tab=history&exam=daily');await page.locator('.progress-record').first().waitFor();assert.ok(await page.locator('.progress-record').count()>=1);
 });
 }
 const violations=contrast.flatMap(item=>item.findings.map(finding=>({route:item.route,width:item.width,...finding})));
 await fs.writeFile(`${output}/contrast-results.json`,JSON.stringify({checks:contrast,violations},null,2)+'\n');
 assert.deepEqual(errors,[]);
 assert.equal(violations.length,0,`Contrast failures: ${JSON.stringify(violations.slice(0,12))}`);
}catch(error){console.error(error);console.log(page.url(),(await page.locator('body').innerText()).slice(0,9000));await page.screenshot({path:`${output}/browser-failure.png`,fullPage:true}).catch(()=>{});throw error;}
finally{await fs.writeFile(`${output}/browser-results${process.argv.includes('--visual-only')?'-visual':''}.json`,JSON.stringify({passed,pageErrors:errors,contrast,environment:'Real Chrome MediaRecorder/camera/WebGL with synthetic mic and controlled ASR/TTS, isolated model fixture; real model probe is separate.'},null,2)+'\n');await browser.close();}
