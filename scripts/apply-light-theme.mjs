// One-time migration of existing stylesheet declarations to the shared light palette.
import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
const changes = [];
const hex = /#([\da-f]{3,8})\b/gi;
function rgba(value) {
  let h = value.slice(1); if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
  if (![6,8].includes(h.length)) return null;
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),h.length === 8 ? parseInt(h.slice(6),16)/255 : 1];
}
function color(value, role) {
  const c = rgba(value); if (!c) return value;
  const [r,g,b,a] = c, max = Math.max(r,g,b), min = Math.min(r,g,b), lum = (r*.2126+g*.7152+b*.0722)/255;
  const purple = b > r * 1.05 && b > g * 1.12 || r > g * 1.13 && b > g * 1.15;
  if (role === 'border') return `rgba(24,34,53,${a < 1 ? Math.max(.12,Math.min(.3,a)).toFixed(2) : '.16'})`;
  if (role === 'shadow') return `rgba(24,34,53,${Math.min(.12,a*.2).toFixed(2)})`;
  if (role === 'background') {
    if (a < .98) return max > 180 ? `rgba(98,64,179,${Math.max(.025,Math.min(.12,a*.6)).toFixed(3)})` : `rgba(24,34,53,${Math.min(.16,a*.25).toFixed(3)})`;
    if (lum < .42) return max-min > 18 ? purple ? '#f0ecf9' : g > r && g > b ? '#edf5f0' : '#eef2f8' : '#ffffff';
    if (purple && max-min > 25) return '#6240b3';
    return value;
  }
  if (a < .95) return `rgba(24,34,53,${Math.max(.65,a).toFixed(2)})`;
  if (lum > .42) {
    if (max-min < 25) return max > 235 ? '#182235' : '#526075';
    if (purple) return '#6240b3';
    if (r > g*1.2 && r > b*1.25) return '#b42337';
    if (r > b*1.3 && g > b*1.25) return '#8a4d00';
    if (g > r*1.1 && g > b*1.04) return '#14714d';
    return '#315d89';
  }
  return value;
}
async function walk(dir) {
  for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
    const filename = path.join(dir,entry.name);
    if(entry.isDirectory()) { await walk(filename); continue; }
    if(!filename.endsWith('.css') || filename.endsWith('light-system.css')) continue;
    const original = await fs.readFile(filename,'utf8'), root = postcss.parse(original);
    let count=0;
    root.walkDecls(decl => {
      const prop=decl.prop.toLowerCase(), selector=decl.parent.selector||'';
      // Video pixels remain unmodified. Controls are covered by explicit light-system rules.
      const role = /shadow/.test(prop) ? 'shadow' : /border|outline|stroke/.test(prop) ? 'border' : /background|--surface|--panel|--card/.test(prop) ? 'background' : /color|fill|--ink/.test(prop) ? 'text' : null;
      if(!role)return;
      let next=decl.value.replace(hex, match=>color(match,role));
      next=next.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([.\d]+)\s*\)/gi,(_m,a)=> role==='background'?`rgba(98,64,179,${Math.max(.025,Math.min(.12,Number(a)*.6)).toFixed(3)})`:`rgba(24,34,53,${role==='text'?Math.max(.65,Number(a)):Math.max(.12,Number(a))})`);
      if(role==='shadow')next=next.replace(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([.\d]+)\s*\)/g,(_m,a)=>`rgba(24,34,53,${Math.min(.12,Number(a)*.3)})`);
      if(next!==decl.value){decl.value=next;count++;}
      if(role==='background' && next==='#6240b3' && /button|primary|active|selected|aria-current/.test(selector)) {
        const existing = decl.parent.nodes.find(node=>node.type==='decl' && node.prop==='color');
        if(existing)existing.value='#ffffff';else decl.cloneAfter({prop:'color',value:'#ffffff'});
      }
    });
    if(count){await fs.writeFile(filename,root.toString());changes.push({file:filename,declarations:count});}
  }
}
await walk('src');
await fs.writeFile('docs/comprehensive-2026-10-29/light-migration.json',JSON.stringify(changes,null,2)+'\n');
console.log('Migrated',changes.length,'stylesheets');
