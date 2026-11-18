import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceInteraction } from '../../src/lib/voice/VoiceInteraction.js';
import { conversationMemory } from '../../shared/conversationMemory.js';
import { VisionTimeline } from '../../src/lib/visionTimeline.js';
import { validateAttempt } from '../../shared/speakingTasks.js';

test('continuous mode returns to capture after 25 controlled playback events and pauses without losing words', async()=>{
  let listener, captures=0;
  const histories=[];
  const audio={subscribe:fn=>{listener=fn;return()=>{};},stop(){},async playAIVoice(text,_gender,{playbackId}){listener({type:'start',playbackId,text});await Promise.resolve();listener({type:'end',playbackId,reason:'ended'});return true;}};
  const session=new VoiceInteraction({audio,request:async(text,{history,onDelta})=>{histories.push(history);onDelta('A reply.');return{reply:`Response to ${text}`,source:'ai'};}});
  session.capture.start=async()=>{captures++;session.update({status:'listening'});return true;};
  session.sessionId='continuous-session-001';
  await session.startContinuous();
  for(let index=0;index<25;index++){
    session.captureEvent({type:'stopped',submit:true,final:index===0?'I prefer tea because coffee makes me nervous.':`Topic ${index}`,interim:'',text:`Topic ${index}`,t1:index*10,t2:index*10+1});
    for(let tick=0;tick<20&&session.getSnapshot().messages.filter(m=>m.role==='ai').length<=index;tick++)await new Promise(resolve=>setImmediate(resolve));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(session.getSnapshot().status,'listening');
    assert.equal(session.ended,undefined);
  }
  assert.equal(captures,26);
  assert.equal(histories[24].filter(message=>message.role==='user').length,25);
  assert.match(histories[24][0].content,/prefer tea/);
  session.update({finalText:'Keep this unfinished reply'});
  await session.pauseContinuous();assert.equal(session.getSnapshot().continuous,false);
  assert.equal(await session.startContinuous(),false);assert.equal(session.getSnapshot().finalText,'Keep this unfinished reply');
  await session.complete();assert.equal(session.getSnapshot().status,'completed');session.dispose();
});

test('failed model request keeps the same reply for retry and suspends automatic capture',async()=>{
 let attempts=0,captures=0;
 const session=new VoiceInteraction({audio:{subscribe:()=>()=>{},stop(){}},requestTimeoutMs:20,request:async()=>{attempts++;return new Promise(()=>{});}});
 session.capture.start=async()=>{captures++;return true;};
 await session.startContinuous();
 session.captureEvent({type:'stopped',submit:true,final:'Keep my original words.',interim:'',text:'Keep my original words.',t1:1,t2:2});
 await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(session.getSnapshot().continuous,false);assert.equal(session.getSnapshot().retryable,true);assert.equal(captures,1);
 assert.equal(session.getSnapshot().messages.filter(message=>message.role==='user').length,1);
 assert.equal(session.retryRequest(),true);assert.equal(attempts,2);assert.equal(session.getSnapshot().messages.filter(message=>message.role==='user').length,1);
 session.dispose();
});

test('unconfirmed recognition never auto-submits and microphone denial leaves a recoverable paused state',async()=>{
 let requests=0;
 const session=new VoiceInteraction({request:async()=>{requests++;return{reply:'unused'};},environment:{setTimeout,clearTimeout,setInterval,clearInterval,window:{SpeechRecognition:class{}},navigator:{mediaDevices:{getUserMedia:async()=>{throw Object.assign(new Error('denied'),{name:'NotAllowedError'});}}}}});
 assert.equal(await session.startContinuous(),false);assert.equal(session.getSnapshot().continuous,false);assert.match(session.getSnapshot().error,/blocked/);
 session.update({continuous:true});session.captureEvent({type:'stopped',submit:true,final:'Some',interim:'unconfirmed words',text:'Some unconfirmed words'});
 assert.equal(requests,0);assert.equal(session.getSnapshot().continuous,false);assert.equal(session.getSnapshot().typedText,'Some unconfirmed words');session.dispose();
});

