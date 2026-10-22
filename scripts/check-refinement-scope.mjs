import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '@babel/parser';
const baseline=process.env.SPEAKNOW_REFINEMENT_BASELINE||'/tmp/speaknow-refinement-before/src';
const ast=text=>parse(text,{sourceType:'module',plugins:['jsx']});
function clean(value){if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['start','end','loc','extra','comments','leadingComments','trailingComments','innerComments','tokens'].includes(key)).map(([key,item])=>[key,clean(item)]));return value;}
for(const file of ['api/localClient.js','pages/CasualVideo.jsx'])assert.deepEqual(clean(ast(fs.readFileSync(`src/${file}`,'utf8'))),clean(ast(fs.readFileSync(`${baseline}/${file}`,'utf8'))),`${file}: type annotations must not change execution`);
for(const file of ['lib/audioManager.js','lib/audioEnergy.js','lib/voice/VoiceCapture.js','lib/voice/VoiceInteraction.js','lib/voice/endpointDetector.js','lib/voiceOrbState.js','lib/localReports.js','lib/examStandards.js','lib/localStore.js','lib/scenarios.js','lib/immersiveScenarios.js','lib/expressionPractice.js','lib/expressionInsights.js','lib/expressionContext.js'])assert(fs.readFileSync(`src/${file}`).equals(fs.readFileSync(`${baseline}/${file}`)),`${file}: preserve existing business/audio/scoring behavior`);
const routePaths=source=>{const result=[];function walk(node){if(!node||typeof node!=='object')return;if(node.type==='JSXOpeningElement'&&node.name?.name==='Route'){const attr=node.attributes.find(attr=>attr.name?.name==='path');if(attr)result.push(attr.value.value);}for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}}walk(ast(source));return result;};
assert.deepEqual(routePaths(fs.readFileSync('src/App.jsx','utf8')),routePaths(fs.readFileSync(`${baseline}/App.jsx`,'utf8')));
const shaders=source=>{const result={};for(const node of ast(source).program.body)if(node.type==='VariableDeclaration')for(const declaration of node.declarations)if(['vertexShader','fragmentShader'].includes(declaration.id.name))result[declaration.id.name]=source.slice(declaration.init.start,declaration.init.end);return result;};
assert.deepEqual(shaders(fs.readFileSync('src/components/spatial/VoiceOrb.jsx','utf8')),shaders(fs.readFileSync(`${baseline}/components/spatial/VoiceOrb.jsx`,'utf8')));
// Explicit timestamp comparison is equivalent to JavaScript's existing Date
// coercion; verify complete analytics output including every metric and record.
const original=await import(`data:text/javascript,${encodeURIComponent(fs.readFileSync(`${baseline}/lib/profileAnalytics.js`,'utf8'))}`);
const current=await import('../src/lib/profileAnalytics.js');
const records=[{id:'unit-1',created_date:'2026-10-01T12:00:00Z',scoring_standard:'ielts',duration_seconds:60,report:{totalScore:6,scores:{Fluency:6,Grammar:5.5}}},{id:'unit-2',created_date:'2026-10-08T10:00:00Z',scoring_standard:'ielts',duration_seconds:90,report:{totalScore:6.5,scores:{Fluency:7,Grammar:6}}}];
const input={voiceSessions:records,presentationSessions:[],days:30,track:'all',now:new Date('2026-10-08T12:00:00Z')};
assert.deepEqual(current.buildProfileAnalytics(input),original.buildProfileAnalytics(input));
assert(fs.readFileSync('package.json').equals(fs.readFileSync('/tmp/speaknow-refinement-before/package.json')));assert(fs.readFileSync('package-lock.json').equals(fs.readFileSync('/tmp/speaknow-refinement-before/package-lock.json')));
console.log('PASS: existing routes, audio/capture/protocol, model payload, scores/storage/scenes unchanged; annotation-only video/client edits; Orb shaders identical; analytics output equivalent; no dependency added');
