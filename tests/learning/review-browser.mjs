import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getSpeakingTask} from '../../shared/speakingTasks.js';
const {chromium}=await import('/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1365,height:1000}});
const origin=process.env.SPEAKNOW_TEST_ORIGIN || (process.argv.includes('--origin') ? process.argv[process.argv.indexOf('--origin')+1] : 'http://127.0.0.1:5194');
const task=getSpeakingTask('toefl-repeat-campus-v1');
const run=Date.now(),retryId=`review-retry-${run}`;
const fixture={id:`review-short-${run}`,track:'exam',taskId:task.id,type:task.type,exam:task.exam,title:task.title,taskSnapshot:task,practiceMode:'set',answers:[{questionIndex:0,prompt:task.prompts[0],text:'The library opens at ten.',durationSeconds:5.4,inputMode:'voice'}]};
async function seed(value){await page.evaluate(async value=>{const {learningStore}=await import('/src/lib/learningStore.js');await learningStore.put('attempts',value);},value);}
async function visit(value){await seed(value);await page.goto(`${origin}/practice/review?id=${value.id}`);await page.getByRole('heading',{level:1}).waitFor();}
await fs.mkdir('docs/review-2026-10-24',{recursive:true});
await page.route('https://fonts.googleapis.com/**', route=>route.abort());
await page.route('https://fonts.gstatic.com/**', route=>route.abort());
const passed=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
async function test(name,fn){await fn();passed.push(name);console.log('PASS',name);}
async function screenshot(name){await page.waitForTimeout(350);assert.equal(await page.locator('main').count(),1);await page.screenshot({path:`docs/review-2026-10-24/${name}.png`,fullPage:true});}
const report={summary:'The transcript changes the opening time.',strengths:['The subject “library” is retained.'],improvements:[{answerIndex:0,quote:'ten',reason:'Check the opening time against the original sentence.',suggestion:'Use the time stated in the original sentence.',exercise:'Listen to the time, then repeat the full sentence.'}]};
let failure;
try{
await page.goto(origin);
await test('short answer: visible original and answer; no empty framework, rate or duplicated sync',async()=>{
 await visit(fixture);assert.equal(await page.getByRole('heading',{name:'Your Performance',exact:true}).count(),1);assert.equal(await page.getByRole('heading',{name:'Key Improvements',exact:true}).count(),1);
 assert.equal(await page.getByText(fixture.answers[0].text,{exact:true}).count(),1);assert.equal(await page.getByText(fixture.answers[0].prompt,{exact:true}).count(),1);
 assert.equal(await page.getByRole('link',{name:'Sign in to sync'}).count(),1);assert.equal(await page.locator('audio').count(),0);assert.equal(await page.locator('button.primary').count(),2);
 assert.match(await page.locator('main').innerText(),/1 of 7 answered/);assert.doesNotMatch(await page.locator('main').innerText(),/listen-repeat|words \/ recorded|filler|TOEFL 2026 assessment/);
 await screenshot('after-short-desktop');
 const differences=page.getByRole('group',{name:'Text differences for sentence 1',exact:true});
 assert.ok(await differences.isVisible());assert.match(await differences.innerText(),/nine → ten/);assert.equal(await differences.locator('details').count(),0);
 await page.getByText('Save details',{exact:true}).focus();await page.keyboard.press('Enter');assert.ok(await page.locator('details').filter({has:page.getByText('Save details',{exact:true})}).getAttribute('open')!==null);
 await page.keyboard.press('Enter');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('after-short-mobile');await page.setViewportSize({width:1365,height:1000});
});
await test('repeat differences stay visible, distinguish separate edits, and do not leak into interview feedback',async()=>{
 const answers=[
  {questionIndex:0,prompt:'The library opens at nine.',text:'library opens at nine today.',inputMode:'text'},
  {questionIndex:1,prompt:'Please put the books on the shelf.',text:'Please put books on the shelf.',inputMode:'text'},
  {questionIndex:2,prompt:'The bus leaves now.',text:'The bus leaves right now.',inputMode:'text'},
  {questionIndex:3,prompt:'Take the blue book.',text:'Take the book blue.',inputMode:'text'},
  {questionIndex:4,prompt:'It is open.',text:'IT IS OPEN!',inputMode:'text'}
 ];
 await visit({...fixture,answers});
 const groups=page.locator('.review-differences');assert.equal(await groups.count(),5);
 assert.match(await groups.nth(0).innerText(),/Missing: the/);assert.match(await groups.nth(0).innerText(),/Added: today/);assert.doesNotMatch(await groups.nth(0).innerText(),/replacements/);
 assert.match(await groups.nth(1).innerText(),/Missing: the/);assert.match(await groups.nth(2).innerText(),/Added: right/);assert.match(await groups.nth(3).innerText(),/word-order changes:/);assert.match(await groups.nth(4).innerText(),/matches the sentence/);
 assert.equal(await page.getByText('Text differences may include transcription errors.',{exact:true}).count(),1);
 for(const group of await groups.all()) assert.ok(await group.isVisible());
 await page.setViewportSize({width:320,height:640});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('after-differences-small-mobile');await page.setViewportSize({width:1365,height:1000});
 const interview=getSpeakingTask('toefl-interview-campus-v1');await visit({...fixture,taskId:interview.id,type:interview.type,title:interview.title,taskSnapshot:interview});assert.equal(await page.locator('.review-differences').count(),0);
 const mock=getSpeakingTask('toefl-mock-campus-v1');await visit({...fixture,taskId:mock.id,type:mock.type,title:mock.title,taskSnapshot:mock,answers:[fixture.answers[0],{...fixture.answers[0],questionIndex:7,prompt:mock.prompts[7]}]});assert.equal(await page.locator('.review-differences').count(),1);
});
await test('multiple and complete answers remain visible; quick progress is 1 of 1',async()=>{
 await visit({...fixture,answers:task.prompts.map((prompt,i)=>({...fixture.answers[0],questionIndex:i,prompt,text:prompt}))});assert.equal(await page.locator('.learning-answer').count(),7);assert.match(await page.locator('main').innerText(),/7 of 7 answered/);
 await visit({...fixture,practiceMode:'quick'});assert.match(await page.locator('main').innerText(),/1 of 1 answered/);
});
await test('feedback loading prevents duplicate requests, failure retries, success shows evidence and targeted retry',async()=>{
 await visit(fixture);let count=0,release;const hold=new Promise(r=>release=r);
 await page.route('**/api/speaking-feedback',async route=>{count++;await hold;await route.fulfill({status:503,json:{error:'Feedback temporarily unavailable.'}});});
 await page.getByRole('button',{name:'Get AI feedback',exact:true}).click();await page.getByRole('button',{name:'Reviewing…',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'Reviewing…',exact:true}).isDisabled());assert.equal(await page.locator('[aria-busy="true"]').count(),1);release();await page.getByRole('alert').waitFor();assert.equal(count,1);
 await page.unroute('**/api/speaking-feedback');await page.route('**/api/speaking-feedback',route=>route.fulfill({json:report}));
 await page.getByRole('button',{name:'Retry feedback',exact:true}).click();await page.locator('.review-improvement').waitFor();
 for(const name of ['What You Practiced','Your Performance','Key Improvements','Practice Again'])assert.equal(await page.getByRole('heading',{name,exact:true}).count(),1);
 assert.equal(await page.locator('.review-improvement').count(),1);assert.equal(await page.locator('button.primary').count(),1);assert.equal(await page.getByText('ten',{exact:true}).count(),1);
 await screenshot('after-feedback-desktop');await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('after-feedback-mobile');await page.setViewportSize({width:1365,height:1000});
 await page.getByRole('button',{name:'Practise this focus'}).click();const url=new URL(page.url());assert.equal(url.searchParams.get('retry'),fixture.id);assert.equal(url.searchParams.get('question'),'0');assert.equal(url.searchParams.get('focus'),report.improvements[0].exercise);
 await page.unroute('**/api/speaking-feedback');
});
await test('zero suggestions, duplicates, invalid cached evidence and links share the same three-item limit',async()=>{
 await visit({...fixture,feedback:{...report,improvements:Array(4).fill(report.improvements[0])}});assert.equal(await page.locator('.review-improvement').count(),1);assert.equal(await page.locator('[id^=improvement-]').count(),1);
 await visit({...fixture,feedback:{...report,improvements:Array.from({length:4},(_,i)=>({...report.improvements[0],exercise:`Repeat the sentence, focusing on time. Step ${i+1}.`}))}});assert.equal(await page.locator('.review-improvement').count(),3);
 await visit({...fixture,feedback:{...report,improvements:[]}});assert.equal(await page.locator('.review-improvement').count(),0);await page.getByText('No specific corrections suggested.',{exact:true}).waitFor();
 await visit({...fixture,feedback:{...report,improvements:[{...report.improvements[0],quote:'invented quote'}]}});assert.equal(await page.locator('.review-improvement').count(),0);assert.equal(await page.locator('.review-issue-link').count(),0);
 await visit({...fixture,feedback:{...report,improvements:[{...report.improvements[0],exercise:''}]}});assert.equal(await page.locator('.review-improvement').count(),0);assert.equal(await page.locator('.review-issue-link').count(),0);
 await visit({...fixture,answers:Array.from({length:4},(_,i)=>({...fixture.answers[0],questionIndex:i})),feedback:{...report,improvements:Array.from({length:4},(_,i)=>({...report.improvements[0],answerIndex:i}))}});assert.equal(await page.locator('.review-improvement').count(),3);assert.equal(await page.locator('.review-issue-link').count(),3);
 for(const link of await page.locator('.review-issue-link').all())assert.equal(await page.locator(await link.getAttribute('href')).count(),1);
});
await test('empty transcript, absent audio, no answers and missing media have accurate actionable states',async()=>{
 await visit({...fixture,answers:[{...fixture.answers[0],text:''}]});await page.getByText('No transcript available.',{exact:true}).waitFor();assert.equal(await page.locator('audio').count(),0);assert.equal(await page.getByRole('button',{name:'Get AI feedback',exact:true}).count(),0);assert.equal(await page.getByRole('region',{name:'AI feedback',exact:true}).count(),1);assert.equal(await page.locator('button.primary').count(),1);
 await visit({...fixture,answers:[]});await page.getByText('No answers saved. Start this task again.',{exact:true}).waitFor();assert.match(await page.locator('main').innerText(),/0 of 7 answered/);
 await page.route('**/api/speaking-practice',route=>route.fulfill({status:404,json:{error:'Recording not found'}}));
 await visit({...fixture,answers:[{...fixture.answers[0],recordingId:'missing-recording-01',text:''}]});await page.getByText('Recording unavailable.',{exact:true}).waitFor();assert.equal(await page.locator('audio').count(),0);await page.getByRole('button',{name:/Retry recording for/}).click();await page.getByText('Recording unavailable.',{exact:true}).waitFor();await page.unroute('**/api/speaking-practice');
});
await test('real audio decoding/playback and linked attempts retain separate data',async()=>{
 await page.evaluate(async()=>{const {learningStore}=await import('/src/lib/learningStore.js');const bytes=new ArrayBuffer(44+16000*2);const v=new DataView(bytes);function str(o,s){for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));}str(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,32000,true);for(let i=0;i<16000;i++)v.setInt16(44+i*2,Math.sin(i/10)*1000,true);await learningStore.put('recordings',{id:'review-recording-01',blob:new Blob([bytes],{type:'audio/wav'})});});
 const original={...fixture,answers:[{...fixture.answers[0],recordingId:'review-recording-01'}]};await seed(original);
 await visit({...original,id:retryId,parentId:fixture.id,answers:[{...original.answers[0],text:'The library opens at eleven.'}]});
 await page.locator('audio').waitFor();await page.locator('audio').evaluate(async a=>{await a.play();});await page.waitForFunction(()=>document.querySelector('audio').currentTime>0);await page.locator('audio').evaluate(a=>a.pause());
 assert.match(await page.locator('audio').getAttribute('aria-label'),/this attempt, answer 1/);
 await screenshot('after-recording-desktop');await page.setViewportSize({width:320,height:640});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('after-recording-small-mobile');await page.setViewportSize({width:1365,height:1000});
 await page.getByRole('button',{name:'Compare both attempts'}).click();await page.locator('.learning-comparison audio').waitFor();assert.equal(await page.locator('audio').count(),2);assert.equal(await page.getByText(fixture.answers[0].text,{exact:true}).count(),1);
 assert.equal(await page.locator('.learning-comparison audio').evaluate(a=>a.paused),true);
 await page.locator('audio').first().evaluate(a=>a.dispatchEvent(new Event('error')));await page.getByText('Recording could not be played.',{exact:true}).waitFor();
});
await test('delete confirmation cancels, blocks parents with retries, and removes retry only',async()=>{
 await visit(fixture);await page.getByRole('button',{name:'Delete practice',exact:true}).click();await page.getByRole('alertdialog').waitFor();for(let i=0;i<5;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('[role=alertdialog]').contains(document.activeElement)));}await page.keyboard.press('Escape');assert.ok(await page.getByRole('button',{name:'Delete practice',exact:true}).evaluate(e=>e===document.activeElement));assert.equal(await page.getByRole('alertdialog').count(),0);
 await page.getByRole('button',{name:'Delete practice',exact:true}).click();await page.getByRole('button',{name:'Confirm permanent deletion'}).click();await page.getByRole('alert').filter({hasText:'Delete linked retries first'}).waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.goto(`${origin}/practice/review?id=${retryId}`);await page.getByRole('button',{name:'Delete practice',exact:true}).click();await page.getByRole('button',{name:'Confirm permanent deletion'}).click();await page.waitForURL('**/practice/history');
 assert.equal(await page.evaluate(async id=>{const {learningStore}=await import('/src/lib/learningStore.js');return Boolean(await learningStore.get('attempts',id));},retryId),false);
});
await test('anonymous local status; actual authenticated sync failure, success and cloud reload',async()=>{
 await visit(fixture);await page.getByText('Saved locally',{exact:true}).waitFor();
 const registered=await page.evaluate(async()=>{const r=await fetch('/api/local-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register',email:`review-${Date.now()}@example.invalid`,full_name:'Review Test',password:'safe-browser-password'})});return r.json();});assert.ok(registered.ok);
 await page.reload();await page.getByRole('button',{name:'Sync to my account',exact:true}).waitFor();
 await page.route('**/api/speaking-practice',route=>route.fulfill({status:503,json:{error:'Cloud temporarily unavailable.'}}),{times:1});await page.getByRole('button',{name:'Sync to my account',exact:true}).click();await page.getByText('Sync failed',{exact:true}).waitFor();assert.equal(await page.getByText('Saved on this server · not cloud-synced',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Retry sync',exact:true}).click();await page.getByText('Saved on this server · not cloud-synced',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Get AI feedback',exact:true}).click();await page.getByRole('heading',{name:'Your Performance',exact:true}).waitFor();
 await page.evaluate(async id=>{const {learningStore}=await import('/src/lib/learningStore.js');await learningStore.remove('attempts',id);},fixture.id);await page.reload();await page.getByText('Saved on this server · not cloud-synced',{exact:true}).waitFor();await page.getByRole('heading',{name:'Your Performance',exact:true}).waitFor();
 await page.getByRole('button',{name:'Delete practice',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.match(await page.getByRole('alertdialog').innerText(),/and your account/);await page.getByRole('button',{name:'Confirm permanent deletion'}).click();await page.waitForURL('**/practice/history');
});
await test('daily review shows only supported observations and two useful continuation actions',async()=>{
 const metrics={
  pace:{value:'154 wpm',source:'confirmed transcript + voiced microphone time',samples:129,reliability:'estimated'},
  pauses:{value:'7 pauses',source:'microphone voice activity',samples:129,reliability:'estimated'},
  fluency:{value:'59% active speech',source:'microphone voiced/elapsed time',samples:129,reliability:'continuity proxy'},
  volume:{value:'-33 dBFS',source:'microphone RMS',samples:129,reliability:'measured'},
  fillers:{value:'0 in this turn',source:'confirmed transcript',samples:37,reliability:'transcript only'},
 };
 const daily={...fixture,id:`daily-review-${run}`,track:'daily',type:'conversation',exam:null,taskSnapshot:null,taskId:'daily-cafe',title:'Café · At the Counter',context:{scenario:'cafe',cue:'menu',mode:'basic'},feedback:{summary:'You explained your order clearly.',strengths:[],improvements:[]},liveMetrics:{metrics},answers:[{questionIndex:0,prompt:'What would you like?',text:'An oat milk latte, please.',inputMode:'text'}]};
 await visit(daily);
 const visible=await page.locator('main').innerText();
 assert.match(visible,/154 wpm/);assert.match(visible,/7 pauses/);assert.match(visible,/59% active speech/);
 assert.doesNotMatch(visible,/Not assessed|129 samples|-33 dBFS|0 in this turn|Feedback is based on your transcript/);
 assert.equal(await page.getByRole('heading',{name:'Camera',exact:true}).count(),0);
 assert.equal(await page.getByRole('heading',{name:'Communication',exact:true}).count(),0);
 assert.equal(await page.getByRole('link',{name:'Back to Daily Speaking'}).count(),0);
 assert.match(await page.getByRole('link',{name:'Choose another conversation'}).getAttribute('href'),/\/voice\/prepare/);
 await page.getByText('How these observations were measured',{exact:true}).click();
 assert.match(await page.locator('.review-measurement-details').innerText(),/microphone voice activity/);
 await page.getByText('How these observations were measured',{exact:true}).click();
 await page.getByRole('button',{name:'Delete practice',exact:true}).click();await page.getByRole('alertdialog').waitFor();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await screenshot('daily-supported-desktop');await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('daily-supported-mobile');await page.setViewportSize({width:1365,height:1000});
});
assert.deepEqual(errors,[]);await fs.writeFile('docs/review-2026-10-24/browser-results.json',JSON.stringify({passed,pageErrors:errors,environment:'Real Chromium, IndexedDB and isolated API; controlled AI failure/success, generated WAV playback; no production data'},null,2));
}catch(e){failure=e;console.error(e);console.log(await page.locator('body').innerText());await screenshot('failure');}finally{
 await Promise.race([page.goto('about:blank').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))]);
 await Promise.race([browser.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))]);
}
process.exit(failure?1:0);
