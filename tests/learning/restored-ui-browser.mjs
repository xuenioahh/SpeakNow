import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const output = 'docs/ui-restoration-2026-10-31'; await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, colorScheme: 'dark' });
const page = await context.newPage(), origin = process.env.SPEAKNOW_TEST_ORIGIN || 'http://127.0.0.1:5220';
page.setDefaultTimeout(18000); const passed = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
await context.addInitScript(() => {
  const AudioContext = window.AudioContext; window.__events=[];window.__overlap=0;window.__tts=false;
  navigator.mediaDevices.getUserMedia = async () => {
    if(window.__tts)window.__overlap++; window.__events.push('microphone');
    const audio=new AudioContext();await audio.resume();const oscillator=audio.createOscillator(), gain=audio.createGain(), destination=audio.createMediaStreamDestination();
    oscillator.connect(gain);gain.connect(destination);gain.gain.value=.18;oscillator.start();gain.gain.setValueAtTime(0,audio.currentTime+2.0);
    const track=destination.stream.getAudioTracks()[0],stop=track.stop.bind(track);track.stop=()=>{stop();oscillator.stop();void audio.close();};return destination.stream;
  };
  window.SpeechRecognition=class {start(){this.timer=setTimeout(()=>{this.onstart?.();this.onaudiostart?.();const result=[{transcript:'I would like a small cappuccino with oat milk, please.'}];result.isFinal=true;this.onresult?.({results:[result]});},70);}stop(){clearTimeout(this.timer);this.onaudioend?.();setTimeout(()=>this.onend?.(),20);}abort(){clearTimeout(this.timer);}};
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'en-US',name:'Controlled English voice'}],addEventListener(){},resume(){},cancel(){window.__tts=false;},speak(u){window.__tts=true;window.__events.push('speech-start:'+u.text);u.onstart?.();setTimeout(()=>{window.__tts=false;window.__events.push('speech-end');u.onend?.();},180);}}});
});
const screenshot = name => page.screenshot({path:`${output}/${name}.png`,animations:'disabled'});
async function test(name,fn){await fn();passed.push(name);console.log('PASS',name);}
const draft = () => page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('speaknow-voice-draft:')).map(key=>({key,...JSON.parse(localStorage.getItem(key))})).find(value=>value.messages?.length));
async function assertLayout(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.getByRole('navigation',{name:'Main navigation',exact:true}).count(),1);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');}
try{
 await test('accepted NPC opening speaks before capture and conversation stays beside the mounted scene',async()=>{
  await page.goto(origin+'/voice/prepare?scenario=cafe');await page.locator('.scenario-canvas canvas').waitFor();const canvas=await page.locator('.scenario-canvas canvas').elementHandle();
  await page.getByRole('button',{name:'Start Conversation',exact:true}).click();
  for(let turn=0;turn<2;turn++){await page.getByRole('button',{name:'Stop recording and send',exact:true}).waitFor();await page.waitForTimeout(1200);await page.getByRole('button',{name:'Stop recording and send',exact:true}).click();await page.waitForFunction(expected=>Object.keys(localStorage).filter(key=>key.startsWith('speaknow-voice-draft:')).some(key=>JSON.parse(localStorage.getItem(key)).messages?.filter(message=>message.role==='ai').length>=expected),turn+2,{timeout:25000});}
  await page.getByRole('button',{name:'Pause conversation',exact:true}).click();await page.getByRole('log',{name:'Live conversation'}).waitFor();
  assert.ok(await canvas.evaluate(node=>node.isConnected));
  const events=await page.evaluate(()=>window.__events);assert.ok(events[0].startsWith('speech-start:'));assert.ok(events.indexOf('microphone')>events.indexOf('speech-end'));assert.equal(await page.evaluate(()=>window.__overlap),0);
  const [world,panel]=await Promise.all([page.locator('.daily-world').boundingBox(),page.getByRole('complementary',{name:'Conversation panel'}).boundingBox()]);
  assert.ok(panel.x>=world.x+world.width);assert.ok(panel.width>=360&&panel.width<=460);
  assert.ok((await page.getByRole('log').innerText()).includes('You'));assert.equal(await page.getByText('Options',{exact:true}).count(),0);await assertLayout();await screenshot('daily-desktop');
 });
 await test('voice replay, camera consent and practice details remain separate and usable',async()=>{
  const before=await page.evaluate(()=>window.__events.filter(value=>value.startsWith('speech-start:')).length);
  await page.getByRole('button',{name:"Replay Alex's message",exact:true}).first().click();
  await page.waitForFunction(before=>window.__events.filter(value=>value.startsWith('speech-start:')).length>before,before);
  await page.getByRole('button',{name:'Camera settings',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog').getByRole('checkbox').count(),3);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Practice details',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByRole('heading',{name:'Practice details'}).waitFor();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Turn voice off',exact:true}).click();await page.getByRole('button',{name:'Turn voice on',exact:true}).click();
 });
 await test('long conversation preserves reading position and provides an explicit jump to new replies',async()=>{
  const conversationUrl=page.url();
  // Leave first so pagehide cannot replace the seeded history with its live state.
  await page.goto(origin+'/');
  await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('speaknow-voice-draft:'));const value=JSON.parse(localStorage.getItem(key));value.draft='';value.pendingRecordingId=null;value.messages=Array.from({length:40},(_,i)=>({id:`${i%2?'ai':'user'}-turn-${i}`,turnId:`turn-${i}`,role:i%2?'ai':'user',content:`Saved conversation turn ${i}. This sentence keeps enough context to test scrolling and reading position.`,source:i%2?'ai':undefined}));localStorage.setItem(key,JSON.stringify(value));});
  await page.goto(conversationUrl);await page.getByRole('log').waitFor();await page.waitForFunction(()=>document.querySelector('.conversation-transcript').scrollTop>100);
  await page.getByRole('log').evaluate(node=>{node.scrollTop=0;});await page.getByRole('button',{name:'↓ Latest messages',exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Your reply',exact:true}).fill('Could you remind me which milk is available?');await page.getByRole('button',{name:'Send reply',exact:true}).click();
  await page.waitForFunction(()=>Object.keys(localStorage).filter(key=>key.startsWith('speaknow-voice-draft:')).some(key=>JSON.parse(localStorage.getItem(key)).messages?.length>=42));
  assert.ok(await page.getByRole('log').evaluate(node=>node.scrollTop<100));await page.getByRole('button',{name:'↓ Latest messages',exact:true}).click();
  await page.waitForFunction(()=>{const node=document.querySelector('.conversation-transcript');return node.scrollHeight-node.scrollTop-node.clientHeight<95;});
 });
 await test('mobile transcript, composer and primary controls remain in view at 390px and 320px',async()=>{
  for(const [width,height]of[[390,844],[320,640],[320,568]]){await page.setViewportSize({width,height});await assertLayout();const panel=await page.getByRole('complementary',{name:'Conversation panel'}).boundingBox();const input=await page.getByRole('textbox',{name:'Your reply',exact:true}).boundingBox();assert.ok(input.y+input.height<=height+1);assert.ok(panel.y>100);assert.ok(await page.getByRole('log').evaluate(node=>node.clientHeight>=110));await screenshot(`daily-${width}-${height}`);}
  await page.setViewportSize({width:1365,height:900});await page.getByRole('button',{name:'Finish & review',exact:true}).click();await page.waitForURL('**/practice/review?id=*');
  await page.getByRole('button',{name:'Get AI feedback',exact:true}).click();await page.getByText('Engineering fixture: your answer gives a clear reason.',{exact:true}).waitFor();await screenshot('feedback-desktop');
  await page.setViewportSize({width:390,height:844});await assertLayout();await screenshot('feedback-mobile');await page.setViewportSize({width:1365,height:900});
 });
 await test('feedback citations expand the saved answer and targeted retry retains its parent and focus',async()=>{
  const attemptId=new URL(page.url()).searchParams.get('id');
  const source=page.locator('#review-improvements a[href^="#answer-"]').first();await source.click();
  assert.equal(await page.locator('#review-practiced details').first().getAttribute('open'),'');
  await page.locator('#review-improvements').getByRole('button',{name:'Practise this focus',exact:true}).first().click();await page.waitForURL('**/voice/chat?*');
  const retryUrl=new URL(page.url());assert.equal(retryUrl.searchParams.get('retry'),attemptId);assert.ok(retryUrl.searchParams.get('focus'));
  await page.getByRole('textbox',{name:'Your reply',exact:true}).waitFor();
 });
 await test('primary pages keep one navigation, compact sizing and light colors',async()=>{
  for(const route of['/','/exam','/exam/ielts','/exam/bank/repeat','/voice','/progress','/membership','/auth']){
   await page.goto(origin+route);await page.getByRole('navigation',{name:'Main navigation',exact:true}).waitFor();await page.getByRole('heading',{level:1}).first().waitFor();await assertLayout();
   if(route==='/'){assert.ok(await page.locator('.direction-card h2').first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize)<=32));assert.ok((await page.locator('.direction-card').first().boundingBox()).height<=360);}
   if(route==='/exam')assert.ok(await page.locator('.task-type-card h2').first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize)<=26));
   await screenshot(`page-${route==='/'?'home':route.replaceAll('/','-').slice(1)}-desktop`);
   await page.setViewportSize({width:390,height:844});await assertLayout();await screenshot(`page-${route==='/'?'home':route.replaceAll('/','-').slice(1)}-mobile`);await page.setViewportSize({width:1365,height:900});
  }
 });
 await test('account editing, feedback focus and the previous exam safeguards remain reachable',async()=>{
  await page.goto(origin+'/auth');await page.evaluate(async()=>{await fetch('/api/local-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register',email:`ui-${crypto.randomUUID()}@example.invalid`,full_name:'UI Review Learner',password:'ui-review-fixture-password'})});});
  await page.goto(origin+'/profile');await page.getByRole('button',{name:'Edit profile & goal',exact:true}).click();await page.getByRole('textbox',{name:'Display name',exact:true}).fill('Reviewed learner');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('heading',{name:'Reviewed learner',exact:true}).waitFor();await screenshot('account-desktop');
  await page.goto(origin+'/exam/prepare?task=toefl-repeat-campus-v1&question=0');await page.getByRole('radio',{name:/^Exam /}).check();await page.getByRole('button',{name:'Start Exam',exact:true}).click();await page.getByRole('heading',{name:'Listen and Repeat',exact:true}).waitFor();assert.equal(await page.getByText('Reveal reference sentence',{exact:true}).count(),0);await screenshot('toefl-exam-desktop');
 });
 assert.deepEqual(errors,[]);await fs.writeFile(`${output}/browser-results.json`,JSON.stringify({passed,errors,scope:'Real WebAudio, MediaRecorder, local sessions and persistence. Controlled recognition, TTS events and model replies. Physical speaker output is not asserted.'},null,2));
}catch(error){console.error((await page.locator('body').innerText()).slice(-2200));await screenshot('failure').catch(()=>{});throw error;}finally{await browser.close();}
