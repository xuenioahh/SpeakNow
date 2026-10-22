import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'speaknow-refinement-ui-'));
const require = createRequire(path.join(root,'package.json'));
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const savedWindow = globalThis.window;
globalThis.window = { self: globalThis, top: globalThis };
try {
  fs.writeFileSync(path.join(temporary,'package.json'),'{"type":"module"}');
  fs.symlinkSync(path.join(root,'node_modules'), path.join(temporary,'node_modules'));
  await build({ entryPoints:['src/components/voice/ScenarioCard.jsx','src/components/voice/ModeSelector.jsx','src/lib/scenarios.js'].map(file=>path.join(root,file)), outdir: temporary, entryNames: "[name]", bundle:true, packages:'external', platform:'node', format:'esm', jsx:'automatic', alias:{'@':path.join(root,'src')} });
  const Card = (await import(pathToFileURL(path.join(temporary,'ScenarioCard.js')).href)).default;
  const Selector = (await import(pathToFileURL(path.join(temporary,'ModeSelector.js')).href)).default;
  const { SCENARIOS } = await import(pathToFileURL(path.join(temporary,'scenarios.js')).href);
  assert.equal(SCENARIOS.length,12);
  for(const scenario of SCENARIOS) {
    const markup=renderToStaticMarkup(React.createElement(Card,{scenario,selected:true,onClick(){}}));
    assert(markup.includes(`Preview ${scenario.title}`)); assert(markup.includes('aria-pressed="true"')); assert(markup.includes('width="400"')); assert(markup.includes('height="225"')); assert(markup.includes('scenario-card-copy'));
  }
  const hooks=[], effects=[]; let index=0;
  const dispatcher={
    useState(initial){ const i=index++; hooks[i] ||= { value: typeof initial==='function'?initial():initial }; const cell=hooks[i]; return [cell.value,next=>cell.value=typeof next==='function'?next(cell.value):next]; },
    useRef(value){ const i=index++; return hooks[i] ||= {current:value}; },
    useEffect(effect){ const i=index++; if(!hooks[i]) {hooks[i]={}; effects.push(()=>hooks[i].cleanup=effect());} },
  };
  const current=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
  let completed=0, closed=0;
  const render=()=>{index=0;const old=current.current;current.current=dispatcher;let result;try{result=Selector({scenario:SCENARIOS[0],onComplete(){completed++;},onBack(){closed++;}});}finally{current.current=old;}while(effects.length)effects.shift()();return result;};
  const find=(node,predicate)=>{if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of React.Children.toArray(node.props?.children)){const found=find(child,predicate);if(found)return found;}return null;};
  let tree=render();const basic=find(tree,node=>node.props?.title==='Basic'); basic.props.onClick();basic.props.onClick();
  tree=render();assert.equal(find(tree,node=>node.props?.title==='Basic').props.disabled,true);
  await new Promise(resolve=>setTimeout(resolve,210));tree=render();assert(find(tree,node=>node.props?.title==='Choose Dialog Mode'));
  const goal=find(tree,node=>node.props?.title==='Goal-Oriented');goal.props.onClick();
  find(render(),node=>node.props?.['aria-label']==='Previous step').props.onClick();
  await new Promise(resolve=>setTimeout(resolve,210));tree=render();assert(find(tree,node=>node.props?.title==='Choose Practice Mode'), 'back cancels pending forward transition');
  find(tree,node=>node.props?.title==='Basic').props.onClick();await new Promise(resolve=>setTimeout(resolve,210));
  find(render(),node=>node.props?.title==='Goal-Oriented').props.onClick();await new Promise(resolve=>setTimeout(resolve,210));
  const ielts=find(render(),node=>node.props?.title==='IELTS');ielts.props.onClick();ielts.props.onClick();assert.equal(completed,1);
  hooks.forEach(cell=>cell.cleanup?.());
  console.log('PASS: all 12 real scenario card renderings, selected semantics, reserved images, setup double-click lock, back/timer cancellation and single completion');
} finally { globalThis.window=savedWindow;fs.rmSync(temporary,{recursive:true,force:true}); }
