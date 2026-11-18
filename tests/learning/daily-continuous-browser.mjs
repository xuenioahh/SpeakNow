import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import('/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const output=process.env.SPEAKNOW_TEST_OUTPUT||'docs/daily-conversation-2026-11-01';
const turns=Number(process.env.SPEAKNOW_TEST_TURNS||3);
const origin=process.env.SPEAKNOW_TEST_ORIGIN||'http://127.0.0.1:5236';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
let failure;
const recovery=process.argv.includes('--start-recovery');
let starts=0,releaseStart;
const startGate=new Promise(resolve=>releaseStart=resolve);
try{
 await fs.mkdir(output,{recursive:true});
 await page.route('**/api/voice-capabilities',route=>route.fulfill({json:{dynamicTts:'browser'}}));
 if(recovery)await page.route('**/api/membership',async route=>{
  if(route.request().postDataJSON()?.action==='start'){
   starts++;
   if(starts===1)return route.fulfill({status:503,json:{code:'storage_unavailable',error:'Practice is temporarily unavailable. Please try again shortly; your saved conversations are kept.'}});
   if(starts===2)await startGate;
  }
  return route.continue();
 });
 await page.addInitScript(()=>{
  const NativeAudioContext=window.AudioContext;
  window.__streams=[];window.__recognitionCount=0;window.__ttsActive=false;window.__captureDuringTts=0;
  navigator.mediaDevices.getUserMedia=async()=>{
   if(window.__ttsActive)window.__captureDuringTts++;
   const audio=new NativeAudioContext();await audio.resume();
   const source=audio.createOscillator(),gain=audio.createGain(),output=audio.createMediaStreamDestination();
   source.connect(gain);gain.connect(output);gain.gain.value=.18;source.start();gain.gain.setValueAtTime(0,audio.currentTime+.8);
   const track=output.stream.getAudioTracks()[0],stop=track.stop.bind(track);
   track.stop=()=>{stop();source.stop();void audio.close();};window.__streams.push(output.stream);return output.stream;
  };
  class Recognition{
   start(){const turn=++window.__recognitionCount;this.startTimer=setTimeout(()=>{this.onstart?.();this.onaudiostart?.();},10);this.wordsTimer=setTimeout(()=>{const result=[{transcript:turn===1?'I prefer tea because coffee makes me nervous.':`This is controlled utterance number ${turn}.`}];result.isFinal=true;this.onresult?.({results:[result]});},400);}
   stop(){clearTimeout(this.startTimer);clearTimeout(this.wordsTimer);this.onaudioend?.();setTimeout(()=>this.onend?.(),20);}
   abort(){clearTimeout(this.startTimer);clearTimeout(this.wordsTimer);}
  }
  window.SpeechRecognition=Recognition;
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'en-US',name:'Controlled voice'}],addEventListener(){},resume(){},cancel(){window.__ttsActive=false;},speak(utterance){window.__ttsActive=true;utterance.onstart?.();setTimeout(()=>{window.__ttsActive=false;utterance.onend?.();},80);}}});
 });
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/voice/prepare?scenario=cafe');
 await page.locator('.scenario-canvas canvas').waitFor();const canvas=await page.locator('.scenario-canvas canvas').elementHandle();
 if(recovery){
  await page.getByRole('button',{name:'Start Conversation',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Practice is temporarily unavailable'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__streams.length),0);
  assert.equal(new URL(page.url()).searchParams.get('stage'),null);
 }
 await page.getByRole('button',{name:'Start Conversation',exact:true}).click();
 if(recovery){
  await page.getByRole('button',{name:'Starting…',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Starting…',exact:true}).isDisabled(),true);
  await page.waitForTimeout(150);assert.equal(starts,2);releaseStart();
 }
 await page.waitForFunction((turns)=>Object.keys(localStorage).filter(key=>key.startsWith('speaknow-voice-draft:')).some(key=>{const value=JSON.parse(localStorage.getItem(key));return value.messages?.filter(message=>message.role==='ai').length>=turns+1;}),turns,{timeout:120000});
 await page.getByRole('button',{name:'Pause conversation',exact:true}).click();
 if(recovery){assert.equal(await page.getByRole('alert').filter({hasText:'Practice is temporarily unavailable'}).count(),0);console.log('PASS Start failure is visible, retries once, clears the stale error and enters continuous voice.');}
 assert.ok(await canvas.evaluate(node=>node.isConnected));
 assert.equal(await page.evaluate(()=>window.__captureDuringTts),0);
 assert.equal(await page.getByRole('button',{name:'Resume voice conversation',exact:true}).count(),1);
 await page.screenshot({path:output+'/conversation-desktop.png',fullPage:true});
 await page.setViewportSize({width:320,height:568});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/conversation-320.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/conversation-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});
 await page.getByRole('button',{name:'Finish & review',exact:true}).click();
 await page.waitForURL('**/practice/review?id=*');
 const saved=await page.evaluate(async()=>{const {learningStore}=await import('/src/lib/learningStore.js');const id=new URLSearchParams(location.search).get('id');const attempt=await learningStore.get('attempts',id);return{attempt,recordings:await Promise.all(attempt.answers.map(async answer=>{const item=await learningStore.get('recordings',answer.recordingId);return{id:answer.recordingId,size:item?.blob?.size||0};}))};});
 assert.ok(saved.attempt.answers.length>=turns);
 assert.ok(saved.attempt.turns.filter(turn=>turn.role==='ai').length>=turns);
 assert.ok(saved.attempt.voiceTimings.length>=turns);
 assert.ok(saved.recordings.every(recording=>recording.size>0));
 assert.ok(saved.attempt.turns.filter(turn=>turn.role==='user').every(turn=>turn.sessionId===saved.attempt.id&&turn.turnId&&turn.startedAt>0));
 assert.ok(await page.evaluate(()=>window.__streams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))));
 assert.deepEqual(errors,[]);
 const evidence={result:'PASS controlled continuous browser chain',userTurns:saved.attempt.answers.length,aiTurns:saved.attempt.turns.filter(turn=>turn.role==='ai').length,recordedBytes:saved.recordings.map(recording=>recording.size),timings:saved.attempt.voiceTimings,scope:'Real WebAudio, VAD, MediaRecorder, IndexedDB and HTTP SSE; controlled ASR, TTS events and LLM fixture. Not real-model or physical-camera acceptance.'};
 await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/continuous-browser.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({...evidence,timings:evidence.timings.map(item=>({turnId:item.turnId,asrLatencyMs:item.asrLatencyMs,llmCompletionMs:item.llmCompletionMs,ttsFirstAudioMs:item.ttsFirstAudioMs,totalResponseMs:item.totalResponseMs}))}));
}catch(error){failure=error;console.error(error);console.error((await page.locator('body').innerText()).slice(-2500));}finally{
 await Promise.race([page.goto('about:blank').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))]);
 await Promise.race([browser.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))]);
}
process.exit(failure?1:0);
