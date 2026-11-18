import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStorageHealth } from '../../api/_storageHealth.js';
import { securityRequest } from '../../api/_securityStore.js';
const env={SUPABASE_URL:'https://project.invalid',SUPABASE_SERVICE_ROLE_KEY:'secret-fixture',FORCE_LOCAL_DATA:'false'};
const good=async(url,options)=>{
  if(url.includes('speaknow_commit_usage'))return new Response(JSON.stringify({code:'P0001',message:'invalid_usage'}),{status:400});
  if(url.includes('speaknow_consume_limit'))return new Response('false');
  if(url.includes('speaknow_release_limit'))return new Response(null,{status:204});
  assert.ok(url.endsWith('&limit=0'));assert.equal(options.method,'GET');return new Response('[]');
};
test('production gate detects the exact missing membership migration despite healthy base tables',async()=>{
  const result=await checkStorageHealth({env,fetcher:async(url,options)=>/app_memberships|app_usage_ledgers|speaknow_release_limit|speaknow_commit_usage/.test(url)?new Response(JSON.stringify({code:url.includes('/rpc/')?'PGRST202':'PGRST205'}),{status:404}):good(url,options)});
  assert.equal(result.ok,false);assert.equal(result.checks.filter(row=>!row.ok).length,4);assert.ok(!JSON.stringify(result).includes('secret-fixture'));
});
test('complete schema passes without reading users or mutating counters and ledger rows',async()=>{
  const result=await checkStorageHealth({env,fetcher:async(url,options)=>{if(options.body){const body=JSON.parse(options.body);assert.ok(body.increment_by===0||body.decrement_by===0||body.owner_id===null);}return good(url,options);}});
  assert.equal(result.ok,true);assert.equal(result.checks.length,13);
});
test('bad credentials, connection failures and production local storage cannot pass the gate',async()=>{
  for(const fetcher of [async()=>new Response('{}',{status:401}),async()=>{throw new Error('connection failed');}])assert.equal((await checkStorageHealth({env,fetcher})).ok,false);
  assert.equal((await checkStorageHealth({env:{...env,FORCE_LOCAL_DATA:'true'},fetcher:good})).ok,false);
});
test('public storage failures hide internal SQL, paths, identifiers and secrets',async()=>{
  const before=globalThis.fetch,log=console.error;const logs=[];console.error=(...value)=>logs.push(value.join(' '));
  globalThis.fetch=async()=>new Response(JSON.stringify({code:'PGRST205',message:'secret user id sql details'}),{status:404});
  try{await assert.rejects(()=>securityRequest('app_usage_ledgers',{query:'user_id=eq.private-user'}),error=>error.status===503&&error.code==='storage_unavailable'&&!/sql|supabase|fallback|private-user/i.test(error.message));assert.ok(logs[0].includes('PGRST205'));assert.ok(!logs[0].includes('private-user'));assert.ok(!logs[0].includes('secret'));}finally{globalThis.fetch=before;console.error=log;}
});
