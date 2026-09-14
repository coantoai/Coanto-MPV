import { buildPrompt, discoverCompetitors, fetchSite } from '../src/lib/analyze.server';
import { discoverCompetitorsWithGemini } from '../src/lib/gemini-competitor-discovery.server';
import { filterCommercialCompetitors } from '../src/lib/competitor-filter.server';
import { runAiProvider, type AiProvider } from '../src/lib/ai-engine.server';
import { validateAiOutput } from '../src/lib/ai-output.server';
import { enforceEvidence } from '../src/lib/trust.server';
import { deriveLiveDecision } from '../src/lib/decision-experience/live-model';

const providers: AiProvider[] = ['gemini', 'openai', 'anthropic', 'openrouter'];
const keys: Record<AiProvider, string> = { openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const target = process.env.COANTO_E2E_URL?.trim() || 'https://www.allbirds.com/';
function parseJsonObject(text:string):unknown{const cleaned=text.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/i,'').trim();for(let start=cleaned.indexOf('{');start>=0;start=cleaned.indexOf('{',start+1)){let depth=0,quoted=false,escaped=false;for(let i=start;i<cleaned.length;i+=1){const char=cleaned[i];if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}if(char==='"'){quoted=true;continue;}if(char==='{')depth+=1;else if(char==='}'){depth-=1;if(depth===0){const candidate=cleaned.slice(start,i+1);try{return JSON.parse(candidate);}catch{break;}}}}}throw new Error('provider returned no valid JSON object');}
function canonical(value:string){try{return new URL(value).toString();}catch{return'';}}
function decisionDiagnostics(value:Record<string,unknown>){const rows=Array.isArray(value['priorityMatrix'])?value['priorityMatrix']:[];return rows.slice(0,5).map((item)=>{const row=item&&typeof item==='object'?item as Record<string,unknown>:{};const urls=Array.isArray(row['sourceUrls'])?row['sourceUrls']:[];return{title:String(row['title']??'').slice(0,120),zone:String(row['zone']??'').slice(0,40),linkage:String(row['decisionEvidenceStatus']??'unknown'),sources:urls.length,hasWhy:Boolean(String(row['why']??row['reason']??row['rationale']??'').trim()),hasCounter:Array.isArray(row['counterEvidence'])&&row['counterEvidence'].length>0,hasTrigger:Boolean(String(row['trigger']??'').trim())};});}

async function main(){
  const main=await fetchSite(target);
  const grounded=await discoverCompetitorsWithGemini(main);
  let discovered=filterCommercialCompetitors(main,grounded.snapshots);
  if(!discovered.length){const legacy=await discoverCompetitors(main);discovered=filterCommercialCompetitors(main,[...grounded.snapshots,...legacy]);}
  if(!discovered.length)throw new Error(`E2E discovery returned no verified competitors (gemini=${grounded.status}, candidates=${grounded.candidateCount}, snapshots=${grounded.snapshots.length}).`);

  const prompt=buildPrompt(main,discovered);
  const configured=providers.filter((provider)=>Boolean(process.env[keys[provider]]));
  if(!configured.length)throw new Error('No AI provider secret is configured for the live E2E test.');

  let successful=0;
  const failures:string[]=[];
  for(const provider of configured){
    const started=Date.now();
    try{
      const run=await runAiProvider(provider,prompt);
      const parsed=validateAiOutput(parseJsonObject(run.text));
      const trusted=enforceEvidence(parsed,main,discovered,run.sources);
      const competitors=Array.isArray(trusted['competitors'])?trusted['competitors']:[];
      if(!competitors.length)throw new Error('evidence gate removed every AI competitor');
      const evidenced=competitors.filter((item)=>{const row=item as Record<string,unknown>;return Boolean(String(row['evidence']??'').trim())&&Boolean(String(row['evidenceSourceType']??'').trim());});
      if(!evidenced.length)throw new Error('no competitor survived evidence enforcement');
      const metadata=trusted['metadata'] as Record<string,unknown>|undefined;
      if(metadata?.['claimLinkageChecked']!==true)throw new Error('claim linkage check did not run');
      if(metadata?.['decisionSourceLinkageChecked']!==true)throw new Error('decision source linkage check did not run');

      const diagnostics=decisionDiagnostics(trusted);
      console.log(`DECISION ROW DIAGNOSTICS ${provider}: ${JSON.stringify(diagnostics)}`);
      const decision=deriveLiveDecision(trusted);
      if(!decision.candidatePosture)throw new Error(`provider returned no recognizable Decision Event posture; rows=${JSON.stringify(diagnostics)}`);
      if(decision.posture==='INSUFFICIENT')throw new Error(`Decision Event remained insufficient after evidence gate: ${decision.promotionBlockedBy.join(', ') || 'unknown reason'}; rows=${JSON.stringify(diagnostics)}`);
      if(!decision.sourceUrls.length)throw new Error('Decision Event promoted without gated source URLs');
      const observedSources=new Set([main,...discovered].map((site)=>canonical(site.url)).filter(Boolean));
      const providerSources=new Set(run.sources.map(canonical).filter(Boolean));
      for(const source of decision.sourceUrls){
        const normalized=canonical(source);
        if(!observedSources.has(normalized)&&!providerSources.has(normalized))throw new Error(`Decision Event retained an unverified source: ${source}`);
      }

      successful+=1;
      console.log(`PASS ${provider} model=${run.model} competitors=${competitors.length} evidenced=${evidenced.length} decision=${decision.posture} complete=${decision.complete} latency=${Date.now()-started}ms sources=${decision.sourceUrls.length}`);
      if(!decision.complete)console.log(`CAUTION ${provider} bounded Decision Event is promotable but incomplete: ${decision.promotionBlockedBy.join(', ')}`);
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      failures.push(`${provider}: ${message}`);
      console.error(`FAIL ${provider} latency=${Date.now()-started}ms error=${message}`);
    }
  }
  console.log(`AI LIVE E2E RESULT: ${successful}/${configured.length} configured provider(s) passed.`);
  if(failures.length)console.log(`Provider failures: ${failures.join(' | ')}`);
  if(!successful)throw new Error(`No configured AI provider passed the live Decision Event E2E test. ${failures.join(' | ')}`.slice(0,1800));
  console.log('AI LIVE E2E PASS: at least one configured real AI provider completed discovery, evidence enforcement, decision-source gating, and Decision Event promotion.');
}
await main();