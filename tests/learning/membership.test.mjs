import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
process.env.FORCE_LOCAL_DATA = 'true';
process.env.SPEAKNOW_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-membership-'));
process.env.SPEAKNOW_ORIGIN = 'http://localhost:5198';
process.env.SPEAKNOW_PAYWALL_ENABLED = 'true';
const { reservePractice, finishPractice, membershipSnapshot, executeMetered, usageAudit, recordBrowserUsage } = await import('../../api/_membership.js');
const { provisionMembership, readMembership } = await import('../../api/_membershipStore.js');
const { billingPeriod, effectivePlan, planConfiguration, paywallEnabled } = await import('../../api/_plans.js');
const { catalogueFor, assertTaskAccess } = await import('../../api/_bankAccess.js');
const { countModelRequest, countModelUsage } = await import('../../api/_requestContext.js');
const { default: accounts } = await import('../../api/local-data.js');
const { default: membershipApi } = await import('../../api/membership.js');
const { default: practiceApi } = await import('../../api/speaking-practice.js');
const { default: bankApi } = await import('../../api/question-bank.js');
const user = () => `member-${randomUUID()}`;
const req = (id = user(), body = {}, url = '/api/speaking-feedback') => ({ method: 'POST', url, user: { id, role: 'user' }, body, socket: { remoteAddress: '203.0.113.8' }, headers: { host: 'localhost:5198', origin: 'http://localhost:5198', 'content-type': 'application/json' } });
const res = () => ({ code: 200, headers: {}, chunks: [], headersSent: false, status(code) { this.code = code; return this; }, setHeader(key, value) { this.headers[key] = value; }, json(value) { this.value = value; this.headersSent = true; return this; }, write(chunk) { this.chunks.push(chunk); this.headersSent = true; return true; }, end() { this.headersSent = true; }, on() {}, off() {} });
const reserve = (request, id = randomUUID(), taskId = 'sample-toefl-repeat', now) => reservePractice(request, { id, taskId, kind: 'exam' }, now);

