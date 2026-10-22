import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { parse } from '@babel/parser';
const root = path.resolve(process.argv[2] || 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const entry = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
if (!entry) throw new Error('No production entry found');
const seen = new Set();
function visit(relative) {
  const file = path.resolve(root, relative.replace(/^\//, ''));
  if (seen.has(file)) return;
  seen.add(file);
  const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module' });
  for (const node of ast.program.body) if (node.source?.value?.startsWith('.') && node.source.value.endsWith('.js')) visit(path.relative(root, path.resolve(path.dirname(file), node.source.value)));
}
visit(entry);
const size = files => files.reduce((total, file) => { const bytes = fs.readFileSync(file); total.rawBytes += bytes.length; total.gzipBytes += gzipSync(bytes).length; return total; }, { rawBytes: 0, gzipBytes: 0 });
const assets = fs.readdirSync(path.join(root,'assets')).filter(name => name.endsWith('.js')).map(name => path.join(root,'assets',name));
console.log(JSON.stringify({ entryStaticJs: { files: [...seen].map(file => path.relative(root,file)), ...size([...seen]) }, allJs: { files: assets.length, ...size(assets) }, note: 'Production artifact bytes; excludes HTTP caching, network, parse/render time and runtime performance.' },null,2));
