export type TrendPulseProfile = {
  businessName?: string;
  storeUrl?: string;
  productName?: string;
  productPrice?: string;
  productDescription?: string;
  audience?: string;
  region?: string;
  city?: string;
  dialect?: string;
  tone?: string;
  objective?: string;
  prohibitedClaims?: string;
  platforms?: string[];
};

export type TrendSignal = {
  id: string;
  title: string;
  kind: 'ترند' | 'خبر' | 'إشارة مبكرة' | 'موسم' | 'أداة/ميزة' | 'سلوك جمهور';
  hashtag?: string;
  platform: string;
  signalStrength: 'قوية' | 'متوسطة' | 'أولية';
  freshness: string;
  state: 'استخدم الآن' | 'راقب' | 'تجاهل';
  whatHappened: string;
  whyNow: string;
  businessFit: string;
  recommendedAction: string;
  contentPotential: 'عالٍ' | 'متوسط' | 'منخفض';
  contentAngle: string;
  triggerToWatch: string;
  saturationRisk: string;
  confidenceNote: string;
  evidenceSummary?: string;
};

export type TrendDiscoveryResult = {
  generatedAt: string;
  summary: string;
  trends: TrendSignal[];
  sources: { title: string; url: string }[];
  searchQueries: string[];
  trustNote: string;
};

export type ScriptResult = {
  hook: string;
  hooks: string[];
  body: string[];
  cta: string;
  caption: string;
  hashtags: string[];
  shotPlan: string[];
  commentReplies: string[];
  duration: string;
  safetyNote: string;
};

type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function str(value: unknown, fallback = '') { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }

function parseJsonObject(text: string): JsonRecord {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  for (let start = cleaned.indexOf('{'); start >= 0; start = cleaned.indexOf('{', start + 1)) {
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quoted = false;
        continue;
      }
      if (ch === '"') { quoted = true; continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          try { return record(JSON.parse(cleaned.slice(start, i + 1))); } catch { break; }
        }
      }
    }
  }
  throw new Error('Gemini returned no valid JSON object.');
}

function cleanSourceUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch { return ''; }
}

function collectGrounding(data: JsonRecord) {
  const sources = new Map<string, { title: string; url: string }>();
  const queries: string[] = [];
  for (const candidateValue of arr(data['candidates'])) {
    const candidate = record(candidateValue);
    const metadata = record(candidate['groundingMetadata']);
    for (const query of arr(metadata['webSearchQueries'])) {
      const value = str(query); if (value && !queries.includes(value)) queries.push(value);
    }
    for (const chunkValue of arr(metadata['groundingChunks'])) {
      const web = record(record(chunkValue)['web']);
      const url = cleanSourceUrl(str(web['uri']));
      if (!url) continue;
      sources.set(url, { title: str(web['title'], new URL(url).hostname), url });
    }
  }
  return { sources: [...sources.values()].slice(0, 20), queries: queries.slice(0, 16) };
}

async function geminiRequest(parts: JsonRecord[], useSearch: boolean) {
  const apiKey = process.env['GEMINI_API_KEY']?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
  const model = process.env['GEMINI_MODEL']?.trim() || 'gemini-3.1-flash-lite';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: { temperature: useSearch ? 0.08 : 0.35, maxOutputTokens: 5600 },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = '';
      try { detail = str(record(record(await response.json())['error'])['message']); } catch {}
      throw new Error(`Gemini API failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`);
    }
    const data = record(await response.json());
    const texts: string[] = [];
    for (const candidateValue of arr(data['candidates'])) {
      const content = record(record(candidateValue)['content']);
      for (const partValue of arr(content['parts'])) {
        const text = str(record(partValue)['text']); if (text) texts.push(text);
      }
    }
    if (!texts.length) throw new Error('Gemini returned no text.');
    return { data, text: texts.join('\n').trim() };
  } finally { clearTimeout(timeout); }
}

function profileText(profile: TrendPulseProfile) {
  return [
    `اسم النشاط: ${profile.businessName || 'غير محدد'}`,
    `رابط المتجر/المنتج: ${profile.storeUrl || 'غير محدد'}`,
    `المنتج: ${profile.productName || 'غير محدد'}`,
    `السعر/العرض: ${profile.productPrice || 'غير محدد'}`,
    `وصف المنتج: ${profile.productDescription || 'غير محدد'}`,
    `الجمهور: ${profile.audience || 'غير محدد'}`,
    `المنطقة: ${profile.region || 'السعودية'}${profile.city ? ` / ${profile.city}` : ''}`,
    `اللهجة: ${profile.dialect || 'سعودي'}`,
    `النبرة: ${profile.tone || 'ودّي وواضح'}`,
    `الهدف: ${profile.objective || 'بيع'}`,
    `محظورات/قيود: ${profile.prohibitedClaims || 'لا توجد قيود إضافية'}`,
    `مصادر الاهتمام: ${(profile.platforms?.length ? profile.platforms : ['TikTok', 'Instagram Reels', 'X', 'YouTube', 'Google/Web']).join(', ')}`,
  ].join('\n');
}

