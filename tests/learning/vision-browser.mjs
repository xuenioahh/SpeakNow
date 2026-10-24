import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const context=await browser.newContext({permissions:['camera']});const page=await context.newPage();
const errors=[],network=[],diagnostics=[];page.on('console',message=>{if(message.type()==='warning'||message.type()==='error')diagnostics.push(message.text());});page.on('requestfailed',r=>diagnostics.push(`${r.url()}: ${r.failure()?.errorText}`));page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')network.push(r.url());});
let result;
try {
 await page.goto('http://127.0.0.1:5194/voice/chat?scenario=hotel');
 await page.getByRole('button',{name:'Enable camera analysis (optional)'}).click();
 await page.getByText('On-device analysis · video is not saved',{exact:true}).waitFor({timeout:40000});
 await page.waitForTimeout(4000);
 await page.getByRole('textbox',{name:'Your reply'}).fill('I would like a quiet room please.');
 await page.getByRole('button',{name:'Finish & review'}).click();await page.waitForURL('**/practice/review?id=*');
 const value=await page.evaluate(async()=>{const id=new URL(location.href).searchParams.get('id'),r=indexedDB.open('speaknow-learning-v1');const db=await new Promise(resolve=>r.onsuccess=()=>resolve(r.result));const q=db.transaction('attempts','readonly').objectStore('attempts').get(id);const a=await new Promise(resolve=>q.onsuccess=()=>resolve(q.result));db.close();return a;});
 assert.ok(value.visualEvidence.windows.some(w=>Number.isFinite(w.observations?.luminance)),'real fake-device pixels produce measured luminance');
 assert.ok(value.visualEvidence.windows.every(w=>!Object.keys(w.metrics).length),'fake device pattern is not a human face');
 assert.equal(value.visualEvidence.rawVideoStored,false);assert.deepEqual(errors,[]);
 assert.ok(network.every(url=>url.includes('/api/admin-track')||url.includes('/api/local-data')),'no frame or media upload');
 result={status:'passed',source:'Real MediaPipe models and WASM; Chromium synthetic video test pattern. No human accuracy claim.',windows:value.visualEvidence.windows,postRequests:network,pageErrors:errors,diagnostics};
 console.log('PASS real MediaPipe initialisation, frame luminance, missing-face handling and no raw upload');
} catch(error) { result={status:'failed',error:String(error),body:(await page.locator('body').innerText()).slice(0,4000),pageErrors:errors,diagnostics};throw error; }
finally {await fs.mkdir('docs/product-2026-10-24',{recursive:true});await fs.writeFile('docs/product-2026-10-24/vision-results.json',JSON.stringify(result,null,2));await browser.close();}
