const candidateFamilies = [
  { label: "GPT", patterns: [/^openai\/gpt-6-astra$/i,/^openai\/gpt-5\.6/i,/^openai\/gpt-5\.5/i,/^openai\/gpt-5/i] },
  { label: "Claude", patterns: [/^anthropic\/claude-sonnet-5\.5/i,/^anthropic\/claude-sonnet-5/i,/^anthropic\/claude-sonnet-4\.5/i,/^anthropic\/claude-sonnet-4/i] },
  { label: "Gemini", patterns: [/^google\/gemini-3\.7-(pro|flash)/i,/^google\/gemini-3\.5/i,/^google\/gemini-3/i] },
  { label: "Grok", patterns: [/^x-ai\/grok-4\.3/i,/^x-ai\/grok-4/i] },
  { label: "Qwen", patterns: [/^qwen\/qwen3\.8-27b/i,/^qwen\/qwen3\.8/i,/^qwen\/qwen3/i] },
  { label: "DeepSeek", patterns: [/^deepseek\/deepseek-v4\.1-flash/i,/^deepseek\/deepseek-v4\.1/i,/^deepseek\/deepseek-v4/i] },
  { label: "Mistral", patterns: [/^mistralai\/mistral-medium-3\.5/i,/^mistralai\/mistral-medium/i,/^mistralai\/mistral-large/i] },
  { label: "Llama", patterns: [/^meta-llama\/llama-4-maverick/i,/^meta-llama\/llama-4/i] },
  { label: "Cohere", patterns: [/^cohere\/command-a-plus/i,/^cohere\/command-a/i,/^cohere\/command-r-plus/i] },
  { label: "Perceptron", patterns: [/^perceptron\/perceptron-mk1\.5/i,/^perceptron\//i] },
  { label: "Pareto", patterns: [/^unbiased\/pareto-26\.10-preview/i,/^unbiased\/pareto/i] },
  { label: "Fireworks", patterns: [/^fireworks\/ember-1/i,/^fireworks\//i] }
];

const scenarios = [
  {
    id: "heart",
    scene: ["heart.venaCava","heart.rightAtrium","heart.tricuspidValve","heart.rightVentricle","heart.pulmonaryValve","heart.pulmonaryArtery","circulation.lungs","heart.pulmonaryVeins","heart.leftAtrium","heart.mitralValve","heart.leftVentricle","heart.aorticValve","heart.aorta"],
    initial: "اشرح بصريًا كيف ينتقل الدم من الوريد الأجوف حتى الشريان الأبهر. اجعل المشهد نفسه يشرح الفكرة بأقل نص ممكن.",
    followup: "الآن المستخدم يسأل: لماذا لا يرجع الدم للخلف عندما ينقبض البطين الأيسر؟ حافظ على نفس المشهد والسياق ولا تبدأ الشرح من الصفر.",
    initialRules: {
      requiredTargets: ["heart.venaCava","heart.rightAtrium","heart.rightVentricle","circulation.lungs","heart.pulmonaryVeins","heart.leftAtrium","heart.leftVentricle","heart.aorta"],
      orderedTargets: ["heart.venaCava","heart.rightAtrium","heart.rightVentricle","heart.pulmonaryArtery","circulation.lungs","heart.pulmonaryVeins","heart.leftAtrium","heart.leftVentricle","heart.aorta"],
      groups: [["heart.rightAtrium","heart.tricuspidValve","heart.rightVentricle"],["heart.leftAtrium","heart.mitralValve","heart.leftVentricle"],["heart.leftVentricle","heart.aorticValve","heart.aorta"]],
      preferredActions: ["flow","sequence","focus","zoom"]
    },
    followupRules: {
      requiredTargets: ["heart.leftVentricle","heart.mitralValve","heart.aorticValve"],
      orderedTargets: [],
      groups: [["heart.leftVentricle","heart.mitralValve"],["heart.leftVentricle","heart.aorticValve"]],
      preferredActions: ["focus","isolate","animate","flow","setParameter"],
      forbiddenTargets: ["heart.rightAtrium","heart.rightVentricle","circulation.lungs"]
    }
  },
  {
    id: "engine",
    scene: ["intakeValve","exhaustValve","piston","sparkPlug","cylinder","crankshaft","airFuel","exhaust"],
    initial: "Explain visually how a four-stroke combustion engine works. Make intake, compression, power, exhaust, piston motion, valve timing, spark, and gas flow understandable with minimal prose.",
    followup: "Now the user asks what changes visually at the exact transition from exhaust to the next intake stroke. Keep the same engine scene and continue from where we are.",
    initialRules: {
      requiredTargets: ["intakeValve","exhaustValve","piston","sparkPlug","crankshaft","airFuel","exhaust"],
      orderedTargets: ["intakeValve","airFuel","sparkPlug","exhaustValve","exhaust"],
      groups: [["intakeValve","piston","airFuel"],["sparkPlug","piston","cylinder"],["exhaustValve","piston","exhaust"],["piston","crankshaft"]],
      preferredActions: ["sequence","animate","flow","setParameter","focus"]
    },
    followupRules: {
      requiredTargets: ["exhaustValve","intakeValve","piston","crankshaft"],
      orderedTargets: ["exhaustValve","intakeValve"],
      groups: [["exhaustValve","piston"],["intakeValve","piston"],["piston","crankshaft"]],
      preferredActions: ["focus","animate","sequence","setParameter"],
      forbiddenTargets: ["sparkPlug"]
    }
  },
  {
    id: "plant",
    scene: ["seed","root","stem","leaf","water","sunlight"],
    initial: "كيف تنمو النبتة من البذرة؟ ابنِ شرحًا بصريًا حيًا من الإنبات حتى ظهور الأوراق، بأقل كلام ممكن.",
    followup: "بعد ظهور الأوراق، المستخدم يسأل: ماذا سيتغير في نفس المشهد إذا لم يصل ضوء كافٍ؟ لا تعِد القصة من البداية.",
    initialRules: {
      requiredTargets: ["seed","water","root","stem","leaf","sunlight"],
      orderedTargets: ["seed","water","root","stem","leaf","sunlight"],
      groups: [["seed","water"],["root","stem"],["leaf","sunlight"]],
      preferredActions: ["sequence","reveal","animate","flow","setParameter","focus"]
    },
    followupRules: {
      requiredTargets: ["leaf","sunlight"],
      orderedTargets: [],
      groups: [["leaf","sunlight"]],
      preferredActions: ["focus","setParameter","animate","isolate"],
      forbiddenTargets: ["seed","root"]
    }
  }
];

const allowedActions = new Set(["focus","zoom","pan","reveal","hide","isolate","setLayer","animate","pulse","flow","cutaway","setParameter","sequence","restore"]);
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary","plan","unknowns"],
  properties: {
    summary: { type: "string" },
    plan: {
      type: "array", minItems: 1, maxItems: 12,
      items: {
        type: "object", additionalProperties: false,
        required: ["action","targets","why"],
        properties: {
          action: { type: "string" },
          targets: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
          why: { type: "string" }
        }
      }
    },
    unknowns: { type: "array", items: { type: "string" } }
  }
};

function parseJson(text) {
  if (typeof text !== "string") return null;
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a,b+1)); } catch {} }
  return null;
}
function targetSequence(data) {
  const seq = [];
  for (const step of data?.plan || []) for (const t of step.targets || []) if (!seq.includes(t)) seq.push(t);
  return seq;
}
function ratio(n,d){ return d ? n/d : 1; }
function orderedScore(seq, expected) {
  if (!expected?.length) return 1;
  let last = -1, ok = 0;
  for (const t of expected) {
    const idx = seq.indexOf(t);
    if (idx >= 0 && idx > last) { ok++; last = idx; }
  }
  return ratio(ok, expected.length);
}
function groupScore(data, groups) {
  if (!groups?.length) return 1;
  let ok=0;
  for (const g of groups) {
    if ((data?.plan||[]).some(step => g.every(t => (step.targets||[]).includes(t)))) ok++;
  }
  return ratio(ok, groups.length);
}
function scoreOutput(data, scene, rules, isFollowup) {
  if (!data || !Array.isArray(data.plan)) return { total:0, technical:0, semantic:0, visual:0, continuity:isFollowup?0:null };
  const steps = data.plan;
  const actionsValid = ratio(steps.filter(s=>allowedActions.has(s.action)).length,steps.length);
  const allTargets = steps.flatMap(s=>Array.isArray(s.targets)?s.targets:[]);
  const targetsValid = ratio(allTargets.filter(t=>scene.includes(t)).length,allTargets.length);
  const technical = 5 + actionsValid*5 + targetsValid*5 + (Array.isArray(data.unknowns)?5:0);

  const used = new Set(allTargets);
  const reqCov = ratio((rules.requiredTargets||[]).filter(t=>used.has(t)).length,(rules.requiredTargets||[]).length);
  const seq = targetSequence(data);
  const order = orderedScore(seq,rules.orderedTargets||[]);
  const groups = groupScore(data,rules.groups||[]);
  const semantic = reqCov*15 + order*10 + groups*10;

  const uniqueActions = new Set(steps.map(s=>s.action).filter(a=>allowedActions.has(a)));
  const preferred = new Set(rules.preferredActions||[]);
  const preferredUsed = [...uniqueActions].filter(a=>preferred.has(a)).length;
  const prefScore = ratio(preferredUsed,Math.min(3,preferred.size||1));
  const diversity = Math.min(uniqueActions.size/4,1);
  const economy = steps.length >= 3 && steps.length <= 9 ? 1 : steps.length <= 12 ? 0.6 : 0;
  const visual = prefScore*12 + diversity*7 + economy*6;

  let continuity = null;
  let rawMax = 80;
  let raw = technical + semantic + visual;
  if (isFollowup) {
    const forbidden = new Set(rules.forbiddenTargets||[]);
    const forbiddenUsed = allTargets.filter(t=>forbidden.has(t)).length;
    const focus = Math.max(0,1 - forbiddenUsed/Math.max(1,allTargets.length));
    const concise = steps.length <= 6 ? 1 : steps.length <= 9 ? 0.5 : 0;
    continuity = focus*12 + concise*8;
    raw += continuity;
    rawMax = 100;
  }
  return {
    total: Math.round((raw/rawMax)*1000)/10,
    technical: Math.round(technical*10)/10,
    semantic: Math.round(semantic*10)/10,
    visual: Math.round(visual*10)/10,
    continuity: continuity==null?null:Math.round(continuity*10)/10
  };
}