test('short history stays whole; long history retains quoted preference and recent turns within budget',()=>{
 const history=[{role:'user',content:'I prefer tea because coffee makes me nervous.'},...Array.from({length:80},(_,i)=>({role:i%2?'ai':'user',content:`Message ${i} about a weekend trip. `+'Specific conversation detail. '.repeat(8)}))];
 const short=conversationMemory(history.slice(0,5),'What tea?');assert.equal(short.recent.length,5);assert.equal(short.summary,'');
 const long=conversationMemory(history,'Do you remember what I prefer to drink?');assert.match(long.summary,/prefer tea/);assert.match(long.recent.at(-1).content,/Message 79/);assert.ok(long.summary.length+JSON.stringify(long.recent).length<8500);
});

test('vision intervals filter single-frame noise, split speakers, preserve gaps and link turn IDs',()=>{
 const timeline=new VisionTimeline('vision-session-001');
 for(let i=0;i<12;i++)timeline.sample({time:i*.25,facePresent:true,head:0,headVertical:.4,posture:0},{speaker:'user',turnId:'turn-1'});
 timeline.sample({time:3,head:1,facePresent:true},{speaker:'user',turnId:'turn-1'});
 for(let i=13;i<28;i++)timeline.sample({time:i*.25,head:0,facePresent:true},{speaker:'user',turnId:'turn-1'});
 assert.equal(timeline.summary().events.length,0);
 for(let i=28;i<44;i++)timeline.sample({time:i*.25,head:-.4,facePresent:true},{speaker:'user',turnId:'turn-2'});
 for(let i=44;i<56;i++)timeline.sample({time:i*.25,head:-.4,facePresent:true},{speaker:'ai',turnId:'turn-2'});
 timeline.sample({time:20,facePresent:false},{speaker:'user',turnId:'turn-3'});
 timeline.flush();
 const events=timeline.summary().events;
 assert.ok(events.some(event=>event.kind==='head-left'&&event.speaker==='user'&&event.turnId==='turn-2'));
 assert.ok(events.some(event=>event.kind==='head-left'&&event.speaker==='ai'));
 assert.equal(events.some(event=>event.kind==='face-missing'),false);
 assert.ok(events.every(event=>event.end<20));
});

test('daily save retains more than 30 replies and all timestamped partner turns',()=>{
 const answers=Array.from({length:40},(_,i)=>({questionIndex:i,turnId:`turn-${i}`,text:`Reply ${i}`,prompt:'Conversation',inputMode:'text',startSeconds:i*10}));
 const turns=answers.flatMap((answer,i)=>[{role:'user',content:answer.text,turnId:answer.turnId,startedAt:1000+i*10},{role:'ai',content:`Partner reply ${i}`,turnId:answer.turnId}]);
 const result=validateAttempt({id:'long-daily-session-001',track:'daily',taskId:'daily-cafe',answers,turns});
 assert.equal(result.answers.length,40);assert.equal(result.turns.length,80);assert.equal(result.turns[0].startedAt,1000);assert.equal(result.answers[39].turnId,'turn-39');
});

test('refresh of an unanswered model turn preserves its identity and retry does not duplicate it',async()=>{
 const history=[{id:'user-turn-1',turnId:'turn-1',role:'user',content:'I prefer tea.'},{id:'ai-turn-1',turnId:'turn-1',role:'ai',content:'Which type?'},{id:'user-turn-2',turnId:'turn-2',role:'user',content:'Mint tea.',recordingId:'saved-recording-002'}];
 let sent;
 const session=new VoiceInteraction({initialMessages:history,request:async(_text,options)=>{sent=options;return{reply:'Mint is a refreshing choice.'};}});session.configure({autoPlay:false});
 assert.equal(session.getSnapshot().retryable,true);assert.equal(session.retryRequest(),true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sent.turnId,'turn-2');assert.equal(session.getSnapshot().messages.filter(message=>message.role==='user').length,2);
 session.setTypedText('What would you drink?');await session.send();await new Promise(resolve=>setImmediate(resolve));assert.equal(sent.turnId,'turn-3');session.dispose();
});