function signalKind(value: string): TrendSignal['kind'] {
  return value === 'خبر' || value === 'إشارة مبكرة' || value === 'موسم' || value === 'أداة/ميزة' || value === 'سلوك جمهور' ? value : 'ترند';
}

async function collectLiveEvidence(profile: TrendPulseProfile) {
  const now = new Date().toISOString();
  const prompt = `استخدم Google Search الآن. لا تجب اعتمادًا على ذاكرتك القديمة.\n\nأنت باحث COANTO الذي يجمع أدلة حديثة قبل أي تحليل. التاريخ/الوقت الحالي في النظام: ${now}.\n\nملف المستخدم:\n${profileText(profile)}\n\nابحث في الويب عن أشياء حديثة أو قادمة يمكن أن تهم هذا النشاط تحديدًا. وسّع البحث عند الحاجة إلى TikTok وInstagram/Reels وYouTube/Shorts وX وGoogle والويب والأخبار المحلية والمواسم والمناسبات. لا تفترض وصولًا مباشرًا لبيانات خاصة من المنصات.\n\nمطلوب منك في هذه المرحلة فقط جمع الأدلة، وليس اتخاذ القرار النهائي ولا إخراج JSON. ابحث فعليًا باستخدام Google Search ثم اكتب مذكرة أدلة قصيرة تتضمن 6 إلى 12 ملاحظة كحد أقصى، وكل ملاحظة توضح: ماذا وجد البحث، مدى حداثته، ولماذا قد يكون ذا صلة بهذا المستخدم. إذا لم تجد ما يكفي، قل ذلك بوضوح. لا تخترع أرقام مشاهدات أو نمو أو شعبية.`;

  const first = await geminiRequest([{ text: prompt }], true);
  let grounding = collectGrounding(first.data);
  let evidenceText = first.text;

  if (!grounding.sources.length || !grounding.queries.length) {
    const retryPrompt = `استخدم Google Search الآن إلزاميًا قبل الإجابة. ابحث عن أحدث أخبار وترندات ومواسم وتغيّرات مرتبطة بـ ${profile.productName || profile.businessName || 'مشروع صغير'} في ${profile.region || 'السعودية'}، وركّز على ما حدث اليوم أو هذا الأسبوع أو ما سيحدث قريبًا. لا تعطِ تحليلًا عامًا من الذاكرة؛ أريد نتيجة مبنية على بحث ويب حي فقط.`;
    const retry = await geminiRequest([{ text: retryPrompt }], true);
    const retryGrounding = collectGrounding(retry.data);
    if (retryGrounding.sources.length) {
      grounding = retryGrounding;
      evidenceText = retry.text;
    }
  }

  if (!grounding.sources.length || !grounding.queries.length) {
    throw new Error('Google Search grounding returned no verifiable web sources.');
  }

  return { evidenceText, grounding, collectedAt: now };
}