async function openRouter(path, options={}) {
  return fetch("https://openrouter.ai/api/v1"+path, {
    ...options,
    headers: {
      Authorization: "Bearer "+process.env.OPENROUTER_API_KEY,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://coanto.com",
      "X-Title": "NAHLATY Visual Brain Final Benchmark",
      ...(options.headers||{})
    }
  });
}

async function resolveModels() {
  const res = await openRouter("/models");
  if (!res.ok) throw new Error("OpenRouter model catalog failed: "+res.status+" "+(await res.text()).slice(0,500));
  const payload = await res.json();
  const catalog = payload.data || [];
  return candidateFamilies.map(f => {
    let chosen = null;
    for (const p of f.patterns) {
      chosen = catalog.find(m => p.test(m.id));
      if (chosen) break;
    }
    return { label:f.label, id:chosen?.id||null, name:chosen?.name||null, pricing:chosen?.pricing||null };
  });
}

function baseInstruction(scene) {
  return [
    "You are NAHLATY Visual Brain.",
    "Your job is to control a live interactive visual scene, not to write an essay.",
    "Return ONLY valid JSON matching the requested schema.",
    "Use only these visual actions: "+[...allowedActions].join(", ")+".",
    "Use ONLY targets from the supplied scene inventory.",
    "Prefer changes the user can SEE: focus, flow, sequence, animation, parameter/state changes, reveal/hide/cutaway.",
    "Use the fewest steps that make the mechanism visually understandable.",
    "Do not invent anatomy, mechanics, biology, or hidden facts.",
    "Scene inventory: "+JSON.stringify(scene)
  ].join("\n");
}

