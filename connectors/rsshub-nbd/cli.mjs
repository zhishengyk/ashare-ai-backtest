// SPDX-License-Identifier: AGPL-3.0-only
import { collect } from './connector.mjs';
const args = process.argv.slice(2);
const take = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
if (!args.includes('--private-research')) {
 console.error('Requires --private-research: metadata only, no redistribution rights granted. Review source terms before use.'); process.exit(2);
}
try { console.log(JSON.stringify(await collect({ category: take('--category', '3'), limit: Number(take('--limit', '3')) }), null, 2)); }
catch (e) { console.error(e.message); process.exitCode = 1; }
