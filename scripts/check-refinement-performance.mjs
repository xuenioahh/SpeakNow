import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline=process.env.SPEAKNOW_REFINEMENT_BASELINE;
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'speaknow-refinement-perf-'));
const React=createRequire(path.join(root,'package.json'))('react');
const current=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
const oldWindow=globalThis.window, oldNow=Date.now;
let interval, sets=0, time=0;
const glow={style:{setProperty(){}}};
globalThis.window={self:globalThis,top:globalThis,setInterval:callback=>{interval=callback;return 1;},clearInterval(){},matchMedia:()=>({matches:false})};
Date.now=()=>time;
const dispatcher={useState(value){return[value,next=>{sets++;value=typeof next==='function'?next(value):next;}];},useRef:()=>({current:glow}),useMemo:callback=>callback(),useEffect:callback=>callback()};
async function compile(file,name){await build({entryPoints:[file],bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:path.join(temporary,name+'.js'),alias:{'@':path.join(root,'src')}});return(await import(pathToFileURL(path.join(temporary,name+'.js')).href)).default;}
function run(Component,props){sets=0;interval=null;time=0;const previous=current.current;current.current=dispatcher;try{return Component(props);}finally{current.current=previous;}}
try {
 fs.writeFileSync(path.join(temporary,'package.json'),'{"type":"module"}');fs.symlinkSync(path.join(root,'node_modules'),path.join(temporary,'node_modules'));
 const NewGlow=await compile(path.join(root,'src/components/GlowCTAButton.jsx'),'new-glow');
 const event={clientX:30,clientY:20,currentTarget:{getBoundingClientRect:()=>({left:0,top:0})}};
 const afterGlow=run(NewGlow,{});for(let i=0;i<100;i++)afterGlow.props.onMouseMove(event);const newGlowCalls=sets;
 assert.equal(newGlowCalls,0);
 const NewLoading=await compile(path.join(root,'src/components/LoadingProgressCard.jsx'),'new-loading');
 run(NewLoading,{});assert.equal(interval,null);const newLoadingCalls=sets;
 assert.equal(newLoadingCalls,0);
 let historical=null;
 if(baseline){
   for(const file of ['GlowCTAButton.jsx','LoadingProgressCard.jsx']) assert(fs.existsSync(path.join(baseline,'components',file)), `Requested historical baseline is missing: ${file}`);
   const OldGlow=await compile(path.join(baseline,'components/GlowCTAButton.jsx'),'old-glow');
   const beforeGlow=run(OldGlow,{});for(let i=0;i<100;i++)beforeGlow.props.onMouseMove(event);const oldGlowCalls=sets;
   const OldLoading=await compile(path.join(baseline,'components/LoadingProgressCard.jsx'),'old-loading');
   run(OldLoading,{});for(let i=0;i<100;i++){time+=180;interval?.();}
   historical={glowPointer100Events:oldGlowCalls,loadingMountAnd100TimerTicks:sets};
 }
 console.log(JSON.stringify({status:'PASS current component regression',kind:'Controlled execution; setter invocations, not real paints/FPS. Missing historical data is not reconstructed.',current:{glowPointer100Events:newGlowCalls,loadingMount:newLoadingCalls},historical,comparison:baseline?'Provided baseline executed':'NOT VERIFIED: no historical baseline supplied'},null,2));
}finally{globalThis.window=oldWindow;Date.now=oldNow;fs.rmSync(temporary,{recursive:true,force:true});}
