import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
const execFile = promisify(callback), bin = '/Library/PostgreSQL/17/bin';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'speaknow-membership-pg-'));
const data = path.join(directory, 'cluster'), socket = path.join(directory, 'socket'); await fs.mkdir(socket);
const args = ['-h', socket, '-p', '55439', '-U', os.userInfo().username, '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = async text => (await execFile(path.join(bin, 'psql'), [...args, '-c', text], { maxBuffer: 1000000 })).stdout.trim();
const passed = [];let started = false;
try {
 await execFile(path.join(bin, 'initdb'), ['-D',data,'-A','trust','--no-locale','-E','UTF8']);
 await execFile(path.join(bin, 'pg_ctl'), ['-D',data,'-l',path.join(directory,'server.log'),'-o',`-h '' -k ${socket} -p 55439`,'-w','start']); started = true;
 await sql("create role anon;create role authenticated;create role service_role;create table public.app_users(id text primary key);create table public.app_usage_counters(key text primary key,count bigint,until_at timestamptz);");
 await execFile(path.join(bin,'psql'), [...args,'-f','supabase/membership_20261029.sql']);passed.push('Migration applies to PostgreSQL 17');
 const attempts = await Promise.all(Array.from({length:20},(_,index)=>sql(`select public.speaknow_commit_usage('concurrent-owner',0,'{"sessions":{},"operations":{},"measurements":[],"winner":${index}}'::jsonb)`)));
 assert.equal(attempts.filter(value=>value==='t').length,1);passed.push('20 simultaneous CAS attempts have exactly one winner');
 await Promise.all(Array.from({length:12}, async()=>{
  for(let retry=0;retry<20;retry++){
   const row=JSON.parse(await sql("select json_build_object('revision',revision,'state',state) from app_usage_ledgers where user_id='concurrent-owner'"));
   const state={...row.state,count:(row.state.count||0)+1};
   const committed=await sql(`select public.speaknow_commit_usage('concurrent-owner',${row.revision},'${JSON.stringify(state).replaceAll("'","''")}'::jsonb)`);
   if(committed==='t')return;
  }throw new Error('CAS retries exhausted');
 }));
 assert.equal(await sql("select state->>'count' from app_usage_ledgers where user_id='concurrent-owner'"),'12');passed.push('Concurrent revision retries retain every committed update');
 for(const role of ['anon','authenticated']){
  await assert.rejects(()=>sql(`set role ${role};select * from app_usage_ledgers;`),/permission denied/);
  await assert.rejects(()=>sql(`set role ${role};select public.speaknow_commit_usage('other-account',0,'{}'::jsonb);`),/permission denied/);
  await assert.rejects(()=>sql(`set role ${role};update app_memberships set plan_type='vip';`),/permission denied/);
 }
 passed.push('Anonymous and authenticated DB roles cannot read ledgers, self-upgrade or invoke the service RPC');
 assert.equal(await sql("set role service_role;select public.speaknow_commit_usage('service-owner',0,'{}'::jsonb);"),'t');passed.push('Service role can commit through the authorized RPC');
 await sql("insert into app_usage_counters values('token-test',100000,now()+interval '1 day');select speaknow_release_limit('token-test',99000);");assert.equal(await sql("select count from app_usage_counters where key='token-test'"),'1000');await assert.rejects(()=>sql("set role authenticated;select speaknow_release_limit('token-test',1000);"),/permission denied/);passed.push('Unused reservations refund atomically and browser roles cannot refund their own budgets');
 await fs.writeFile('docs/comprehensive-2026-10-29/postgres-results.json',JSON.stringify({passed,environment:'Disposable local PostgreSQL 17 cluster; exact migration, genuine concurrent connections and database permissions; no production database modified.'},null,2)+'\n');
 console.log(JSON.stringify({passed},null,2));
} finally {
 if(started)await execFile(path.join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop']).catch(()=>{});
 await fs.rm(directory,{recursive:true,force:true});
}
