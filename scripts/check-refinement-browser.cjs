// Uses actual local application/account data. No API mocks, invented scores,
// recorded speech, uploads, deletions or report saves are performed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.SPEAKNOW_TEST_URL||'http://127.0.0.1:5173';
const output=process.env.SPEAKNOW_TEST_ARTIFACTS||'/tmp/speaknow-refinement-browser';
const widths=[320,375,390,768,1024,1440];
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const engine=process.env.SPEAKNOW_BROWSER==='webkit'?webkit:chromium;
 const browser=await engine.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const results=[],errors=[];
 try{
  const context=await browser.newContext({...(process.env.SPEAKNOW_STORAGE_STATE?{storageState:process.env.SPEAKNOW_STORAGE_STATE}:{}),viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const inspect=async(route)=>{
   await page.goto(base+route);await page.waitForLoadState('networkidle');
   for(const width of widths){await page.setViewportSize({width,height:width<768?844:1000});await page.waitForTimeout(150);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route} overflows at ${width}`);await page.screenshot({path:path.join(output,`${route.replaceAll('/','-')||'home'}-${width}.png`),fullPage:true});results.push({route,width,result:'layout asserted'});}
  };
  await inspect('/auth');
  await page.goto(base+'/');await page.waitForLoadState('networkidle');
  if(!await page.locator('.speaknow-shell').count()){
   results.push({result:'SKIP protected pages: provide actual authenticated storageState; no fabricated account is created'});
  }else{
   for(const route of ['/','/voice','/presentation','/profile','/voice/history','/presentation/history','/voice/casual-video'])await inspect(route);
   await page.goto(base+'/voice');await page.getByRole('button',{name:'Preview Airport',exact:true}).waitFor();
   assert.equal(await page.locator('.scenario-card').count(),12);
   for(const title of ['Airport','Bank','Hotel','Restaurant','Shopping','Hospital','University','Office','Phone Call','Car Rental','Museum','Café']){await page.getByRole('button',{name:`Preview ${title}`,exact:true}).click();await page.getByLabel(`${title} spatial preview`,{exact:true}).waitFor();assert.equal(await page.locator('.scene-cue-list button').count(),3);}
   results.push({result:'12 actual scenes selected; native GPU availability must also be inspected in screenshots'});
   await page.getByRole('button',{name:/Start conversation/}).click();await page.getByRole('heading',{name:'Choose Practice Mode'}).waitFor();
   await page.keyboard.press('Escape');assert.equal(await page.getByRole('heading',{name:'Choose Practice Mode'}).count(),0);
   results.push({result:'existing mode dialog opens/closes with keyboard'});
   results.push({result:'SKIP live practice/report contexts, microphone, original-media playback and saved-record mutation: require real completed practice and manual verification; no session is invented'});
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
