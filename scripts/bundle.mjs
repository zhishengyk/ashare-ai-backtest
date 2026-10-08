import fs from 'node:fs';
let parts=['catalogue','engine','collector','jobs','daily','nbs','byd','news','model'].map(f=>fs.readFileSync('worker/'+f+'.js','utf8').replaceAll('export ','').replace(/^import .*;\n/gm,''));
parts.unshift('const CATALOGUE_SNAPSHOT = '+fs.readFileSync('worker/catalogue-snapshot.json','utf8')+';');
parts.push('const PAGE = '+JSON.stringify(fs.readFileSync('worker/page.html','utf8'))+';');
parts.push(fs.readFileSync('worker/server.js','utf8'));
fs.writeFileSync('worker/index.js',parts.join('\n'));
fs.writeFileSync('dist/server/index.js',parts.join('\n'));
console.log('Bundled server, UI and collector');