async function callModel(model, messages, scene, rules, isFollowup) {
  const body = {
    model,
    messages,
    temperature: 0,
    max_tokens: 1400,
    response_format: { type:"json_schema", json_schema:{ name:"nahlaty_visual_plan", strict:true, schema } }
  };
  const start=Date.now();
  let res=await openRouter("/chat/completions",{method:"POST",body:JSON.stringify(body)});
  let formatRetry=false;
  if (!res.ok && [400,404,422].includes(res.status)) {
    const first=await res.text();
    formatRetry=true;
    const fallback={...body};
    delete fallback.response_format;
    fallback.messages=[
      {role:"system",content:baseInstruction(scene)},
      ...messages.filter(m=>m.role!=="system")
    ];
    res=await openRouter("/chat/completions",{method:"POST",body:JSON.stringify(fallback)});
    if (!res.ok) return {ok:false,status:res.status,latencyMs:Date.now()-start,error:(await res.text()).slice(0,1200),firstError:first.slice(0,500),formatRetry};
  }
  if (!res.ok) return {ok:false,status:res.status,latencyMs:Date.now()-start,error:(await res.text()).slice(0,1200),formatRetry};
  const payload=await res.json();
  const text=payload?.choices?.[0]?.message?.content||"";
  const parsed=parseJson(text);
  return {
    ok:!!parsed,
    status:200,
    latencyMs:Date.now()-start,
    usage:payload?.usage||{},
    score:scoreOutput(parsed,scene,rules,isFollowup),
    output:parsed,
    raw:text,
    formatRetry
  };
}

