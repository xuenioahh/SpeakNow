import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import('/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin=process.env.SPEAKNOW_TEST_ORIGIN||'http://127.0.0.1:5228';
const folder='docs/daily-conversation-2026-11-01';await fs.mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
let result;
try{
 await page.goto(origin);
 const id=await page.evaluate(async()=>{
  const {saveAttempt,learningStore}=await import('/src/lib/learningStore.js');
  const {VisionTimeline}=await import('/src/lib/visionTimeline.js');
  const {buildDailyEvidence}=await import('/shared/dailyEvidence.js');
  const {validateFeedback}=await import('/shared/speakingTasks.js');
  const {encodeSpeechWav}=await import('/shared/speechAudio.js');
  const id=crypto.randomUUID(),recordingId=crypto.randomUUID(),timeline=new VisionTimeline(id);
  const answers=[{turnId:'turn-1',questionIndex:0,text:'I went to the coast with Maya.',prompt:'Tell me about your trip.',inputMode:'voice',recordingId,durationSeconds:25,startSeconds:5}];
  for(let index=0;index<140;index++)timeline.sample({time:index*.25,head:0,headVertical:index>32&&index<84?.8:.3,posture:0,gazeHorizontal:.5,mouth:.1,brow:.2,faceX:.5,faceY:.4,faceSize:.2,luminance:.5,models:{face:true,pose:true,hands:true}},{speaker:'user',turnId:'turn-1'});
  timeline.flush();
  const liveMetrics={timeline:[{kind:'pause',start:12,end:14,duration:2,turnId:'turn-1',source:'microphone RMS voice activity'}]};
  const multimodalEvidence=buildDailyEvidence({answers,visionTimeline:timeline.summary(),liveMetrics});
  const event=multimodalEvidence.find(item=>item.kind==='head-down');if(!event)throw new Error('Controlled head interval was not generated');
  const attempt={id,track:'daily',taskId:'daily-cafe',title:'Controlled multimodal evidence fixture',answers,multimodalEvidence,visionTimeline:timeline.summary(),liveMetrics,context:{scenario:'cafe',cue:'menu'},voiceTimings:[{turnId:'turn-1',asrLatencyMs:null,llmCompletionMs:null,ttsFirstAudioMs:null,totalResponseMs:null}]};
  attempt.feedback=validateFeedback({summary:'Controlled engineering review only.',improvements:[],strengths:[],deliveryImprovements:[{evidenceIds:[event.id],suggestion:'Place your notes nearer the camera.',exercise:'Repeat this reply with your notes beside the camera.'}]},attempt);
  // A generated test tone is a media fixture, never presented as a real user take.
  const samples=new Float32Array(16000).map((_,index)=>.1*Math.sin(index*2*Math.PI*220/16000));
  await learningStore.put('recordings',{id:recordingId,blob:new Blob([encodeSpeechWav(samples)],{type:'audio/wav'}),durationSeconds:1});
  await saveAttempt(attempt);return id;
 });
 await page.goto(`${origin}/practice/review?id=${id}`);
 await page.getByRole('tab',{name:'1 Conversation',exact:true}).waitFor();
 await page.getByRole('button',{name:'Open camera review →'}).click();
 assert.equal(await page.getByRole('group',{name:'Seven visual dimensions'}).locator('button').count(),7);
 assert.match(await page.getByLabel('Aligned audio and visual evidence',{exact:true}).innerText(),/does not mean one caused the other/);
 await page.getByText('Response timings',{exact:true}).click();assert.match(await page.locator('.review-response-timings').innerText(),/Not assessed/);
 await page.screenshot({path:`${folder}/evidence-review-desktop.png`,fullPage:true});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${folder}/evidence-review-${width}.png`,fullPage:true});}
 await page.locator('.camera-moment-detail').getByRole('button',{name:'Practise this focus',exact:true}).click();
 await page.waitForURL('**/voice/prepare?*');assert.equal(new URL(page.url()).searchParams.get('retry'),id);assert.match(new URL(page.url()).searchParams.get('focus'),/notes at screen height/);assert.equal(new URL(page.url()).searchParams.get('camera'),'analysis');await page.getByRole('dialog').waitFor();
 assert.deepEqual(errors,[]);result={status:'PASS',scope:'Controlled evidence and generated media fixtures; real browser, IndexedDB, report rendering and retry routing. No claim of human motion or real acoustic assessment.',checks:['seven dimensions','timestamped audio/video overlap','verified delivery evidence','unmeasured latency remains unassessed','320/390 layouts','targeted retry relationship'],runtimeErrors:errors};
}catch(error){result={status:'FAIL',error:String(error),runtimeErrors:errors};console.error(error);process.exitCode=1;}
finally{await fs.writeFile(`${folder}/evidence-browser.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();}
