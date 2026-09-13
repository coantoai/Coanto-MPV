const gemini=process.env['GEMINI_API_KEY']?.trim()||'';
const brave=process.env['BRAVE_SEARCH_API_KEY']?.trim()||'';
const bing=process.env['BING_SEARCH_V7_KEY']?.trim()||'';

async function readJson(response:Response){const text=await response.text();try{return text?JSON.parse(text) as Record<string,unknown>:{};}catch{throw new Error(`Search provider returned invalid JSON (${response.status}).`);}}
function arr(value:unknown):unknown[]{return Array.isArray(value)?value:[];}
function obj(value:unknown):Record<string,unknown>{return value&&typeof value==='object'?value as Record<string,unknown>:{};}

async function geminiProbe(){const model=process.env['GEMINI_DISCOVERY_MODEL']?.trim()||process.env['GEMINI_MODEL']?.trim()||'gemini-3.1-flash-lite';const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':gemini},body:JSON.stringify({contents:[{role:'user',parts:[{text:'Use Google Search to verify one current public fact about competitive intelligence software. Keep the answer to one sentence.'}]}],tools:[{google_search:{}}],generationConfig:{temperature:0,maxOutputTokens:200}})});const body=await readJson(response);if(!response.ok)throw new Error(`Gemini Google Search launch probe failed (${response.status}).`);let queries=0,chunks=0;for(const candidate of arr(body['candidates'])){const grounding=obj(obj(candidate)['groundingMetadata']);queries+=arr(grounding['webSearchQueries']).length;chunks+=arr(grounding['groundingChunks']).length;}if(queries===0&&chunks===0)throw new Error('Gemini launch probe returned no Google Search grounding metadata.');console.log(`SEARCH_PROVIDER_LIVE_OK gemini-google-search model=${model} queries=${queries} chunks=${chunks}`);}
async function braveProbe(){const response=await fetch('https://api.search.brave.com/res/v1/web/search?q=competitive%20intelligence&count=1',{headers:{Accept:'application/json','X-Subscription-Token':brave}});const body=await readJson(response);if(!response.ok)throw new Error(`Brave Search launch probe failed (${response.status}).`);const web=body['web'] as {results?:unknown[]}|undefined;if(!Array.isArray(web?.results)||web.results.length===0)throw new Error('Brave Search launch probe returned no result.');console.log('SEARCH_PROVIDER_LIVE_OK brave');}
async function bingProbe(){const response=await fetch('https://api.bing.microsoft.com/v7.0/search?q=competitive%20intelligence&count=1&textDecorations=false&textFormat=Raw',{headers:{Accept:'application/json','Ocp-Apim-Subscription-Key':bing}});const body=await readJson(response);if(!response.ok)throw new Error(`Bing Search launch probe failed (${response.status}).`);const webPages=body['webPages'] as {value?:unknown[]}|undefined;if(!Array.isArray(webPages?.value)||webPages.value.length===0)throw new Error('Bing Search launch probe returned no result.');console.log('SEARCH_PROVIDER_LIVE_OK bing');}

if(!gemini&&!brave&&!bing)throw new Error('No launch search provider is configured.');
const probes:Array<[string,()=>Promise<void>]> = [];
if(gemini)probes.push(['gemini-google-search',geminiProbe]);
if(brave)probes.push(['brave',braveProbe]);
if(bing)probes.push(['bing',bingProbe]);
const failures:string[]=[];
for(const[name,probe]of probes){try{await probe();process.exit(0);}catch(error){failures.push(`${name}: ${error instanceof Error?error.message:String(error)}`);}}
throw new Error(`No configured launch search provider passed. ${failures.join(' | ')}`);
