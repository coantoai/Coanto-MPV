export type Lang = "ar" | "en";
export type Copy = { ar: string; en: string };
export const copy = (ar: string, en: string): Copy => ({ ar, en });
export type Posture = "ACT" | "TEST" | "WATCH" | "IGNORE" | "INSUFFICIENT";
export type Cohort = "retailer" | "brand";
export type Observation = {
  id: string;
  title: Copy;
  detail: Copy;
  time: string;
  group: string;
  kind: "observation" | "context";
  stance: "for" | "against";
};
export type DecisionEvent = {
  id: string;
  cohort: Cohort;
  posture: Posture;
  theme: Copy;
  title: Copy;
  changedTitle?: Copy;
  happened: Copy;
  relevance: Copy;
  reasons: Copy[];
  against: Copy;
  unknowns: Copy[];
  trigger: Copy;
  next: Copy;
  review: Copy;
  entity: Copy;
  alternatives: Copy[];
  question: Copy;
  observations: Observation[];
  history: { time: string; title: Copy; detail: Copy }[];
};
export const postureLabel: Record<Posture, Copy> = {
  ACT: copy("تصرّف الآن", "Take a bounded action"),
  TEST: copy("جرّب بشكل محدود", "Run a small test"),
  WATCH: copy("تابع قبل ما تقرّر", "Watch before reacting"),
  IGNORE: copy("ما بدّه إجراء حاليًا", "No action needed now"),
  INSUFFICIENT: copy("الأدلة غير كافية", "Insufficient evidence"),
};
export type Context = {
  floor: number | null;
  stock: "unknown" | "available" | "limited";
};
export type ResponseChoice = "accepted" | "modified" | "wait" | "rejected";
export type DecisionRecord = {
  eventId: string;
  revision: number;
  choice: ResponseChoice;
  reason: string;
  time: string;
  actualAction: string;
  outcome: string;
  baseline: string;
};
export const STORAGE_KEY = "coanto.next.demo.v1";
export function effectivePosture(
  event: DecisionEvent,
  advanced: boolean,
): Posture {
  return event.id === "price-window" && advanced ? "ACT" : event.posture;
}
/** A new observation creates a coherent revision, including counter-case and next trigger. */
export function revisedEvent(
  event: DecisionEvent,
  advanced: boolean,
): DecisionEvent {
  if (!advanced || event.id !== "price-window") return event;
  return {
    ...event,
    posture: "ACT",
    title: event.changedTitle ?? event.title,
    happened: copy(
      "في تحديث Day +1 التجريبي، مدار أعاد نفس الموديل للمخزون بسعر 180$، ونواة لحقه بنفس السعر.",
      "In the fictional Day +1 update, Madar restocked the exact model at $180 and Nawa followed at $180.",
    ),
    relevance: copy(
      "صار العرض الأقل متاحًا عند منافسين. هذا يستحق مراجعة عرضك، لكنه لا يثبت خسارة مبيعات أو يبرّر تخفيضًا تلقائيًا.",
      "The lower offer is now available from two rivals. This warrants reviewing your offer, but does not establish lost sales or justify an automatic cut.",
    ),
    reasons: [
      copy(
        "نفس الموديل صار متوفرًا بسعر أقل. [A5]",
        "The exact model is now available at the lower price. [A5]",
      ),
      copy("منافس ثانٍ لحقه. [A6]", "A second seller followed. [A6]"),
      copy(
        "شرط إعادة النظر الذي حددناه تحقق؛ ACT هنا مراجعة محدودة.",
        "The pre-stated reopening condition was crossed; ACT is a bounded review.",
      ),
    ],
    against: copy(
      "العرض السابق كان قصيرًا. وقد تختلف شروط الشحن عن عرضك؛ لا نعرف إن كان زبائنك يفضّلون السعر وحده. لا يكفي هذا لتخفيض تلقائي.",
      "The prior offer was short. Shipping terms may differ, and we do not know whether your customers prefer price alone. This does not justify an automatic cut.",
    ),
    unknowns: [
      copy(
        "شروط الشحن النهائية للعرضين.",
        "Final delivery terms for both offers.",
      ),
      copy(
        "تأثير العرض الفعلي على طلباتك.",
        "The actual effect on your orders.",
      ),
      copy(
        "حدّ السعر المقبول ومخزونك.",
        "Your acceptable price floor and inventory.",
      ),
    ],
    trigger: copy(
      "أعد النظر إذا اختفى العرض، أو كشفت شروط الشحن فرقًا مهمًا، أو تعارض الرد المقترح مع حدّك الأدنى.",
      "Re-evaluate if the offer disappears, delivery terms reveal a material difference, or a proposed response violates your floor.",
    ),
    next: copy(
      "راجع عرضك اليوم وتحقّق من الشحن وحدّ السعر المقبول قبل اختيار أي تعديل.",
      "Review your offer today; verify delivery terms and your price floor before choosing any change.",
    ),
    review: copy(
      "اليوم قبل أي تعديل، ثم بعد التحقق من الشحن والسياق الناقص.",
      "Today before any change, then after checking delivery and missing context.",
    ),
    observations: [
      {
        id: "A5",
        title: copy("رجع نفس الموديل للمخزون", "Exact model restocked"),
        detail: copy(
          "تحديث تجريبي: Brew One متوفر لدى مدار بسعر 180$. هذا يحلّ ملاحظة A1 السابقة.",
          "Fictional update: Brew One is available at Madar for $180. This supersedes A1.",
        ),
        time: "Day +1 · 09:10",
        group: "Madar · demo snapshot",
        kind: "observation",
        stance: "for",
      },
      {
        id: "A6",
        title: copy("نواة لحق السعر", "Nawa followed the price"),
        detail: copy(
          "تحديث تجريبي: نفس الموديل لدى نواة انتقل من 200$ إلى 180$. هذا يحلّ A2.",
          "Fictional update: the exact model at Nawa moved from $200 to $180. This supersedes A2.",
        ),
        time: "Day +1 · 09:15",
        group: "Nawa · demo snapshot",
        kind: "observation",
        stance: "for",
      },
      ...event.observations
        .filter((x) => x.id === "A3")
        .map((x) => ({ ...x, stance: "against" as const })),
    ],
  };
}
/** Illustrative arithmetic only: no elasticity, predicted sales, ROI or optimal-price claim. */
export function floorScenario(floor: number | null) {
  if (floor === null || !Number.isFinite(floor) || floor < 1 || floor > 10000)
    return null;
  return {
    scenarioPrice: 180,
    floor,
    allowed: 180 >= floor,
    difference: 180 - floor,
  };
}
export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function briefText(
  event: DecisionEvent,
  lang: Lang,
  advanced: boolean,
  context: Context,
) {
  event = revisedEvent(event, advanced);
  const posture = effectivePosture(event, advanced);
  return [
    "COANTO Decision Experience — DEMO / بيانات تجريبية — NOT LIVE",
    `${event.id} · ${advanced && event.id === "price-window" ? "v2" : "v1"}`,
    (advanced && event.changedTitle ? event.changedTitle : event.title)[lang],
    `${posture} — ${postureLabel[posture][lang]}`,
    event.happened[lang],
    event.relevance[lang],
    `WHY: ${event.reasons.map((x) => x[lang]).join(" | ")}`,
    `COUNTER-EVIDENCE: ${event.against[lang]}`,
    `UNKNOWN: ${event.unknowns.map((x) => x[lang]).join(" | ")}`,
    `TRIGGER: ${event.trigger[lang]}`,
    `NEXT: ${event.next[lang]}`,
    `REVIEW: ${event.review[lang]}`,
    ...event.observations.map(
      (x) => `${x.id} · ${x.group} · ${x.time} · DEMO: ${x.detail[lang]}`,
    ),
    advanced && event.id === "price-window"
      ? "SIMULATED UPDATE: Rival stock returned; a second seller followed. ACT = review the offer today, not automatically lower a price."
      : "",
    `USER-SUPPLIED SCENARIO CONTEXT (not verified): floor=${context.floor ?? "unknown"}; stock=${context.stock}`,
    "Product hypothesis for owner review. No calibrated confidence, predicted ROI, automated monitoring, or outcome learning is claimed.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
export type AskTopic =
  | "why"
  | "counter"
  | "change"
  | "uncertain"
  | "margin"
  | "competitor"
  | "other";
export function classifyQuestion(question: string): AskTopic {
  const s = question.toLowerCase();
  if (/ضد|معارض|against|counter/.test(s)) return "counter";
  if (/هامش|margin|floor|تكلفة|cost/.test(s)) return "margin";
  if (/يتغير|تغيّر|يغير|change|trigger/.test(s)) return "change";
  if (/متأكد|نعرف|uncertain|unknown/.test(s)) return "uncertain";
  if (/منافس|competitor/.test(s)) return "competitor";
  if (/ليش|لماذا|why|watch|act/.test(s)) return "why";
  return "other";
}
export function answerQuestion(
  event: DecisionEvent,
  topic: AskTopic,
  lang: Lang,
  advanced: boolean,
  context: Context,
): string {
  event = revisedEvent(event, advanced);
  const t = (x: Copy) => x[lang];
  const prefix = t(
    copy(
      "إجابة تجريبية من هذا الحدث فقط. ",
      "Prototype answer from this event only. ",
    ),
  );
  if (topic === "counter")
    return (
      prefix +
      t(event.against) +
      " [" +
      event.observations
        .filter((x) => x.stance === "against")
        .map((x) => x.id)
        .join(", ") +
      "]"
    );
  if (topic === "change") return prefix + t(event.trigger);
  if (topic === "uncertain") return prefix + event.unknowns.map(t).join(" ");
  if (topic === "competitor")
    return prefix + t(event.entity) + " " + t(event.relevance);
  if (topic === "margin") {
    const scenario = floorScenario(context.floor);
    if (event.id !== "price-window")
      return (
        prefix +
        t(
          copy(
            "الهامش وحده لا يحسم هذا الحدث. ",
            "Margin alone does not resolve this event. ",
          ),
        ) +
        t(event.question)
      );
    return (
      prefix +
      (scenario
        ? t(
            copy(
              `السعر التجريبي 180$ ${scenario.allowed ? "لا يقلّ عن" : "أقلّ من"} حدّك ${scenario.floor}$. هذا فحص قيد فقط؛ لا يثبت أن خفض السعر مربح.`,
              `The illustrative $180 price is ${scenario.allowed ? "at or above" : "below"} your $${scenario.floor} floor. This checks a constraint; it does not prove a price cut is profitable.`,
            ),
          )
        : t(
            copy(
              "أدخل أقل سعر مقبول في «سياق شركتك». لا أستطيع استنتاج ربحك من سعر المنافس.",
              "Add a minimum acceptable price in Business context. I cannot infer your profit from a competitor price.",
            ),
          ))
    );
  }
  if (topic === "why") {
    if (advanced && event.id === "price-window")
      return (
        prefix +
        t(
          copy(
            "انتقلنا إلى ACT لأن المحاكاة أعادت المخزون وأظهرت منافسًا ثانيًا بنفس السعر. المطلوب مراجعة العرض اليوم، وليس خفض السعر تلقائيًا. أثره على مبيعاتك ما زال مجهولًا.",
            "The simulation restored stock and added a second seller at the lower price. ACT means review the offer today, not automatically cut the price. Your sales impact is still unknown.",
          ),
        )
      );
    return (
      prefix +
      `${event.posture}: ` +
      event.reasons.map(t).join(" ") +
      " [" +
      event.observations
        .filter((x) => x.stance === "for")
        .map((x) => x.id)
        .join(", ") +
      "]"
    );
  }
  return (
    prefix +
    t(
      copy(
        "ما عندي دليل داخل هذا الحدث يجاوب هالسؤال. أقدر أشرح السبب، أقوى حجة ضد القرار، المجهولات، أو شرط تغييره.",
        "This event does not contain evidence to answer that question. Ask about the reasoning, strongest counter-argument, unknowns, or reopening trigger.",
      ),
    )
  );
}
