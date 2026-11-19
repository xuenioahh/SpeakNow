import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.env.SPEAKNOW_SMOKE_URL;
if (!base && process.argv.includes('--if-configured')) process.exit(0);
if (!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(base || '')) throw Error('Expected a Vercel HTTPS deployment URL');
const users=[], checks=[], cookies=new Map();
async function call(route,body,expected=200,anonymous=false){
 const headers={'Content-Type':'application/json',Origin:base};
 if(process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass']=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
 if(!anonymous){ headers.Cookie=[...cookies].map(([k,v])=>`${k}=${v}`).join('; ');if(cookies.has('speaknow_csrf'))headers['x-csrf-token']=cookies.get('speaknow_csrf'); }
 const r=await fetch(base+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0];const i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
 const raw=await r.text();assert.equal(r.status,expected,`${route} ${body?.action||''}: ${raw.slice(0,240)}`);
 return body?JSON.parse(raw):raw;
}
try{
 assert.match((await call('/')),/<html/i);checks.push('page');
 (await call('/api/speaking-practice',{action:'list'},401,true));checks.push('anonymous blocked');
 const email=`deploy-${randomUUID()}@example.invalid`,password=randomUUID();
 const user=(await call('/api/local-data',{action:'register',email,password,full_name:'Deployment verification'})).data;users.push(user.id);
 assert.equal((await call('/api/local-data',{action:'me'})).data.id,user.id);checks.push('register and session');
 const id=randomUUID(),recordingId=randomUUID();
 const attempt={id,track:'daily',taskId:'daily',createdAt:new Date().toISOString(),answers:[{text:'Synthetic deployment storage check.',questionIndex:0,inputMode:'voice',recordingId}]};
 assert.equal((await call('/api/speaking-practice',{action:'save',attempt})).storageMode,'mongodb');
 const data=Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64');
 for(let i=0;i<2;i++)assert.equal((await call('/api/speaking-practice',{action:'upload',id,recordingId,mime:'audio/webm',data})).ok,true);
 assert.equal((await call('/api/speaking-practice',{action:'media',id,recordingId})).data,data);checks.push('first recording upload, retry and byte retrieval');
 (await call('/api/membership',{action:'status'}));(await call('/api/membership',{action:'usage'}));checks.push('membership and usage');
 (await call('/api/local-data',{action:'logout'}));
 (await call('/api/local-data',{action:'login',email,password}));
 assert.equal((await call('/api/speaking-practice',{action:'get',id})).id,id);assert.ok((await call('/api/speaking-practice',{action:'list'})).some(a=>a.id===id));checks.push('login and saved history');
 (await call('/api/local-data',{action:'logout'}));
 const other=(await call('/api/local-data',{action:'register',email:`deploy-${randomUUID()}@example.invalid`,password:randomUUID(),full_name:'Isolation verification'})).data;users.push(other.id);
 (await call('/api/speaking-practice',{action:'media',id,recordingId},404));checks.push('cross-account media blocked');
 (await call('/api/local-data',{action:'logout'}));
 (await call('/api/local-data',{action:'login',email,password}));(await call('/api/speaking-practice',{action:'delete',id}));(await call('/api/local-data',{action:'logout'}));
 console.log(JSON.stringify({ok:true,base,checks},null,2));
 fs.writeFileSync('smoke-result.json',JSON.stringify({ok:true,base,checks,at:new Date().toISOString()},null,2));
}finally{console.log('Synthetic account cleanup IDs: '+JSON.stringify(users));fs.writeFileSync('smoke-cleanup.json',JSON.stringify({users}),{mode:0o600});}
