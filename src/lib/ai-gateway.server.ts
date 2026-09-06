import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
const H="X-Lovable-AIG-Run-ID";
export function createLovableAiGatewayRunIdFetch(initial?:string){let id=initial?.trim();return{fetch:async(input:RequestInfo|URL,init?:RequestInit)=>{const headers=new Headers(init?.headers);if(id&&!headers.has(H))headers.set(H,id);const r=await fetch(input,{...init,headers});id=id||r.headers.get(H)||undefined;return r},getRunId:()=>id,waitForRunId:()=>Promise.resolve(id)}}
export function createLovableAiGatewayProvider(key:string,initial?:string){const f=createLovableAiGatewayRunIdFetch(initial);return Object.assign(createOpenAICompatible({name:"lovable",baseURL:"https://ai.gateway.lovable.dev/v1",headers:{"Lovable-API-Key":key,"X-Lovable-AIG-SDK":"vercel-ai-sdk"},fetch:f.fetch as typeof fetch}),{getRunId:f.getRunId,waitForRunId:f.waitForRunId})}
export function getLovableAiGatewayRunId(request:Request){return request.headers.get(H)?.trim()||undefined}
