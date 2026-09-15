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
  hashtag?: string;
  platform: string;
  signalStrength: 'قوية' | 'متوسطة' | 'أولية';
  freshness: string;
  state: 'استخدم الآن' | 'راقب' | 'تجاهل';
  whyNow: string;
  businessFit: string;
  contentAngle: string;
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
  return { sources: [...sources.values()].slice(0, 16), queries: queries.slice(0, 12) };
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
        generationConfig: { temperature: useSearch ? 0.15 : 0.45, maxOutputTokens: 5000 },
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
    `المنصات: ${(profile.platforms?.length ? profile.platforms : ['TikTok', 'Instagram Reels', 'X early signals']).join(', ')}`,
  ].join('\n');
}

export async function discoverRelevantTrends(profile: TrendPulseProfile): Promise<TrendDiscoveryResult> {
  const prompt = `أنت محرك Trend Intelligence عربي مخصص لأصحاب المشاريع الصغيرة الذين يبيعون منتجًا ماديًا على السوشيال ميديا.\n\nملف النشاط:\n${profileText(profile)}\n\nالمهمة:\nابحث الآن في الويب العام باستخدام Google Search عن إشارات حديثة وذات صلة بهذا النشاط. ركّز على TikTok وInstagram/Reels كمنصات نشر، واستخدم X فقط كمصدر early signal، وYouTube Shorts كمصدر ثانوي. ابحث أيضًا عن المواسم والمناسبات المحلية السعودية والخليجية عندما تكون ذات صلة.\n\nقواعد صارمة:\n- لا تعرض ترندًا فقط لأنه مشهور؛ يجب أن تشرح لماذا يناسب هذا النشاط والمنتج والجمهور.\n- لا تخترع نسب نمو أو مشاهدات أو أرقامًا غير موجودة في دليل واضح.\n- إذا كانت الأدلة ضعيفة، signalStrength يجب أن تكون "أولية" وconfidenceNote يشرح ذلك.\n- state يجب أن تكون فقط: "استخدم الآن" أو "راقب" أو "تجاهل".\n- signalStrength يجب أن تكون فقط: "قوية" أو "متوسطة" أو "أولية".\n- الأولوية لمحتوى يمكن تنفيذه خلال 24-72 ساعة.\n- لا تعطِ ادعاءات طبية أو مالية أو وعود نتائج غير مثبتة.\n- العربية بسيطة جدًا ومناسبة لصاحب متجر، بدون مصطلحات تحليلية معقدة.\n- لا تقل إن لدينا وصول API مباشر إلى TikTok أو Instagram.\n\nأعد JSON فقط بهذا الشكل:\n{\n  "summary":"خلاصة قصيرة من سطرين",\n  "trustNote":"ما الذي نعرفه وما الذي لا نعرفه",\n  "trends":[\n    {\n      "title":"...",\n      "hashtag":"... أو فارغ",\n      "platform":"TikTok|Instagram Reels|X|YouTube Shorts|Cross-platform",\n      "signalStrength":"قوية|متوسطة|أولية",\n      "freshness":"مثال: اليوم / آخر 48 ساعة / هذا الأسبوع",\n      "state":"استخدم الآن|راقب|تجاهل",\n      "whyNow":"...",\n      "businessFit":"لماذا يهم هذا المنتج تحديدًا",\n      "contentAngle":"زاوية تنفيذية واحدة",\n      "saturationRisk":"منخفض|متوسط|مرتفع + تفسير قصير",\n      "confidenceNote":"...",\n      "evidenceSummary":"ما نوع الأدلة التي دعمت الإشارة"\n    }\n  ]\n}\n\nأعد 4 إلى 8 إشارات فقط. إذا لم تجد أدلة كافية، أعد عددًا أقل بدل اختراع نتائج.`;
  const { data, text } = await geminiRequest([{ text: prompt }], true);
  const parsed = parseJsonObject(text);
  const grounding = collectGrounding(data);
  const trends = arr(parsed['trends']).slice(0, 8).map((value, index): TrendSignal => {
    const item = record(value);
    const strength = str(item['signalStrength']);
    const state = str(item['state']);
    return {
      id: `trend-${Date.now()}-${index}`,
      title: str(item['title'], `إشارة ${index + 1}`),
      hashtag: str(item['hashtag']),
      platform: str(item['platform'], 'Cross-platform'),
      signalStrength: strength === 'قوية' || strength === 'متوسطة' ? strength : 'أولية',
      freshness: str(item['freshness'], 'حديثة'),
      state: state === 'استخدم الآن' || state === 'تجاهل' ? state : 'راقب',
      whyNow: str(item['whyNow'], 'توجد إشارة حديثة تستحق المراجعة.'),
      businessFit: str(item['businessFit'], 'الملاءمة تحتاج اختبارًا عمليًا.'),
      contentAngle: str(item['contentAngle'], 'قدّم المنتج ضمن سياق الإشارة بدل مطاردة الترند حرفيًا.'),
      saturationRisk: str(item['saturationRisk'], 'غير محسوم'),
      confidenceNote: str(item['confidenceNote'], 'الثقة مرتبطة بقوة الأدلة العامة المتاحة.'),
      evidenceSummary: str(item['evidenceSummary']),
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    summary: str(parsed['summary'], 'تمت مراجعة الإشارات الحديثة وربطها بملف نشاطك.'),
    trends,
    sources: grounding.sources,
    searchQueries: grounding.queries,
    trustNote: str(parsed['trustNote'], 'النتائج مبنية على بحث ويب عام وليست وصولًا مباشرًا لبيانات المنصات.'),
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
  const prompt = `أنت كاتب محتوى أداء عربي لمتجر صغير.\n\nملف النشاط:\n${profileText(input.profile)}\n\nالإشارة المختارة:\n${JSON.stringify(input.trend)}\n\nصيغة المحتوى: ${input.format || 'TikTok / Reels'}\n\nاكتب محتوى قابل للتصوير اليوم، لا تنظير. اربط المنتج بالترند طبيعيًا بدون حشر أو تقليد أعمى. إذا كانت الصورة مرفقة، استخدم ما يظهر فيها فقط ولا تخترع خصائص غير ظاهرة.\n\nقواعد:\n- 5 هوكات مختلفة، قصيرة وقوية بدون clickbait كاذب.\n- سكربت 25-35 ثانية، بجمل قصيرة.\n- CTA واحد مناسب لهدف النشاط.\n- Caption جاهز.\n- 5 إلى 8 هاشتاغات فقط.\n- shotPlan بسيط يستطيع صاحب متجر تصويره بالجوال.\n- 3 ردود جاهزة لتعليقات محتملة.\n- لا وعود مالية/طبية أو ادعاءات منتج غير موجودة في الملف.\n- اللهجة المطلوبة: ${input.profile.dialect || 'سعودي'}.\n\nأعد JSON فقط:\n{"hook":"أفضل هوك","hooks":["..."],"body":["..."],"cta":"...","caption":"...","hashtags":["#..."],"shotPlan":["..."],"commentReplies":["..."],"duration":"25-35 ثانية","safetyNote":"..."}`;
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
