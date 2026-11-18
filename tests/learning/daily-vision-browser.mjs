import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import('/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin=process.env.SPEAKNOW_TEST_ORIGIN||'http://127.0.0.1:5236';
const output=process.env.SPEAKNOW_TEST_OUTPUT||'docs/daily-conversation-2026-11-01';
const physical=process.argv.includes('--physical');
const browser=await chromium.launch({channel:'chrome',headless:true,args:physical?[]:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const page=await browser.newPage({permissions:['camera'],viewport:{width:1280,height:900}});
let failure,result;
try{
 await page.addInitScript(()=>{
  window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;window.__visionSamples=[];
  window.__renderProbe={deltas:[],longTasks:[]};let previous=0;
  const frame=at=>{if(previous&&at>5000&&window.__renderProbe.deltas.length<2400)window.__renderProbe.deltas.push(at-previous);previous=at;requestAnimationFrame(frame);};requestAnimationFrame(frame);
  try{new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.startTime>5000)window.__renderProbe.longTasks.push({start:entry.startTime,duration:entry.duration});}).observe({type:'longtask',buffered:true});}catch{}

  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker{constructor(url,options){super(url,options);if(String(url).includes('expression-worker'))this.addEventListener('message',event=>{if(event.data.type==='sample')window.__visionSamples.push(event.data);});}};
 });
 const requests=[];page.on('request',request=>{if(request.method()==='POST')requests.push(request.url());});
 await page.goto(origin+'/voice/prepare?scenario=cafe');
 await page.getByRole('button',{name:'Camera settings',exact:true}).click();
 await page.getByLabel('Camera preview',{exact:true}).check();
 await page.getByLabel('Review visible movement').check()
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Start Conversation',exact:true}).click();
 await page.waitForFunction(()=>window.__visionSamples.length>=12,null,{timeout:45000});
 const samples=await page.evaluate(()=>window.__visionSamples);
 const render=await page.evaluate(()=>{const values=window.__renderProbe.deltas.sort((a,b)=>a-b);return{frames:values.length,medianFrameMs:values[Math.floor(values.length/2)]??null,p95FrameMs:values[Math.floor(values.length*.95)]??null,longTasks:window.__renderProbe.longTasks};});
 if(!physical)assert.ok(samples.every(sample=>sample.facePresent===false));
 assert.ok(samples.some(sample=>Number.isFinite(sample.luminance)));
 assert.ok(samples.every(sample=>Number.isFinite(sample.processingMs)));
 assert.ok(samples.some(sample=>sample.models?.hands===true));
 assert.ok(samples.at(-1).time>samples[0].time+2);
 await page.getByRole('button',{name:'Camera settings',exact:true}).click();
 await page.getByLabel('Camera preview',{exact:true}).uncheck();
 await page.keyboard.press('Escape');
 const count=await page.evaluate(()=>window.__visionSamples.length);await page.waitForTimeout(1000);
 assert.equal(await page.evaluate(()=>window.__visionSamples.length),count);
 await page.getByRole('textbox',{name:'Your reply'}).fill('I would like tea please.');
 await page.getByRole('button',{name:'Finish & review',exact:true}).click();
 await page.waitForURL('**/practice/review?id=*');
 const attempt=await page.evaluate(async()=>{const {learningStore}=await import('/src/lib/learningStore.js');return learningStore.get('attempts',new URLSearchParams(location.search).get('id'));});
 assert.ok(attempt.visionTimeline.frames>=12);if(!physical)assert.equal(attempt.visionTimeline.validSamples.face,0);
 assert.equal(attempt.videoClip,null);
 if(!physical)assert.equal(attempt.visionTimeline.events.some(event=>event.kind!=='face-missing'),false);
 assert.ok(requests.every(url=>!url.includes('upload')&&!url.includes('dynamic-tts')));
 result={status:physical?'PASS physical camera capture and MediaPipe inference; human motion accuracy NOT VERIFIED':'PASS actual MediaPipe Worker',samples:samples.length,render,firstSample:samples[0],lastSample:samples.at(-1),timeline:attempt.visionTimeline,postRequests:requests,scope:physical?'Real physical camera frames, Face/Pose/Hand inference; no controlled human motion or microphone conversation test. No raw video saved.':'Real local Face/Pose/Hand Landmarker models and WASM; Chrome synthetic video pattern. Human motion accuracy and physical webcam remain unverified.'};
 console.log(JSON.stringify({status:result.status,samples:result.samples,render:result.render,models:result.lastSample.models,inference:result.timeline.inference,scope:result.scope}));
}catch(error){failure=error;result={status:'FAIL',error:String(error)};console.error(error);console.error((await page.locator('body').innerText()).slice(-2000));}finally{
 await fs.mkdir(output,{recursive:true});await fs.writeFile(`${output}/${physical?'physical-camera':'vision-browser'}.json`,JSON.stringify(result,null,2));
 await Promise.race([page.goto('about:blank').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))]);await Promise.race([browser.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))]);
}
process.exit(failure?1:0);
