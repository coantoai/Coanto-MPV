import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { accessTokenFromRequest, authCookie } from '../src/lib/auth.server.ts';
import { apiSecurityHeaders, guardSameOriginMutation, requestId, safeAuthRedirect } from '../src/lib/http-security.server.ts';

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sameOrigin = new Request('https://coanto.com/api/analyze', { method: 'POST', headers: { origin: 'https://coanto.com', 'sec-fetch-site': 'same-origin' } });
expect(guardSameOriginMutation(sameOrigin).ok, 'Same-origin mutation was rejected.');

const crossOrigin = new Request('https://coanto.com/api/analyze', { method: 'POST', headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } });
expect(!guardSameOriginMutation(crossOrigin).ok, 'Cross-origin mutation was accepted.');

const forgedFetchSite = new Request('https://coanto.com/api/analyze', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } });
expect(!guardSameOriginMutation(forgedFetchSite).ok, 'Cross-site fetch metadata was accepted without Origin.');

const serverClient = new Request('https://coanto.com/api/analyze', { method: 'POST', headers: { authorization: 'Bearer server-client' } });
expect(guardSameOriginMutation(serverClient).ok, 'Non-browser server client was incorrectly rejected.');

const getRequest = new Request('https://coanto.com/api/health', { method: 'GET', headers: { origin: 'https://evil.example' } });
expect(guardSameOriginMutation(getRequest).ok, 'Safe GET was incorrectly mutation-blocked.');

const redirectRequest = new Request('https://coanto.com/api/auth', { method: 'POST' });
expect(safeAuthRedirect(redirectRequest, 'https://coanto.com/auth') === 'https://coanto.com/auth', 'Valid auth redirect was changed.');
expect(safeAuthRedirect(redirectRequest, 'https://evil.example/steal') === 'https://coanto.com/auth', 'External auth redirect was accepted.');
expect(safeAuthRedirect(redirectRequest, 'https://coanto.com/admin') === 'https://coanto.com/auth', 'Unexpected same-origin auth path was accepted.');

const suppliedIdRequest = new Request('https://coanto.com/api/health', { headers: { 'x-request-id': 'req_12345678' } });
expect(requestId(suppliedIdRequest) === 'req_12345678', 'Safe request id was not preserved.');
const hostileId = requestId(new Request('https://coanto.com/api/health', { headers: { 'x-request-id': '<script>x</script>' } }));
expect(hostileId !== '<script>x</script>' && hostileId.length >= 8, 'Unsafe request id was reflected.');

const responseHeaders = apiSecurityHeaders(suppliedIdRequest, { 'content-type': 'application/json' });
expect(responseHeaders.get('cache-control') === 'no-store', 'No-store header missing.');
expect(responseHeaders.get('x-content-type-options') === 'nosniff', 'nosniff header missing.');
expect(responseHeaders.get('x-frame-options') === 'DENY', 'Frame protection missing.');
expect(responseHeaders.get('cross-origin-resource-policy') === 'same-origin', 'CORP header missing.');
expect(responseHeaders.get('x-request-id') === 'req_12345678', 'Response request id missing.');

const tokenRequest = new Request('https://coanto.com/api/auth', { headers: { authorization: 'Bearer abc123' } });
expect(accessTokenFromRequest(tokenRequest) === 'abc123', 'Valid bearer token parsing failed.');
const hugeTokenRequest = new Request('https://coanto.com/api/auth', { headers: { authorization: `Bearer ${'x'.repeat(9000)}` } });
expect(accessTokenFromRequest(hugeTokenRequest) === null, 'Oversized bearer token was accepted.');
const cookie = authCookie(new Request('https://coanto.com/api/auth'), 'abc123');
expect(cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax') && cookie.includes('Secure'), 'Secure auth cookie attributes missing.');

const root = process.cwd();
const authApi = await readFile(join(root, 'src/routes/api/auth.ts'), 'utf8');
const analyzeApi = await readFile(join(root, 'src/routes/api/analyze.ts'), 'utf8');
const contextApi = await readFile(join(root, 'src/routes/api/business-context.ts'), 'utf8');
const competitorsApi = await readFile(join(root, 'src/routes/api/competitors.ts'), 'utf8');
const healthApi = await readFile(join(root, 'src/routes/api/health.ts'), 'utf8');
expect(authApi.includes('guardSameOriginMutation') && authApi.includes('safeAuthRedirect'), 'Auth API mutation or redirect guard missing.');
expect(analyzeApi.includes('guardSameOriginMutation') && analyzeApi.includes('requestId') && analyzeApi.includes('MAX_REQUEST_BYTES'), 'Analyze API security boundary missing.');
expect(contextApi.includes('guardSameOriginMutation'), 'Business context mutation guard missing.');
expect(competitorsApi.includes('guardSameOriginMutation'), 'Competitor discovery mutation guard missing.');
expect(healthApi.includes('apiSecurityHeaders'), 'Health security headers missing.');

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
}

const browserRoots = [join(root, 'src/components'), join(root, 'src/routes')];
const secretNames = ['INSFORGE_API_KEY', 'APIFY_TOKEN', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'CRON_SECRET'];
const leaks: string[] = [];
for (const directory of browserRoots) {
  for (const path of await filesUnder(directory)) {
    if (!path.endsWith('.tsx')) continue;
    const source = await readFile(path, 'utf8');
    for (const secret of secretNames) if (source.includes(secret)) leaks.push(`${path}:${secret}`);
  }
}
expect(leaks.length === 0, `Server secret names leaked into browser modules: ${leaks.join(', ')}`);

console.log('SECURITY_SMOKE_OK', JSON.stringify({ sameOrigin: true, crossOriginRejected: true, redirectLocked: true, oversizedTokenRejected: true, browserSecretLeaks: 0 }));