export async function discoverRelevantTrends(profile: TrendPulseProfile): Promise<TrendDiscoveryResult> {
  const evidence = await collectLiveEvidence(profile);
  const sourceList = evidence.grounding.sources.map((source, index) => `${index + 1}. ${source.title}`).join('\n');

  const prompt = `أنت محرك COANTO: رادار ذكاء يومي عربي لأصحاب المشاريع الصغيرة الذين يعتمدون على السوشيال ميديا في البيع.\n\nملف المستخدم:\n${profileText(profile)}\n\nمهم جدًا: مرحلة البحث الحي انتهت قبل هذه الخطوة. لا تبحث من ذاكرتك ولا تضف أخبارًا أو أرقامًا جديدة. استخدم فقط مذكرة الأدلة التي جمعها Google Search أدناه، واربطها بهذا المستخدم.\n\nوقت جمع الأدلة: ${evidence.collectedAt}\n\nمذكرة الأدلة الحية:\n${evidence.evidenceText}\n\nعناوين المصادر التي استُخدمت في البحث:\n${sourceList}\n\nالهدف الحقيقي:\nالمستخدم لا يريد منصة نشر محتوى فقط. هو يريد بدل أن يفتح التطبيقات والمواقع ويبحث بنفسه، أن يجد هنا فقط ما يستحق انتباهه الآن، ولماذا، وما الذي يفعله.\n\nصنّف الإشارات الممكنة ضمن: ترند، خبر، إشارة مبكرة، موسم، أداة/ميزة، سلوك جمهور. لا تجبر وجود كل الأنواع إذا الأدلة لا تدعمها.\n\nقواعد الثقة:\n- لا تعرض شيئًا لمجرد أنه مشهور؛ يجب أن يكون له سبب واضح يخص النشاط أو جمهوره أو طريقة بيعه.\n- لا تخترع نسب نمو أو مشاهدات أو أرقامًا غير موجودة في مذكرة الأدلة.\n- فرّق بين ما حدث، ولماذا يهم، وما الذي تقترحه.\n- إذا الدليل ضعيف اجعل signalStrength = "أولية" وفسّر ذلك.\n- state فقط: "استخدم الآن" أو "راقب" أو "تجاهل". "استخدم الآن" يعني تحرّك الآن وليس بالضرورة انشر محتوى.\n- contentPotential فقط: "عالٍ" أو "متوسط" أو "منخفض". المحتوى خيار تنفيذ واحد وليس الغاية الأساسية.\n- recommendedAction يجب أن يكون فعلًا بسيطًا قابلًا للتنفيذ.\n- triggerToWatch يشرح ما الذي إذا حدث يجعل المراقبة تتحول إلى تحرّك.\n- العربية بسيطة وعملية جدًا.\n\nأعد JSON فقط بهذا الشكل:\n{\n  "summary":"أهم ما يستحق الانتباه الآن في سطرين",\n  "trustNote":"ما نعرفه وما لا نعرفه",\n  "trends":[\n    {\n      "title":"عنوان مفهوم",\n      "kind":"ترند|خبر|إشارة مبكرة|موسم|أداة/ميزة|سلوك جمهور",\n      "hashtag":"اختياري",\n      "platform":"TikTok|Instagram Reels|X|YouTube|Google|Web|Cross-platform",\n      "signalStrength":"قوية|متوسطة|أولية",\n      "freshness":"اليوم/آخر 48 ساعة/هذا الأسبوع/قادم خلال...",\n      "state":"استخدم الآن|راقب|تجاهل",\n      "whatHappened":"ماذا حدث فعلًا",\n      "whyNow":"لماذا ظهر الآن",\n      "businessFit":"لماذا يهم هذا النشاط تحديدًا",\n      "recommendedAction":"ماذا يفعل الآن",\n      "contentPotential":"عالٍ|متوسط|منخفض",\n      "contentAngle":"إذا كان مناسبًا للمحتوى، ما الزاوية",\n      "triggerToWatch":"ما الإشارة التالية التي نراقبها",\n      "saturationRisk":"منخفض|متوسط|مرتفع + تفسير",\n      "confidenceNote":"حدود الثقة",\n      "evidenceSummary":"أي نوع من الأدلة الحية دعمه"\n    }\n  ]\n}\n\nأعد 3 إلى 8 إشارات فقط مرتبة حسب أهميتها لهذا المستخدم. إذا الأدلة لا تكفي، أعد عددًا أقل ولا تملأ الفراغ.`;

  const { text } = await geminiRequest([{ text: prompt }], false);
  const parsed = parseJsonObject(text);
  const trends = arr(parsed['trends']).slice(0, 8).map((value, index): TrendSignal => {
    const item = record(value);
    const strength = str(item['signalStrength']);
    const state = str(item['state']);
    const potential = str(item['contentPotential']);
    return {
      id: `signal-${Date.now()}-${index}`,
      title: str(item['title'], `إشارة ${index + 1}`),
      kind: signalKind(str(item['kind'])),
      hashtag: str(item['hashtag']),
      platform: str(item['platform'], 'Cross-platform'),
      signalStrength: strength === 'قوية' || strength === 'متوسطة' ? strength : 'أولية',
      freshness: str(item['freshness'], 'حديثة'),
      state: state === 'استخدم الآن' || state === 'تجاهل' ? state : 'راقب',
      whatHappened: str(item['whatHappened'], 'ظهرت إشارة حديثة في البحث تستحق الفحص.'),
      whyNow: str(item['whyNow'], 'التوقيت مرتبط بما ظهر في البحث الحي.'),
      businessFit: str(item['businessFit'], 'الملاءمة تحتاج مراجعة بحسب نشاطك.'),
      recommendedAction: str(item['recommendedAction'], 'راقب الإشارة قبل اتخاذ خطوة.'),
      contentPotential: potential === 'عالٍ' || potential === 'منخفض' ? potential : 'متوسط',
      contentAngle: str(item['contentAngle']),
      triggerToWatch: str(item['triggerToWatch'], 'راقب تكرار الإشارة أو انتقالها لمنصات أخرى.'),
      saturationRisk: str(item['saturationRisk'], 'غير محسوم'),
      confidenceNote: str(item['confidenceNote'], 'الثقة مرتبطة بقوة الأدلة الحية المتاحة.'),
      evidenceSummary: str(item['evidenceSummary']),
    };
  });

  if (!trends.length) throw new Error('Grounded search returned no relevant COANTO signals.');

  return {
    generatedAt: new Date().toISOString(),
    summary: str(parsed['summary'], 'تمت مراجعة البحث الحي وربطه بملف نشاطك.'),
    trends,
    sources: evidence.grounding.sources,
    searchQueries: evidence.grounding.queries,
    trustNote: str(parsed['trustNote'], 'هذه النتائج مبنية على بحث ويب حي ومصادر ظاهرة، وليست وصولًا مباشرًا لبيانات المنصات الخاصة.'),
  };
}

