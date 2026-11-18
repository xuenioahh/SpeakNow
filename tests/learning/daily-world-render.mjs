import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import('/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin=process.env.SPEAKNOW_TEST_ORIGIN||'http://127.0.0.1:5228', output='docs/daily-world-2026-10-25';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1440,height:900}});await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
const selected=process.argv.find(value=>value.startsWith('--scene='))?.split('=')[1];
const rows=[], errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 for(const scene of ['cafe','airport','bank','hotel','restaurant','shopping','hospital','university','office','phone','car_rental','museum']){
  if(selected&&!selected.split(',').includes(scene))continue;
  const row={scene};
  for(const mode of ['before','after']) {
   await page.goto(`${origin}/docs/daily-world-2026-10-25/compare.html?scene=${scene}&mode=${mode}`,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.api);await page.waitForTimeout(3600);
   row[mode]=await page.evaluate(()=>window.api.snapshot());
   const metrics=await cdp.send('Performance.getMetrics');row[mode].jsHeapUsedBytes=metrics.metrics.find(value=>value.name==='JSHeapUsedSize')?.value;
   assert.ok(row[mode].triangles>1000, 'both comparisons must contain room geometry');
   await page.screenshot({path:`${output}/same-view-${scene}-${mode}.png`});
  }
  for(let i=0;i<3;i++)assert.ok(Math.abs(row.before.cameraPosition[i]-row.after.cameraPosition[i])<.04);
  rows.push(row);console.log(scene,Math.round(row.before.fps||0),Math.round(row.after.fps||0));
 }
 // One continuous scene for 30 seconds, sampled without constructing another
 // renderer. Geometry/texture counts must remain bounded during idle animation.
 const start=await page.evaluate(()=>window.api.snapshot());
 await page.waitForTimeout(30000);
 const end=await page.evaluate(()=>window.api.snapshot());
 assert.deepEqual(end.memory,start.memory);
 assert.equal(end.roomId,start.roomId);
 const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?{vendor:gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}:null;});
 await page.goto(`${origin}/voice/prepare?scenario=cafe&cue=coffee`,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Start Conversation',exact:true}).waitFor();
 await page.evaluate(async()=>{const moduleUrl=performance.getEntriesByType('resource').map(entry=>entry.name).find(name=>/\/src\/lib\/audioManager\.js(?:\?|$)/.test(name));const {audioManager}=await import(moduleUrl||'/src/lib/audioManager.js');window.nativeEvents=[];audioManager.subscribe(e=>window.nativeEvents.push({...e,at:performance.now()}));});
 await page.getByRole('button',{name:'Start Conversation',exact:true}).click();
 await page.waitForFunction(()=>window.nativeEvents.some(e=>e.type==='end'),{timeout:12000});
 const native=await page.evaluate(()=>({events:window.nativeEvents,voices:speechSynthesis.getVoices().map(v=>({name:v.name,lang:v.lang})),native:SpeechSynthesisUtterance.toString().includes('[native code]')}));
 assert.equal(native.native,true);assert.ok(native.events.some(e=>e.type==='start'));assert.ok(native.events.some(e=>e.type==='end'&&e.reason==='ended'));
 assert.deepEqual(errors,[]);
 let measuredRows=rows;if(selected){const previous=JSON.parse(await fs.readFile(`${output}/render-results.json`,'utf8'));measuredRows=previous.rows.map(row=>rows.find(value=>value.scene===row.scene)||row);}
 await fs.writeFile(`${output}/render-results.json`,JSON.stringify({browser:browser.version(),viewport:{width:1440,height:900},gpu,rows:measuredRows,stress:{seconds:30,start,end},nativeTts:native,errors},null,2));
 console.log('PASS same-camera comparison in 12 rooms, 30 second resource stability, native browser TTS events');
} finally {await Promise.race([browser.close(),new Promise(r=>setTimeout(r,4000))]);}
process.exit(0);