if (!process.env.OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY is missing");
  process.exit(2);
}

const resolved=await resolveModels();
const active=resolved.filter(x=>x.id);
console.log("=== RESOLVED MODELS ===");
console.log(JSON.stringify(resolved,null,2));

const results=[];
for (const model of active) {
  for (const scenario of scenarios) {
    const initialMessages=[
      {role:"system",content:baseInstruction(scenario.scene)},
      {role:"user",content:scenario.initial}
    ];
    let first;
    try { first=await callModel(model.id,initialMessages,scenario.scene,scenario.initialRules,false); }
    catch(e){ first={ok:false,error:String(e)}; }
    results.push({candidate:model.label,model:model.id,scenario:scenario.id,turn:"initial",...first});
    console.log(JSON.stringify({candidate:model.label,model:model.id,scenario:scenario.id,turn:"initial",ok:first.ok,score:first.score?.total??null,latencyMs:first.latencyMs??null,cost:first.usage?.cost??null}));

    if (!first.ok || !first.output) {
      results.push({candidate:model.label,model:model.id,scenario:scenario.id,turn:"followup",ok:false,error:"initial-turn-failed"});
      continue;
    }
    const followMessages=[
      {role:"system",content:baseInstruction(scenario.scene)},
      {role:"user",content:scenario.initial},
      {role:"assistant",content:JSON.stringify(first.output)},
      {role:"user",content:scenario.followup}
    ];
    let second;
    try { second=await callModel(model.id,followMessages,scenario.scene,scenario.followupRules,true); }
    catch(e){ second={ok:false,error:String(e)}; }
    results.push({candidate:model.label,model:model.id,scenario:scenario.id,turn:"followup",...second});
    console.log(JSON.stringify({candidate:model.label,model:model.id,scenario:scenario.id,turn:"followup",ok:second.ok,score:second.score?.total??null,latencyMs:second.latencyMs??null,cost:second.usage?.cost??null}));
  }
}

const summary=active.map(model=>{
  const rows=results.filter(r=>r.model===model.id);
  const ok=rows.filter(r=>r.ok);
  const initial=ok.filter(r=>r.turn==="initial");
  const follow=ok.filter(r=>r.turn==="followup");
  const mean=a=>a.length?+(a.reduce((s,r)=>s+(r.score?.total||0),0)/a.length).toFixed(1):null;
  return {
    candidate:model.label,
    model:model.id,
    success:ok.length,
    failures:rows.length-ok.length,
    initialScore:mean(initial),
    followupScore:mean(follow),
    finalScore:mean(ok),
    meanLatencyMs:ok.length?Math.round(ok.reduce((s,r)=>s+(r.latencyMs||0),0)/ok.length):null,
    totalCostUsd:+ok.reduce((s,r)=>s+(Number(r.usage?.cost)||0),0).toFixed(6),
    promptTokens:ok.reduce((s,r)=>s+(r.usage?.prompt_tokens||0),0),
    completionTokens:ok.reduce((s,r)=>s+(r.usage?.completion_tokens||0),0),
    formatRetries:ok.filter(r=>r.formatRetry).length
  };
}).sort((a,b)=>(b.finalScore??-1)-(a.finalScore??-1) || (a.meanLatencyMs??1e12)-(b.meanLatencyMs??1e12));

const report={
  generatedAt:new Date().toISOString(),
  benchmark:"NAHLATY Visual Brain FINAL v2",
  design:"3 domains x initial+contextual follow-up; semantic/scientific, visual-control, continuity, technical, latency and cost",
  resolvedModels:resolved,
  scenarios:scenarios.map(s=>s.id),
  summary,
  results
};
await import("node:fs/promises").then(fs=>fs.writeFile("nahlaty-visual-brain-benchmark.json",JSON.stringify(report,null,2)));
console.log("\n=== FINAL SUMMARY ===");
console.log(JSON.stringify(summary,null,2));
