const models = [
  "openai/gpt-6-astra",
  "anthropic/claude-sonnet-5.5",
  "google/gemini-3.7-flash",
  "x-ai/grok-4.3",
  "qwen/qwen3.8-27b",
  "deepseek/deepseek-v4.1-flash",
  "mistralai/mistral-medium-3.5",
  "meta-llama/llama-4-maverick",
  "cohere/command-a-plus-05-2026",
  "unbiased/pareto-26.10-preview",
  "fireworks/ember-1",
  "perceptron/perceptron-mk1.5"
];

const cases = [
  {
    id: "heart-arabic-plan",
    lang: "ar",
    prompt: "اشرح بصريًا كيف ينتقل الدم من الوريد الأجوف حتى الشريان الأبهر. أعطني خطة بصرية فقط، لا شرحًا نصيًا طويلًا.",
    scene: ["heart.venaCava","heart.rightAtrium","heart.tricuspidValve","heart.rightVentricle","heart.pulmonaryValve","heart.pulmonaryArtery","circulation.lungs","heart.pulmonaryVeins","heart.leftAtrium","heart.mitralValve","heart.leftVentricle","heart.aorticValve","heart.aorta"]
  },
  {
    id: "heart-followup-continuity",
    lang: "ar",
    prompt: "نحن الآن مركزون على البطين الأيسر. المستخدم يسأل: لماذا لا يرجع الدم للخلف عندما ينقبض البطين؟ حافظ على نفس المشهد والسياق.",
    scene: ["heart.leftVentricle","heart.mitralValve","heart.aorticValve","heart.aorta"]
  },
  {
    id: "plant-growth",
    lang: "ar",
    prompt: "كيف تنمو النبتة من البذرة؟ نريد مشهدًا حيًا يوضح الفكرة بأقل كلام ممكن.",
    scene: ["seed","root","stem","leaf","water","sunlight"]
  },
  {
    id: "engine-combustion",
    lang: "en",
    prompt: "Explain visually how a four-stroke combustion engine works. The visual plan should make piston motion, valve timing, spark, and gas flow understandable.",
    scene: ["intakeValve","exhaustValve","piston","sparkPlug","cylinder","crankshaft","airFuel","exhaust"]
  },
  {
    id: "ambiguous-scene",
    lang: "ar",
    prompt: "المشهد يحتوي على: battery, wire, switch, lamp. المستخدم يسأل: ليش اللمبة ما عم تضوي؟ لا تخترع سببًا غير موجود. أعطني ما يجب فحصه بصريًا وبأي ترتيب.",
    scene: ["battery","wire","switch","lamp"]
  },
  {
    id: "vision-heart",
    lang: "en",
    prompt: "Inspect this heart reference image and produce a safe visual-explanation plan. Do not claim internal anatomy that is not actually visible.",
    scene: ["heart.exterior","heart.upperVessels","heart.sideVessels","heart.lowerVessels"],
    image: "https://bioart.niaid.nih.gov/api/bioarts/228/files/630873"
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
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action","targets","why"],
        properties: {
          action: { type: "string" },
          targets: { type: "array", items: { type: "string" }, maxItems: 6 },
          why: { type: "string" }
        }
      }
    },
    unknowns: { type: "array", items: { type: "string" } }
  }
};

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(text.slice(a,b+1)); } catch {}
  }
  return null;
}

function scoreOutput(data, scene) {
  if (!data || !Array.isArray(data.plan)) return { total: 0, json: 0, actions: 0, targets: 0, restraint: 0 };
  const json = 25;
  const actionsOk = data.plan.length ? data.plan.filter(x => allowedActions.has(x.action)).length / data.plan.length : 0;
  const allTargets = data.plan.flatMap(x => Array.isArray(x.targets) ? x.targets : []);
  const targetOk = allTargets.length ? allTargets.filter(t => scene.includes(t)).length / allTargets.length : 1;
  const restraint = Array.isArray(data.unknowns) ? 1 : 0;
  return {
    total: Math.round(json + actionsOk*30 + targetOk*35 + restraint*10),
    json,
    actions: Math.round(actionsOk*30),
    targets: Math.round(targetOk*35),
    restraint: Math.round(restraint*10)
  };
}

async function run(model, test) {
  const content = [{ type: "text", text: [
    "You are NAHLATY Visual Brain.",
    "Return ONLY valid JSON matching the requested schema.",
    "Use only these visual actions: " + [...allowedActions].join(", ") + ".",
    "Never invent a target that is not in the supplied scene inventory.",
    "If evidence is insufficient, put the uncertainty in unknowns and fail closed.",
    "Prefer visual actions over prose.",
    "Scene inventory: " + JSON.stringify(test.scene),
    "User request: " + test.prompt
  ].join("\n") }];
  if (test.image) content.push({ type: "image_url", image_url: { url: test.image } });

  const body = {
    model,
    messages: [{ role: "user", content }],
    temperature: 0,
    max_tokens: 1400,
    response_format: {
      type: "json_schema",
      json_schema: { name: "nahlaty_visual_plan", strict: true, schema }
    }
  };

  const start = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://coanto.com",
      "X-Title": "NAHLATY Visual Brain Benchmark"
    },
    body: JSON.stringify(body)
  });
  const latencyMs = Date.now() - start;
  const raw = await res.text();
  if (!res.ok) return { model, caseId: test.id, ok: false, status: res.status, latencyMs, error: raw.slice(0,1200) };
  const payload = JSON.parse(raw);
  const text = payload?.choices?.[0]?.message?.content || "";
  const parsed = parseJson(text);
  const usage = payload?.usage || {};
  return { model, caseId: test.id, ok: true, latencyMs, usage, score: scoreOutput(parsed, test.scene), output: parsed, raw: text };
}

if (!process.env.OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY is missing");
  process.exit(2);
}

const results = [];
for (const model of models) {
  for (const test of cases) {
    try {
      const r = await run(model, test);
      results.push(r);
      console.log(JSON.stringify({model, caseId:test.id, ok:r.ok, score:r.score?.total ?? null, latencyMs:r.latencyMs, promptTokens:r.usage?.prompt_tokens ?? null, completionTokens:r.usage?.completion_tokens ?? null, status:r.status ?? 200}));
    } catch (e) {
      results.push({ model, caseId:test.id, ok:false, error:String(e) });
      console.log(JSON.stringify({model, caseId:test.id, ok:false, error:String(e)}));
    }
  }
}

const summary = models.map(model => {
  const rows = results.filter(r => r.model === model);
  const ok = rows.filter(r => r.ok);
  return {
    model,
    success: ok.length,
    failures: rows.length - ok.length,
    meanScore: ok.length ? +(ok.reduce((s,r)=>s+(r.score?.total||0),0)/ok.length).toFixed(1) : null,
    meanLatencyMs: ok.length ? Math.round(ok.reduce((s,r)=>s+r.latencyMs,0)/ok.length) : null,
    promptTokens: ok.reduce((s,r)=>s+(r.usage?.prompt_tokens||0),0),
    completionTokens: ok.reduce((s,r)=>s+(r.usage?.completion_tokens||0),0)
  };
}).sort((a,b)=>(b.meanScore??-1)-(a.meanScore??-1));

const report = { generatedAt:new Date().toISOString(), benchmark:"NAHLATY Visual Brain v1", cases:cases.map(c=>c.id), models, summary, results };
await import("node:fs/promises").then(fs => fs.writeFile("nahlaty-visual-brain-benchmark.json", JSON.stringify(report,null,2)));
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary,null,2));
