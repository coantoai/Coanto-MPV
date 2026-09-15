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
        generationConfig: { temperature: useSearch ? 0.12 : 0.42, maxOutputTokens: 5600 },
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

export async function discoverRelevantTrends(profile: TrendPulseProfile): Promise<TrendDiscoveryResult> {
  const prompt = `أنت محرك TRENDS PULSE: رادار ذكاء يومي عربي لأصحاب المشاريع الصغيرة الذين يعتمدون على السوشيال ميديا في البيع.\n\nملف المستخدم:\n${profileText(profile)}\n\nالهدف الحقيقي:\nالمستخدم لا يريد منصة نشر محتوى فقط. هو يريد بدل أن يفتح TikTok وInstagram وX وYouTube وGoogle والمواقع ويبحث بنفسه، أن يجد هنا فقط ما يستحق انتباهه اليوم.\n\nابحث الآن في الويب العام عبر Google Search عن إشارات حديثة من أو حول TikTok وInstagram/Reels وYouTube/Shorts وX وGoogle والويب والأخبار المحلية. ابحث أيضًا عن المواسم والمناسبات السعودية والخليجية والعودة للمدارس ورمضان والعيد واليوم الوطني ويوم التأسيس والجمعة البيضاء وغيرها عندما يكون توقيتها ذا صلة.\n\nابحث عن ستة أنواع من الإشارات، وليس هاشتاغات فقط:\n1) ترند محتوى أو صيغة منتشرة.\n2) خبر أو تغيير مهم في منصة/سوق/سلوك.\n3) إشارة مبكرة بدأت تظهر قبل أن تصبح مزدحمة.\n4) موسم أو مناسبة قادمة تحتاج تحضيرًا.\n5) أداة/ميزة جديدة قد توفر وقتًا أو تفتح فرصة.\n6) تغيّر أو نمط في سلوك الجمهور أو ما يتحدث عنه.\n\nقواعد الثقة:\n- لا تعرض شيئًا لمجرد أنه مشهور. يجب أن يكون له سبب واضح يخص هذا النشاط أو جمهوره أو طريقة بيعه.\n- لا تخترع نسب نمو أو مشاهدات أو أرقامًا. إذا لا يوجد رقم موثق لا تذكر رقمًا.\n- فرّق بين ما حدث، ولماذا يهم، وما الذي تقترحه.\n- إذا الدليل ضعيف اجعل signalStrength = "أولية" وفسّر ذلك.\n- state فقط: "استخدم الآن" أو "راقب" أو "تجاهل". "استخدم الآن" تعني تحرّك الآن، وليس بالضرورة انشر محتوى.\n- contentPotential فقط: "عالٍ" أو "متوسط" أو "منخفض". المحتوى خيار تنفيذ واحد فقط، وليس الغاية الأساسية.\n- recommendedAction يجب أن يكون فعلًا بسيطًا لصاحب المشروع: جهّز عرض، راقب، اختبر زاوية، حدث البايو، جرّب ميزة، انشر، لا تفعل شيئًا... حسب الإشارة.\n- triggerToWatch يشرح ما الذي إذا حدث يجعل WATCH يتحول إلى تحرّك.\n- لا تقل إن لدينا API مباشر للمنصات. النتائج مبنية على بحث ويب عام ومصادر متاحة عبر Google grounding.\n- العربية بسيطة وعملية جدًا.\n\nأعد JSON فقط:\n{\n  "summary":"أهم ما يستحق الانتباه الآن في سطرين",\n  "trustNote":"ما نعرفه وما لا نعرفه",\n  "trends":[\n    {\n      "title":"عنوان مفهوم",\n      "kind":"ترند|خبر|إشارة مبكرة|موسم|أداة/ميزة|سلوك جمهور",\n      "hashtag":"اختياري",\n      "platform":"TikTok|Instagram Reels|X|YouTube|Google|Web|Cross-platform",\n      "signalStrength":"قوية|متوسطة|أولية",\n      "freshness":"اليوم/آخر 48 ساعة/هذا الأسبوع/قادم خلال...",\n      "state":"استخدم الآن|راقب|تجاهل",\n      "whatHappened":"ماذا حدث فعلًا",\n      "whyNow":"لماذا ظهر الآن",\n      "businessFit":"لماذا يهم هذا النشاط تحديدًا",\n      "recommendedAction":"ماذا يفعل الآن",\n      "contentPotential":"عالٍ|متوسط|منخفض",\n      "contentAngle":"إذا كان مناسبًا للمحتوى، ما الزاوية؛ وإلا اتركها قصيرة",\n      "triggerToWatch":"ما الإشارة التالية التي نراقبها",\n      "saturationRisk":"منخفض|متوسط|مرتفع + تفسير",\n      "confidenceNote":"حدود الثقة",\n      "evidenceSummary":"نوع الأدلة التي دعمت الإشارة"\n    }\n  ]\n}\n\nأعد 5 إلى 9 إشارات فقط، مرتبة حسب أهميتها لهذا المستخدم. إذا لا توجد أدلة كافية أعد عددًا أقل ولا تملأ الفراغ.`;

  const { data, text } = await geminiRequest([{ text: prompt }], true);
  const parsed = parseJsonObject(text);
  const grounding = collectGrounding(data);
  const trends = arr(parsed['trends']).slice(0, 9).map((value, index): TrendSignal => {
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
      whatHappened: str(item['whatHappened'], 'ظهرت إشارة حديثة تستحق الفحص.'),
      whyNow: str(item['whyNow'], 'التوقيت مرتبط بحركة حديثة في السوق أو الجمهور.'),
      businessFit: str(item['businessFit'], 'الملاءمة تحتاج مراجعة بحسب نشاطك.'),
      recommendedAction: str(item['recommendedAction'], 'راقب الإشارة قبل اتخاذ خطوة.'),
      contentPotential: potential === 'عالٍ' || potential === 'منخفض' ? potential : 'متوسط',
      contentAngle: str(item['contentAngle']),
      triggerToWatch: str(item['triggerToWatch'], 'راقب تكرار الإشارة أو انتقالها لمنصات أخرى.'),
      saturationRisk: str(item['saturationRisk'], 'غير محسوم'),
      confidenceNote: str(item['confidenceNote'], 'الثقة مرتبطة بقوة الأدلة العامة المتاحة.'),
      evidenceSummary: str(item['evidenceSummary']),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: str(parsed['summary'], 'تمت مراجعة ما يتحرك الآن وربطه بملف نشاطك.'),
    trends,
    sources: grounding.sources,
    searchQueries: grounding.queries,
    trustNote: str(parsed['trustNote'], 'النتائج مبنية على بحث ويب عام ومصادر متاحة وليست وصولًا مباشرًا لبيانات المنصات الخاصة.'),
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
