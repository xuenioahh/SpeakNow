import test from 'node:test';
import assert from 'node:assert/strict';
import { VisionTimeline } from '../../src/lib/visionTimeline.js';
import { buildDailyEvidence, alignDailyEvidence, validateDeliveryFeedback } from '../../shared/dailyEvidence.js';
import { validateAttempt, validateFeedback } from '../../shared/speakingTasks.js';
import { conversationMemory, conversationContext, conversationReviewContext } from '../../shared/conversationMemory.js';
import { VoiceInteraction } from '../../src/lib/voice/VoiceInteraction.js';

test('seven dimensions retain missing values, device confidence and full-session time windows',()=>{
 const timeline=new VisionTimeline('test-session-vision');
 for(let index=0;index<120;index++)timeline.sample({time:index*.25,head:0,posture:0,headVertical:.3,faceX:.5,faceY:.4,faceSize:.2,mouth:.1,brow:.2,gazeHorizontal:.5,luminance:.6,handCount:1,handModelAvailable:true,models:{face:true,pose:true,hands:true},confidence:{face:null,body:.9,hands:null}},{speaker:'user',turnId:'turn-1'});
 const result=timeline.summary();
 assert.equal(result.dimensions.length,7);assert.ok(result.dimensions.every(item=>item.availability==='observed'));
 assert.equal(result.dimensions.find(item=>item.id==='gaze').nearCameraDirectionRatio,1);
 assert.equal(result.featureSamples.find(item=>item.featureType==='head').confidence,null);
 assert.equal(result.featureSamples.find(item=>item.featureType==='bodyLean').availability,'not-assessed');
 assert.equal(result.featureSamples.find(item=>item.featureType==='bodyLean').featureValue,null);
 assert.ok(result.events.some(event=>event.kind==='head-posture-stable'));
 const restored=new VisionTimeline('test-session-vision');restored.restore(result);assert.equal(restored.summary().windows.length,3);
});

test('camera gaps and missing detections never become a stable posture or precise gaze result',()=>{
 const timeline=new VisionTimeline('missing-camera');
 for(let index=0;index<20;index++)timeline.sample({time:index*.25,facePresent:false,models:{face:true,pose:false,hands:false}});
 timeline.sample({time:30});
 const result=timeline.summary();assert.equal(result.dimensions.find(item=>item.id==='gaze').availability,'not-assessed');
 assert.equal(result.dimensions.find(item=>item.id==='consistency').availability,'not-assessed');
 assert.ok(result.events.every(event=>event.kind==='face-missing'));assert.equal(result.validSamples.face,0);
});

const answers=[{turnId:'turn-1',questionIndex:0,text:'I went to the coast with Maya.',prompt:'Where did you go?',inputMode:'voice',recordingId:'recording-example-001',durationSeconds:12,startSeconds:5}];
test('audio and visual evidence align by both timestamp and answer identity without adding a cause',()=>{
 const evidence=buildDailyEvidence({answers,visionTimeline:{events:[{kind:'head-down',speaker:'user',turnId:'turn-1',start:8,end:11},{kind:'gaze-away',speaker:'ai',turnId:'turn-1',start:8,end:11}]},liveMetrics:{timeline:[{kind:'pause',turnId:'turn-1',start:8.5,end:10,duration:1.5},{kind:'pause',turnId:'other',start:8.5,end:10,duration:1.5}]}});
 assert.equal(evidence.length,2);const aligned=alignDailyEvidence(evidence);assert.equal(aligned[0].cooccurring[0],aligned[1].id);
 assert.equal(aligned[0].quote,answers[0].text);assert.match(aligned[0].limitation,/does not establish cause/);
 const checked=validateAttempt({id:'test-evidence-attempt',track:'daily',taskId:'daily-cafe',answers,multimodalEvidence:evidence});
 assert.equal(checked.multimodalEvidence.length,2);
});

test('delivery advice rejects fabricated evidence and emotion claims; observations come from measured labels',()=>{
 const evidence=buildDailyEvidence({answers,visionTimeline:{events:[{kind:'head-down',speaker:'user',turnId:'turn-1',start:8,end:11}]}});
 const attempt={track:'daily',answers,multimodalEvidence:evidence};
 assert.deepEqual(validateDeliveryFeedback([{evidenceIds:['invented'],suggestion:'Look at the camera.',exercise:'Try a reply.'}],attempt),[]);
 assert.deepEqual(validateDeliveryFeedback([{evidenceIds:[evidence[0].id],suggestion:'You were nervous.',exercise:'Try a reply.'}],attempt),[]);
 const result=validateFeedback({summary:'You discussed a trip.',improvements:[],deliveryImprovements:[{evidenceIds:[evidence[0].id],observation:'invented cause',suggestion:'Check your camera position.',exercise:'Try the same reply with your notes closer to the screen.'}]},attempt);
 assert.equal(result.deliveryImprovements[0].observation,'Head direction moved downward');assert.equal(result.basis,'transcript-and-device-observations');
});

test('long earlier answers preserve exact facts even when the original turn exceeded the summary budget',()=>{
 const history=[{role:'user',content:'I prefer mint tea because coffee makes me nervous. My friend Maya lives in Suzhou. '+'Other conversation detail. '.repeat(75)},...Array.from({length:100},(_,index)=>({role:index%2?'ai':'user',content:`A different conversation about transport ${index}. `+'We discussed a station. '.repeat(8)}))];
 const memory=conversationMemory(history,'Where does my friend Maya live?');assert.match(memory.summary,/Maya lives in Suzhou/);assert.match(memory.summary,/prefer mint tea/);assert.equal(memory.recent.at(-1).content,history.at(-1).content.trim());
 const context=conversationContext(history,'Where does Maya live?','cafe','memory-session');assert.equal(context.sessionId,'memory-session');assert.ok(context.recentUserMessages.length>0);
});

test('interrupting playback stops TTS immediately while preserving the generated reply',async()=>{
 let stopCount=0;
 const interaction=new VoiceInteraction({audio:{stop(){stopCount++;}},initialMessages:[{id:'ai-turn-1',role:'ai',content:'The complete generated reply.'}]});
 interaction.playingId='ai-turn-1';interaction.update({status:'speaking',activePlaybackId:'ai-turn-1'});
 interaction.capture.start=async()=>true;
 await interaction.startRecording();assert.equal(stopCount,1);assert.equal(interaction.getSnapshot().messages[0].content,'The complete generated reply.');assert.ok(interaction.getSnapshot().messages[0].interruptedAt);interaction.dispose();
});

test('feedback for a very long conversation has a bounded evidence sample with original answer indices',()=>{
 const answers=Array.from({length:200},(_,index)=>({turnId:`turn-${index}`,text:`Answer number ${index}. `+'Long but genuine example text. '.repeat(80),prompt:'What happened?'}));
 const attempt={answers,turns:answers.flatMap(answer=>[{role:'user',content:answer.text},{role:'ai',content:'Let us discuss that detail.'}])};
 const context=conversationReviewContext(attempt);
 assert.ok(JSON.stringify(context).length<36000);assert.match(context.coverage,/Selected exact excerpts/);
 assert.equal(context.answers.at(-1).answerIndex,199);
 assert.ok(context.answers.every(answer=>attempt.answers[answer.answerIndex].text.includes(answer.text)));
});
