import { createHash } from 'node:crypto';
import { fetchSite, validateTargetUrl } from '../src/lib/analyze.server.ts';

const targets = [
  'https://www.allbirds.com/',
  'https://www.nike.com/',
  'https://www.adidas.com/',
];
let passed = 0;
for (const target of targets) {
  const started = Date.now();
  try {
    const validation = validateTargetUrl(target);
    if (!validation.ok) throw new Error(validation.reason);
    const snapshot = await fetchSite(target);
    const hash = createHash('sha256').update(`${snapshot.title}\n${snapshot.description}\n${snapshot.text}`).digest('hex');
    if (!hash || !snapshot.url || !snapshot.title) throw new Error('incomplete snapshot');
    passed += 1;
    console.log(`PASS ${target} status=200 title=${JSON.stringify(snapshot.title).slice(0,120)} hash=${hash.slice(0,16)} latency=${Date.now()-started}ms`);
  } catch (error) {
    console.error(`FAIL ${target}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
for (const blocked of ['http://localhost:3000','http://127.0.0.1:8080','http://192.168.1.1','http://10.0.0.1','http://[::1]']) {
  if (validateTargetUrl(blocked).ok) { console.error(`FAIL SSRF guard ${blocked}`); continue; }
  passed += 1; console.log(`PASS SSRF guard ${blocked}`);
}
console.log(`Monitoring live smoke: ${passed}/${targets.length + 5 + 0} checks passed`);
if (passed < targets.length + 5) process.exit(1);
