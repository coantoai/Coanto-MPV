import { createFileRoute } from '@tanstack/react-router';

let last: { at: number; result: unknown } | null = null;
export const Route = createFileRoute('/api/brave-diagnostic')({
  server: { handlers: {
    GET: async () => {
      const key = process.env['BRAVE_SEARCH_API_KEY']?.trim();
      if (!key) return Response.json({provider:'brave',status:'missing-key',checkedAt:new Date().toISOString()});
      if (last && Date.now()-last.at<300_000) return Response.json(last.result);
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(),10_000);
      let result: unknown;
      try {
        const response = await fetch('https://api.search.brave.com/res/v1/web/search?q=Allbirds%20official%20sustainable%20footwear%20competitors&count=5',{
          signal:controller.signal,
          headers:{Accept:'application/json','X-Subscription-Token':key},
        });
        const data = await response.json().catch(()=>({})) as {web?:{results?:Array<{url?:string;title?:string}>};message?:string;error?:string;type?:string};
        result = {
          provider:'brave',status:response.ok?'ok':'http-error',httpStatus:response.status,
          resultCount:data.web?.results?.length??0,
          sampleHosts:(data.web?.results??[]).slice(0,5).map(x=>{try{return new URL(x.url??'').hostname;}catch{return null;}}).filter(Boolean),
          errorType:response.ok?undefined:(data.type??data.error??'provider-rejected'),
          checkedAt:new Date().toISOString(),
        };
      } catch(error) {
        result = {provider:'brave',status:'network-error',errorType:error instanceof Error?error.name:'unknown',checkedAt:new Date().toISOString()};
      } finally {clearTimeout(timer);}
      last={at:Date.now(),result};
      return Response.json(result,{headers:{'cache-control':'no-store'}});
    },
  }},
});
