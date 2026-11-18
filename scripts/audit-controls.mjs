import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(), visited=new Set(), controls=[];
const clean=s=>s.replace(/\s+/g,' ').trim();
function resolve(from,s){let base=s.startsWith('@/')?path.join(root,'src',s.slice(2)):s.startsWith('.')?path.resolve(path.dirname(from),s):null;if(!base)return;return [base,base+'.jsx',base+'.js',base+'.mjs',path.join(base,'index.js')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());}
function walkFile(file){if(visited.has(file))return;visited.add(file);const src=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,file.endsWith('jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
for(const st of sf.statements)if(ts.isImportDeclaration(st)){const target=resolve(file,st.moduleSpecifier.text);if(target&&!target.includes('/ui/'))walkFile(target);}
function walk(n){if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&ts.isStringLiteral(n.arguments[0])){const target=resolve(file,n.arguments[0].text);if(target)walkFile(target);}
if(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)){const tag=ts.isJsxElement(n)?n.openingElement:n;const name=tag.tagName.getText(sf),attrs=Object.fromEntries(tag.attributes.properties.filter(ts.isJsxAttribute).map(a=>[a.name.text,a.initializer?.getText(sf)||'true']));
if(/^(button|Button|Link|a|audio|video|summary|select|input|textarea|Input|form)$/.test(name)||attrs.onClick||attrs.role==='"button"'){
const body=ts.isJsxElement(n)?n.children.map(c=>c.getText(sf)).join(' '):'';
controls.push({id:`C${String(controls.length+1).padStart(3,'0')}`,file:path.relative(root,file),line:sf.getLineAndCharacterOfPosition(n.getStart()).line+1,kind:name,label:clean(attrs['aria-label']||body.replace(/<[^>]+>/g,' ')||attrs.placeholder||attrs.type||name),action:clean(attrs.onClick||attrs.onSubmit||attrs.onChange||attrs.to||attrs.href||(['audio','video'].includes(name)?'native media controls':name==='summary'?'native details toggle':attrs.onKeyDown||'')),disabled:clean(attrs.disabled||''),source:clean(tag.getText(sf))});}}
ts.forEachChild(n,walk);}walk(sf);}
walkFile(path.join(root,'src/App.jsx'));
fs.writeFileSync('docs/button-audit-2026-10-24/controls.json',JSON.stringify({files:[...visited].map(p=>path.relative(root,p)),controls},null,2));
console.log(controls.length+' controls in '+visited.size+' reachable source modules');
for(const c of controls)console.log(`${c.id} ${c.file}:${c.line} ${c.kind} ${c.label.slice(0,90)} => ${c.action.slice(0,160)}`);
