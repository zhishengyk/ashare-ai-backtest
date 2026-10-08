import fs from 'node:fs';
fs.mkdirSync('dist/server',{recursive:true});
let parts=['catalogue','engine','collector','jobs','daily','nbs','nbd','byd','news','backfill','quality','model'].map(f=>fs.readFileSync('worker/'+f+'.js','utf8').replaceAll('export ','').replace(/^import .*;\n/gm,''));
parts.unshift('const CATALOGUE_SNAPSHOT = '+fs.readFileSync('worker/catalogue-snapshot.json','utf8')+';');
parts.push('const PAGE = '+JSON.stringify(fs.readFileSync('worker/page.html','utf8').replace('<script-placeholder-platform></script-placeholder-platform>',fs.readFileSync('worker/platform-ui.js','utf8')))+';');
parts.push(fs.readFileSync('worker/server.js','utf8'));
fs.writeFileSync('dist/server/index.js',parts.join('\n'));
console.log('Bundled server, UI and collector');