test('Pro prices match the term catalogue and mock and drill allowances are shared across exams', () => {
  const plans = planConfiguration();
  assert.deepEqual([plans.free.monthlyLimits.mock, plans.free.monthlyLimits.drill, plans.free.monthlyLimits.daily], [4, 30, 300]);
  assert.equal(plans.vip.monthlyPrice, 30); assert.equal(plans.vip.monthlyLimits.ai, 600);
  assert.equal(plans.vip.monthlyLimits.mock, null); assert.equal(plans.vip.monthlyLimits.drill, null);
  assert.equal(billingPeriod(Date.UTC(2026,11,31)).end, '2027-01-01T00:00:00.000Z');
});
test('parallel starts cannot exceed the monthly allowance; repeats reserve one slot', async () => {
  const request = req(), id = randomUUID();
  await Promise.all(Array.from({length: 12}, () => reserve(request, id)));
  assert.equal((await membershipSnapshot(request)).usage.drill, 1);
  const results = await Promise.allSettled(Array.from({length: 31}, () => reserve(request)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 29);
  assert.ok(results.filter(result => result.status === 'rejected').every(result => result.reason.code === 'quota_exhausted'));
  assert.equal((await membershipSnapshot(request)).usage.drill, 30);
});
test('cancelling before any billable success releases a reservation idempotently', async () => {
  const request = req(), id = randomUUID(); await reserve(request, id);
  await finishPractice(request, id, true); await finishPractice(request, id, true);
  assert.equal((await membershipSnapshot(request)).usage.drill, 0);
  await reserve(request, id); assert.equal((await membershipSnapshot(request)).usage.drill, 1);
});
test('quick IELTS practice does not consume the shared full mock allowance', async () => {
  const request = req(); await reserve(request, randomUUID(), 'sample-ielts-part1');
  await reserve(request, randomUUID(), 'ielts-full-mock-demo-v1');
  const snapshot = await membershipSnapshot(request);
  assert.equal(snapshot.usage.drill, 1); assert.equal(snapshot.usage.mock, 1);
  for (let index = 0; index < 3; index++) await reserve(request, randomUUID(), 'toefl-mock-campus-v1');
  await assert.rejects(() => reserve(request, randomUUID(), 'ielts-full-mock-demo-v1'), error => error.code === 'quota_exhausted');
});
test('month rollover calculates a fresh allowance without deleting history', async () => {
  const request = req(), before = Date.UTC(2026,9,31,23,59), after = Date.UTC(2026,10,1);
  await reserve(request, randomUUID(), 'sample-toefl-repeat', before);
  assert.equal((await membershipSnapshot(request, before)).usage.drill, 1);
  assert.equal((await membershipSnapshot(request, after)).usage.drill, 0);
  assert.equal(Object.keys((await usageAudit(request.user.id)).sessions).length, 1);
});
test('VIP has usable allowances and expiry restores free entitlements', async () => {
  const request = req(), now = Date.now();
  const membership = { planType: 'vip', subscriptionStatus: 'active', currentPeriodStart: new Date(now-1000).toISOString(), currentPeriodEnd: new Date(now+60000).toISOString(), expiresAt: new Date(now+60000).toISOString() };
  await provisionMembership(request.user.id, membership);
  assert.equal((await membershipSnapshot(request)).effectivePlan, 'vip');
  await reserve(request);
  assert.equal((await membershipSnapshot(request)).usage.drill, 1);
  assert.equal(effectivePlan(membership, now+60001), 'free');
  assert.equal(effectivePlan({...membership, subscriptionStatus:'cancelled'}, now), 'free');
});
test('a private uploaded bank never becomes public merely because an account is VIP', () => {
  const request = req(), now = Date.now(), vip = { planType:'vip', subscriptionStatus:'active', currentPeriodStart:new Date(now-1000).toISOString(), currentPeriodEnd:new Date(now+60000).toISOString() };
  delete process.env.SPEAKNOW_BANK_RIGHTS_VERIFIED;
  assert.ok(catalogueFor(request, null).sets.every(set=>set.isDemo));
  assert.ok(catalogueFor(request, vip).sets.every(set=>set.isDemo));
  assert.throws(()=>assertTaskAccess(request, 'ielts-full-mock-bank-v1', vip), error=>error.code==='bank_access_required');
  process.env.SPEAKNOW_BANK_RIGHTS_VERIFIED='true';
  assert.ok(catalogueFor(request, vip).sets.some(set=>!set.isDemo));
  assert.ok(catalogueFor(request, null).sets.every(set=>set.isDemo));
  delete process.env.SPEAKNOW_BANK_RIGHTS_VERIFIED;
});
test('completed AI requests replay without provider calls or extra product usage', async () => {
  const request = req(user(), {sessionId:randomUUID(), turnId:'turn-1', action:'conversation_stream'}, '/api/voice-chat');
  let calls=0;
  const handler=async(_request,response)=>{calls++;countModelRequest();countModelUsage({prompt_tokens:12,completion_tokens:7});response.status(200).json({reply:'One provider result'});};
  const first=res(), second=res(); await executeMetered(request,first,handler); await executeMetered({...request},second,handler);
  assert.equal(calls,1);assert.deepEqual(first.value,second.value);
  const ledger=await usageAudit(request.user.id), operation=Object.values(ledger.operations)[0];
  assert.equal(operation.charges,1);assert.equal(operation.measurements.inputTokens,12);assert.equal(operation.measurements.outputTokens,7);
});
test('in-flight duplicate requests cannot invoke the provider concurrently', async () => {
  const request=req(user(),{requestId:'concurrent-logical-request'},'/api/test');let calls=0, release;
  const blocker=new Promise(resolve=>release=resolve);
  const first=executeMetered(request,res(),async(_q,response)=>{calls++;await blocker;response.json({ok:true});});
  await new Promise(resolve=>setTimeout(resolve,80));
  await assert.rejects(()=>executeMetered({...request},res(),async()=>calls++), error=>error.code==='request_in_progress');
  release();await first;assert.equal(calls,1);
});
test('failure without provider use is refundable, retry succeeds once, and changed content conflicts', async () => {
  const owner=user(),request=req(owner,{requestId:'retry-failed'},'/api/test');
  await executeMetered(request,res(),async(_q,response)=>response.status(503).json({error:'provider unavailable'}));
  assert.equal(Object.values((await usageAudit(owner)).operations)[0].charges,0);
  const next=res();await executeMetered({...request},next,async(_q,response)=>response.json({ok:true}));
  assert.equal(next.value.ok,true);
  await assert.rejects(()=>executeMetered(req(owner,{requestId:'retry-failed',changed:true},'/api/test'),res(),async()=>{}), error=>error.code==='idempotency_conflict');
});
test('failed provider calls retain their cost telemetry without consuming product allowance', async () => {
  const request = req(user(), { requestId: 'provider-failed-after-usage' }, '/api/test');
  await executeMetered(request, res(), async (_request, response) => {
    countModelRequest(); countModelUsage({ prompt_tokens: 30, completion_tokens: 10 });
    response.status(503).json({ error: 'Response could not be delivered' });
  });
  const item = Object.values((await usageAudit(request.user.id)).operations)[0];
  assert.equal(item.charges, 0); assert.equal(item.measurements.providerRequests, 1);
  assert.equal(item.measurements.inputTokens, 30); assert.equal(item.measurements.outputTokens, 10);
});
test('missing usage and engineering fixtures never become actual token measurements', async () => {
  const request=req(user(),{requestId:'unknown-usage'},'/api/test');
  await executeMetered(request,res(),async(_q,response)=>{countModelRequest();countModelUsage({});response.json({ok:true});});
  let item=Object.values((await usageAudit(request.user.id)).operations)[0];assert.equal(item.measurements.inputTokens,null);assert.equal(item.measurements.source,'unreported');
  process.env.SPEAKNOW_ENGINEERING_FIXTURE='true';
  const fixture=req(user(),{requestId:'fixture-usage'},'/api/test');
  await executeMetered(fixture,res(),async(_q,response)=>{countModelUsage({prompt_tokens:20,completion_tokens:5});response.json({ok:true});});
  item=Object.values((await usageAudit(fixture.user.id)).operations)[0];assert.equal(item.measurements.source,'fixture');
  delete process.env.SPEAKNOW_ENGINEERING_FIXTURE;
});
test('daily session settlement uses server time, never a client-reported duration', async () => {
  const request=req(),id=randomUUID(),now=Date.now();
  await reservePractice(request,{id,kind:'daily'},now);
  const operation=req(request.user.id,{sessionId:id,turnId:'one',action:'conversation_stream'},'/api/voice-chat');
  await executeMetered(operation,res(),async(_q,response)=>response.json({reply:'A real response'}));
  await finishPractice(request,id,false,now+42000);await finishPractice(request,id,false,now+90000);
  assert.equal((await membershipSnapshot(request)).usage.daily,42);
  await assert.rejects(()=>executeMetered({...operation,body:{...operation.body,turnId:'two'}},res(),async()=>{}),error=>error.code==='session_closed');
});
test('admitted daily conversations finish past the initial time and AI allowance, then settle actual time',async()=>{
 const previous=process.env.SPEAKNOW_FREE_AI_REQUESTS;process.env.SPEAKNOW_FREE_AI_REQUESTS='1';
 const request=req(),id=randomUUID(),now=Date.now(),started=now-420000;
 try {
  await reservePractice(request,{id,kind:'daily'},started);
  for(const turnId of ['first','second'])await executeMetered(req(request.user.id,{sessionId:id,turnId,action:'conversation_stream'},'/api/voice-chat'),res(),async(_q,response)=>response.json({reply:'Delivered conversation reply'}));
  await finishPractice(request,id,false,now);
  const snapshot=await membershipSnapshot(request,now);assert.equal(snapshot.usage.daily,420);assert.equal(snapshot.usage.ai,2);
  await assert.rejects(()=>reservePractice(request,{id:randomUUID(),kind:'daily'},now),error=>error.code==='quota_exhausted');
  const attempt={id,track:'daily',taskId:'daily-cafe',answers:[{text:'I enjoyed this conversation.',inputMode:'text'}]};
  await executeMetered(req(request.user.id,{attempt},'/api/speaking-feedback'),res(),async(_q,response)=>response.json({summary:'Session feedback remains available.'}));
 } finally { if(previous===undefined)delete process.env.SPEAKNOW_FREE_AI_REQUESTS;else process.env.SPEAKNOW_FREE_AI_REQUESTS=previous; }
});
test('shadow mode records overages while payments and the hard paywall stay off', async () => {
  process.env.SPEAKNOW_PAYWALL_ENABLED='false';
  const request=req();await Promise.all([reserve(request),reserve(request),reserve(request)]);
  const status=await membershipSnapshot(request);assert.equal(status.usage.drill,3);assert.equal(status.paymentsEnabled,false);assert.equal(status.paywallEnabled,false);
  process.env.SPEAKNOW_PAYWALL_ENABLED='true';
});
async function call(handler,body,headers={}){const response=res();await handler({method:'POST',url:'/api/test',body,socket:{remoteAddress:'203.0.113.10'},headers:{host:'localhost:5198',origin:'http://localhost:5198','content-type':'application/json',...headers}},response);return response;}
async function account(){const result=await call(accounts,{action:'register',email:`${randomUUID()}@example.invalid`,full_name:'Membership test',password:'safe-test-password'});assert.equal(result.code,200);const cookies=result.headers['Set-Cookie'];return {id:result.value.data.id,headers:{cookie:cookies.map(s=>s.split(';')[0]).join('; '),'x-csrf-token':cookies.find(s=>s.startsWith('speaknow_csrf=')).split(';')[0].split('=')[1]}};}
test('HTTP API isolates accounts, rejects forged VIP changes and ignores requested owner IDs', async () => {
  const a=await account(),b=await account();
  const forged=await call(accounts,{action:'updateMe',planType:'vip',role:'admin'},a.headers);assert.equal(forged.code,400);
  assert.equal((await call(membershipApi,{action:'provision',planType:'vip'},a.headers)).code,400);
  const status=await call(membershipApi,{action:'status',userId:b.id},a.headers);assert.equal(status.value.membership.userId,a.id);
  assert.equal(await readMembership(a.id),null);
  const start=await call(membershipApi,{action:'start',id:'account-private-practice',taskId:'sample-toefl-repeat',kind:'exam'},a.headers);assert.equal(start.code,200);
  const stolen=await call(membershipApi,{action:'cancel',id:'account-private-practice',userId:a.id},b.headers);assert.equal(stolen.code,404);
  const leak=await call(practiceApi,{action:'save',attempt:{id:randomUUID(),track:'exam',taskId:'ielts-full-mock-bank-v1',answers:[{questionIndex:0,text:'A guessed answer.'}]}},b.headers);assert.equal(leak.code,403);
  const injected=await call(accounts,{action:'createEntity',entity:'VoiceSession',data:{report:{learning:{id:'injected-learning'}}}},a.headers);assert.equal(injected.code,400);
  const bank=await call(bankApi,{action:'catalogue',userId:a.id,planType:'vip'},b.headers);assert.equal(bank.code,200);assert.ok(bank.value.sets.every(set=>set.isDemo));
});

test('configured VIP allows higher usage, while an enrolled mock survives expiry and new private starts do not', async () => {
  for (const [key,value] of Object.entries({SPEAKNOW_VIP_TOEFL_MONTHLY:'5',SPEAKNOW_VIP_IELTS_MONTHLY:'3',SPEAKNOW_VIP_AI_REQUESTS:'200',SPEAKNOW_BANK_RIGHTS_VERIFIED:'true'}))process.env[key]=value;
  const request=req(),now=Date.now(),membership={planType:'vip',subscriptionStatus:'active',currentPeriodStart:new Date(now-1000).toISOString(),currentPeriodEnd:new Date(now+60000).toISOString(),expiresAt:new Date(now+60000).toISOString()};
  try{
    await provisionMembership(request.user.id,membership);
    await Promise.all([reserve(request),reserve(request),reserve(request)]);assert.equal((await membershipSnapshot(request)).usage.drill,3);
    const id=randomUUID();await reserve(request,id,'ielts-full-mock-bank-v1');
    await provisionMembership(request.user.id,{...membership,currentPeriodEnd:new Date(now-1).toISOString(),expiresAt:new Date(now-1).toISOString()});
    const continuation=req(request.user.id,{taskId:'ielts-full-mock-bank-v1',sessionId:id,questionIndex:1},'/api/exam-examiner');
    const reply=res();await executeMetered(continuation,reply,async(_q,response)=>response.json({text:'Continue the enrolled mock.'}));assert.equal(reply.code,200);
    await assert.rejects(()=>reserve(request,randomUUID(),'ielts-full-mock-bank-v1'),error=>error.code==='bank_access_required');
  }finally{for(const key of ['SPEAKNOW_VIP_TOEFL_MONTHLY','SPEAKNOW_VIP_IELTS_MONTHLY','SPEAKNOW_VIP_AI_REQUESTS','SPEAKNOW_BANK_RIGHTS_VERIFIED'])delete process.env[key];}
});

test('production cannot enable a hard paywall while payment integration is unavailable',()=>{
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
 try{assert.equal(planConfiguration().vip.monthlyPrice,30);assert.equal(paywallEnabled(),false);}
 finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});


test('daily sessions cannot smuggle a private exam enrollment into the catalogue', async()=>{
 const request=req();await assert.rejects(()=>reservePractice(request,{id:randomUUID(),kind:'daily',taskId:'ielts-full-mock-bank-v1'}),error=>error.code==='invalid_session');
 assert.equal(Object.keys((await usageAudit(request.user.id)).sessions).length,0);
});
test('browser ASR duration is idempotent, account-bound and explicitly not a provider billing receipt',async()=>{
 const request=req(),sessionId=randomUUID(),id=randomUUID();await reserve(request,sessionId);
 const measurement={sessionId,id,usageType:'browser_asr_seconds',seconds:12.5};
 const first=await recordBrowserUsage(request,measurement);await recordBrowserUsage(request,measurement);
 assert.equal(first.source,'browser-observed');assert.equal(first.billingConfirmed,false);assert.equal((await usageAudit(request.user.id)).measurements.length,1);
 await assert.rejects(()=>recordBrowserUsage(req(),measurement),error=>error.code==='session_not_found');
 await assert.rejects(()=>recordBrowserUsage(request,{...measurement,seconds:5}),error=>error.code==='measurement_conflict');
});