function imagePartFromDataUrl(dataUrl?: string): JsonRecord | null {
  if (!dataUrl) return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  if (match[2].length > 2_800_000) throw new Error('Product image is too large.');
  return { inline_data: { mime_type: match[1], data: match[2] } };
}

export async function generateTrendScript(input: {
  profile: TrendPulseProfile;
  trend: TrendSignal;
  format?: string;
  imageDataUrl?: string;
}): Promise<ScriptResult> {
  const prompt = `أنت كاتب محتوى أداء عربي لمشروع صغير.\n\nملف النشاط:\n${profileText(input.profile)}\n\nالإشارة المختارة:\n${JSON.stringify(input.trend)}\n\nصيغة المحتوى: ${input.format || 'TikTok / Reels'}\n\nالمستخدم اختار بنفسه تحويل هذه الإشارة إلى محتوى. اكتب شيئًا قابلًا للتصوير اليوم، لا تنظير. اربط المنتج بالإشارة طبيعيًا بدون حشر أو تقليد أعمى. إذا كانت الصورة مرفقة استخدم فقط ما يظهر فيها ولا تخترع خصائص.\n\nقواعد:\n- 5 هوكات مختلفة، قصيرة وقوية بدون clickbait كاذب.\n- سكربت 25-35 ثانية، بجمل قصيرة.\n- CTA واحد مناسب لهدف النشاط.\n- Caption جاهز.\n- 5 إلى 8 هاشتاغات فقط.\n- shotPlan بسيط يستطيع صاحب مشروع تصويره بالجوال.\n- 3 ردود جاهزة لتعليقات محتملة.\n- لا وعود مالية/طبية أو ادعاءات منتج غير موجودة في الملف.\n- اللهجة المطلوبة: ${input.profile.dialect || 'سعودي'}.\n\nأعد JSON فقط:\n{"hook":"أفضل هوك","hooks":["..."],"body":["..."],"cta":"...","caption":"...","hashtags":["#..."],"shotPlan":["..."],"commentReplies":["..."],"duration":"25-35 ثانية","safetyNote":"..."}`;
  const parts: JsonRecord[] = [{ text: prompt }];
  const imagePart = imagePartFromDataUrl(input.imageDataUrl);
  if (imagePart) parts.push(imagePart);
  const { text } = await geminiRequest(parts, false);
  const parsed = parseJsonObject(text);
  return {
    hook: str(parsed['hook']),
    hooks: arr(parsed['hooks']).map((v) => str(v)).filter(Boolean).slice(0, 5),
    body: arr(parsed['body']).map((v) => str(v)).filter(Boolean).slice(0, 8),
    cta: str(parsed['cta']),
    caption: str(parsed['caption']),
    hashtags: arr(parsed['hashtags']).map((v) => str(v)).filter(Boolean).slice(0, 8),
    shotPlan: arr(parsed['shotPlan']).map((v) => str(v)).filter(Boolean).slice(0, 8),
    commentReplies: arr(parsed['commentReplies']).map((v) => str(v)).filter(Boolean).slice(0, 4),
    duration: str(parsed['duration'], '25-35 ثانية'),
    safetyNote: str(parsed['safetyNote'], 'راجع تفاصيل المنتج قبل النشر ولا تضف ادعاءات غير مثبتة.'),
  };
}
