import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getSpeakingTask, validateAttempt, validateFeedback } from '../../shared/speakingTasks.js';
import { mergeLearningRecords, learningInsights } from '../../src/lib/learningDashboard.js';
const answer = (task, questionIndex, text='I learned to save money by cooking at home.') => ({ questionIndex, questionId:task.questions[questionIndex].questionId, text, recordingId:randomUUID(), durationSeconds:12, inputMode:'voice' });

test('full mocks use ordered source questions and a related Part 3, with real step limits',()=>{
 for(const id of ['ielts-full-mock-bank-v1','ielts-full-mock-demo-v1']){
  const task=getSpeakingTask(id);assert.ok(task?.isFullMock);assert.deepEqual([...new Set(task.steps.map(step=>step.part))],[1,2,3]);
  assert.equal(task.steps.filter(step=>step.type==='part2').length,1);
  const card=task.steps.find(step=>step.type==='part2');assert.equal(card.preparationSeconds,60);assert.equal(card.answerSeconds,120);
  const part2Source=getSpeakingTask(card.sourceSetId);assert.ok(task.steps.filter(step=>step.part===3).every(step=>step.sourceSetId===part2Source.relatedSetId));
  const saved=validateAttempt({id:randomUUID(),track:'exam',taskId:id,practiceMode:'mock',answers:task.questions.map((_,index)=>answer(task,index))});
  assert.equal(saved.completed,true);assert.deepEqual([...new Set(saved.answers.map(a=>a.part))],[1,2,3]);
 }
});
test('part retries are bound to the same mock, while partial and duplicate submissions stay distinguishable',()=>{
 const task=getSpeakingTask('ielts-full-mock-bank-v1'),indices=task.steps.flatMap((step,index)=>step.part===3?[index]:[]);
 const saved=validateAttempt({id:randomUUID(),track:'exam',taskId:task.id,part:3,answers:indices.map(index=>answer(task,index))});assert.equal(saved.completed,true);assert.equal(saved.part,3);
 assert.equal(validateAttempt({id:randomUUID(),track:'exam',taskId:task.id,answers:[answer(task,0)]}).completed,false);
 assert.throws(()=>validateAttempt({id:randomUUID(),track:'exam',taskId:task.id,part:3,answers:[answer(task,0)]}),/different IELTS part/);
 assert.throws(()=>validateAttempt({id:randomUUID(),track:'exam',taskId:task.id,answers:[answer(task,0),answer(task,0)]}),/twice/);
});
test('dimension and Part feedback survive only with exact evidence from the corresponding answer',()=>{
 const task=getSpeakingTask('ielts-full-mock-bank-v1'),saved=validateAttempt({id:randomUUID(),track:'exam',taskId:task.id,answers:[answer(task,0)]});
 const feedback=validateFeedback({summary:'A transcript summary.',improvements:[],dimensions:{grammar:{observation:'Specific use of a gerund.',quote:'cooking at home',answerIndex:0,suggestion:'Keep developing this detail.'},lexical:{observation:'Invented',quote:'unspoken words',answerIndex:0}},parts:[{part:1,summary:'Developed answer.',quote:'cooking at home',answerIndex:0},{part:3,summary:'Wrong part.',quote:'cooking at home',answerIndex:0}]},saved);
 assert.ok(feedback.dimensions.grammar);assert.equal(feedback.dimensions.lexical,undefined);assert.deepEqual(feedback.parts.map(part=>part.part),[1]);assert.equal(feedback.pronunciation,null);assert.equal(feedback.score,null);
});
test('Dashboard deduplicates remote learning records and device attempts without losing old reports',()=>{
 const a={id:'learning-record-one',ownerId:'owner-one',exam:'ielts',track:'exam',taskId:'same-task',title:'Practice',createdAt:'2026-10-29T01:00:00Z',answers:[{questionIndex:0,prompt:'Why?',text:'Because it helps.',recordingId:'recording-one',durationSeconds:30}]};
 const records=mergeLearningRecords({ownerId:'owner-one',attempts:[a,{...a,id:'other-owner-record',ownerId:'owner-two'}],voiceSessions:[{id:a.id,report:{learning:a}},{id:'legacy-record',scoring_standard:'daily',created_date:'2026-10-28T01:00:00Z',duration_seconds:40,report:{totalScore:9,source:'ai'}}],presentations:[]});
 assert.equal(records.length,2);assert.equal(records.filter(record=>record.id===a.id).length,1);
 const views=learningInsights(records,Date.parse('2026-10-29T10:00:00Z'));assert.equal(views.total,2);assert.equal(views.seconds,70);assert.equal(views.counts.ielts,1);assert.equal(views.counts.daily,1);assert.equal(views.pairs.length,0);
});
test('insights compare actual same-question transcripts and ignore unsupported corrections and fabricated scores',()=>{
 const parent={id:'parent-record',exam:'toefl',track:'exam',taskId:'same-task',title:'Same task',createdAt:'2026-10-28T01:00:00Z',answers:[{questionIndex:0,prompt:'Why?',text:'I like it.',recordingId:'clip-1',durationSeconds:10}]};
 const child={...parent,id:'child-record',parentId:parent.id,createdAt:'2026-10-29T01:00:00Z',answers:[{...parent.answers[0],text:'I like it because it saves time.'}],feedback:{score:6,improvements:[{answerIndex:0,quote:'saves time',reason:'Develop the reason.',suggestion:'Give an example.',exercise:'Explain when it saved time.'},{answerIndex:0,quote:'invented quote',reason:'Fake grammar'}]}};
 const views=learningInsights(mergeLearningRecords({attempts:[parent,child]}),Date.parse('2026-10-29T10:00:00Z'));
 assert.equal(views.pairs.length,1);assert.equal(views.pairs[0].answers[0].changed,true);assert.equal(views.evidenceCount,1);assert.equal(views.next.quote,'saves time');assert.equal('score' in views,false);
});
test('empty or undated data never invents practice time, progress or recommendations',()=>{
 const views=learningInsights(mergeLearningRecords({attempts:[{id:'invalid-date',exam:'ielts',title:'No date',createdAt:'invalid',answers:[]}]}));
 assert.equal(views.total,0);assert.equal(views.seconds,null);assert.equal(views.next,null);assert.deepEqual(views.pairs,[]);assert.ok(views.week.every(day=>day.count===0));
});
