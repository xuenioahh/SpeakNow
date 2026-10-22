import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'speaknow-orb-lifecycle-'));
const React=createRequire(path.join(root,'package.json'))('react');
const dispatcher=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
const previous={window:globalThis.window,document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,IntersectionObserver:globalThis.IntersectionObserver,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
const listeners=new Map(),frameQueue=new Map(),renderers=[],resources=[];let id=0,compact=false,width=410,height=290,resize,intersection;
const media={matches:false,addEventListener:(type,callback)=>listeners.set('media:'+type,callback),removeEventListener:type=>listeners.delete('media:'+type)};
const host={getBoundingClientRect:()=>({width,height}),appendChild(){},addEventListener:(type,callback)=>listeners.set('host:'+type,callback),removeEventListener:type=>listeners.delete('host:'+type),dispatchEvent:event=>listeners.get('host:'+event.type)?.()};
globalThis.__orbFixture={renderers,resources};
globalThis.window={devicePixelRatio:3,matchMedia:query=>query.includes('reduced')?media:{matches:compact},addEventListener:(type,callback)=>listeners.set('window:'+type,callback),removeEventListener:type=>listeners.delete('window:'+type)};
globalThis.document={hidden:false,hasFocus:()=>true,addEventListener:(type,callback)=>listeners.set('document:'+type,callback),removeEventListener:type=>listeners.delete('document:'+type)};
globalThis.ResizeObserver=class{constructor(callback){resize=callback;}observe(){resize();}disconnect(){this.disconnected=true;}};
globalThis.IntersectionObserver=class{constructor(callback){intersection=callback;}observe(){}disconnect(){this.disconnected=true;}};
globalThis.requestAnimationFrame=callback=>{const token=++id;frameQueue.set(token,callback);return token;};globalThis.cancelAnimationFrame=token=>frameQueue.delete(token);
const flush=time=>{const pending=[...frameQueue.values()];frameQueue.clear();pending.forEach(callback=>callback(time));};
let index=0;const hooks=[],effects=[];
const hookDispatcher={
 useRef(value){const slot=index++;return hooks[slot] ||= {current:slot===0?host:value};},
 useState(value){const slot=index++;const cell=hooks[slot] ||= {value};return[cell.value,next=>cell.value=next];},
 useEffect(effect,deps){const slot=index++;const prior=hooks[slot];if(!prior||deps.some((value,i)=>value!==prior.deps[i]))effects.push(()=>{prior?.cleanup?.();hooks[slot]={deps,cleanup:effect()};});},
};
try{
 fs.writeFileSync(path.join(temporary,'package.json'),'{"type":"module"}');fs.symlinkSync(path.join(root,'node_modules'),path.join(temporary,'node_modules'));
 const actual=path.join(root,'node_modules/three/build/three.module.js');
 const shim=`import * as Actual from ${JSON.stringify(actual)}; export * from ${JSON.stringify(actual)};
 export class WebGLRenderer { constructor(){this.debug={};this.domElement={setAttribute(){},addEventListener(){},removeEventListener(){},remove(){}};this.sizeCalls=0;this.draws=0;globalThis.__orbFixture.renderers.push(this);}setPixelRatio(value){this.ratio=value;}setClearColor(){}setSize(){this.sizeCalls++;}render(){this.draws++;}dispose(){this.disposed=true;}forceContextLoss(){this.contextReleased=true;} }
 export class SphereGeometry extends Actual.SphereGeometry {constructor(...args){super(...args);globalThis.__orbFixture.resources.push(this);}dispose(){super.dispose();this.disposed=true;}}
 export class ShaderMaterial extends Actual.ShaderMaterial {constructor(...args){super(...args);globalThis.__orbFixture.resources.push(this);}dispose(){super.dispose();this.disposed=true;}}
 export class MeshPhongMaterial extends Actual.MeshPhongMaterial {constructor(...args){super(...args);globalThis.__orbFixture.resources.push(this);}dispose(){super.dispose();this.disposed=true;}}
 `;
 fs.writeFileSync(path.join(temporary,'three-fixture.js'),shim);
 await build({entryPoints:[path.join(root,'src/components/spatial/VoiceOrb.jsx')],bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:path.join(temporary,'orb.js'),alias:{three:path.join(temporary,'three-fixture.js')}});
 const Orb=(await import(pathToFileURL(path.join(temporary,'orb.js')).href)).default;
 const energyRef={current:{read:()=>0.6}};
 const render=state=>{index=0;const old=dispatcher.current;dispatcher.current=hookDispatcher;try{Orb({state,energyRef});}finally{dispatcher.current=old;}while(effects.length)effects.shift()();};
 render('idle');assert.equal(renderers.length,1);assert.equal(resources.length,4);assert.equal(renderers[0].ratio,1.5);
 for(let i=0;i<20;i++)resize();assert.equal(renderers[0].sizeCalls,1,'identical resizes do not resize GPU backing buffers');
 assert.equal(frameQueue.size,1,'one render loop');flush(100);assert.equal(frameQueue.size,1);
 render('listening');flush(120);flush(140);const material=resources.find(resource=>resource.uniforms);assert(material.uniforms.uEnergy.value>0);assert(material.uniforms.uEnergy.value<=1);
 assert.equal(resources.length,4,'state changes never recreate geometry/material');
 compact=true;width=280;height=210;resize();assert.equal(renderers[0].ratio,1.25);
 document.hidden=true;listeners.get('document:visibilitychange')();assert.equal(frameQueue.size,0);
 document.hidden=false;listeners.get('document:visibilitychange')();assert.equal(frameQueue.size,1);
 intersection([{isIntersecting:false}]);assert.equal(frameQueue.size,0);intersection([{isIntersecting:true}]);assert.equal(frameQueue.size,1);
 media.matches=true;listeners.get('media:change')();flush(200);assert.equal(frameQueue.size,0,'reduced motion retains one static render');
 media.matches=false;render('error');flush(240);assert.equal(frameQueue.size,0,'error state does not keep animating');
 for(const cell of hooks)cell.cleanup?.();assert.equal(frameQueue.size,0);assert.equal(listeners.size,0);assert(renderers[0].disposed);assert(renderers[0].contextReleased);assert(resources.every(resource=>resource.disposed));
 console.log('PASS: actual Orb lifecycle with controlled renderer; one loop, real energy consumer, DPR caps, resize deduplication, visibility/reduced-motion/error pause and complete disposal. This is not a GPU shader/visual test.');
}finally{for(const[key,value]of Object.entries(previous))globalThis[key]=value;delete globalThis.__orbFixture;fs.rmSync(temporary,{recursive:true,force:true});}
