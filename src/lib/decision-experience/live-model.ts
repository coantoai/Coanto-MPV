import { safeSourceUrl } from "./model";

export type LivePosture = "ACT" | "TEST" | "WATCH" | "IGNORE" | "INSUFFICIENT";

export type LiveDecision = {
  posture: LivePosture;
  candidatePosture: Exclude<LivePosture, "INSUFFICIENT"> | null;
  title: string;
  why: string;
  nextAction: string;
  trigger: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  sourceUrls: string[];
  unknowns: string[];
  complete: boolean;
  promotionBlockedBy: string[];
};

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 50)
    : [];
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const objectArray = (value: unknown) => Array.isArray(value)
  ? value.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x)).slice(0, 40)
  : [];

function textList(...values: unknown[]) {
  const out: string[] = [];
  for (const value of values) {
    if (typeof value === "string" && value.trim()) out.push(value.trim());
    else out.push(...strings(value));
  }
  return [...new Set(out)].slice(0, 12);
}

function sourceList(...values: unknown[]) {
  return [...new Set(textList(...values)
    .map(safeSourceUrl)
    .filter((value): value is string => Boolean(value)))].slice(0, 12);
}

function postureFromZone(value: unknown): Exclude<LivePosture, "INSUFFICIENT"> | null {
  const zone = str(value).toLowerCase().replace(/[_\s]+/g, "-");
  if (["do-now", "now", "execute-now", "act"].includes(zone)) return "ACT";
  if (["test", "pilot", "experiment"].includes(zone)) return "TEST";
  if (["monitor", "monitor-watch", "watch"].includes(zone)) return "WATCH";
  if (["ignore"].includes(zone)) return "IGNORE";
  return null;
}

function decisionTitle(item: Record<string, unknown>) {
  return str(item["title"]) || str(item["name"]) || str(item["item"]) || str(item["action"]);
}

function decisionWhy(item: Record<string, unknown>) {
  return str(item["why"]) || str(item["reason"]) || str(item["rationale"]) || str(item["description"]) || str(item["detail"]);
}

function decisionTrigger(item: Record<string, unknown>) {
  return str(item["trigger"]) || str(item["reviewTrigger"]) || str(item["reopenWhen"]) || str(item["checkAgain"]);
}

function decisionNextAction(item: Record<string, unknown>, root: Record<string, unknown>) {
  const direct = str(item["nextAction"]) || str(item["next_action"]);
  if (direct) return direct;
  const next = root["next_action"];
  if (typeof next === "string") return next.trim();
  const nextObject = object(next);
  return str(nextObject["title"]) || str(nextObject["action"]) || str(nextObject["description"]);
}

/**
 * Promotes a real priority-matrix row into a Decision Event only after the
 * server Evidence Gate has checked decision-source linkage. Historic/raw model
 * output can still be displayed as inference, but it cannot self-promote merely
 * because it contains a plausible-looking URL.
 */
export function deriveLiveDecision(value: unknown): LiveDecision {
  const root = object(value);
  const metadata = object(root["metadata"]);
  const sourceGateChecked = metadata["decisionSourceLinkageChecked"] === true;
  const unknowns = strings(root["unknowns"]);
  const matrix = objectArray(root["priorityMatrix"] ?? root["priority_matrix"]);
  const candidate = matrix
    .map((item) => ({ item, posture: postureFromZone(item["zone"] ?? item["bucket"] ?? item["quadrant"]) }))
    .find(({ item, posture }) => Boolean(posture && decisionTitle(item)));

  if (!candidate || !candidate.posture) {
    return {
      posture: "INSUFFICIENT",
      candidatePosture: null,
      title: "",
      why: "",
      nextAction: "",
      trigger: "",
      evidenceFor: [],
      evidenceAgainst: [],
      sourceUrls: [],
      unknowns,
      complete: false,
      promotionBlockedBy: ["recognized priority-matrix decision"],
    };
  }

  const item = candidate.item;
  const rowSourceLinked = item["decisionEvidenceStatus"] === "linked";
  const why = decisionWhy(item);
  const sources = sourceList(item["sourceUrls"], item["source_urls"], item["evidenceUrls"], item["evidence_urls"]);
  const evidenceFor = textList(item["evidenceFor"], item["evidence_for"], item["evidence"], item["supportingEvidence"]);
  const evidenceAgainst = textList(item["counterEvidence"], item["counter_evidence"], item["evidenceAgainst"], item["evidence_against"], item["against"]);
  const trigger = decisionTrigger(item);
  const blocked: string[] = [];
  if (!sourceGateChecked) blocked.push("decision-source linkage gate");
  if (!rowSourceLinked) blocked.push("verified decision-source linkage");
  if (!why) blocked.push("decision rationale");
  if (!sources.length) blocked.push("decision-linked source URLs");
  if (!evidenceAgainst.length) blocked.push("counter-evidence");
  if (!trigger) blocked.push("reopening trigger");

  const promotable = Boolean(sourceGateChecked && rowSourceLinked && why && sources.length);
  return {
    posture: promotable ? candidate.posture : "INSUFFICIENT",
    candidatePosture: candidate.posture,
    title: decisionTitle(item),
    why,
    nextAction: decisionNextAction(item, root),
    trigger,
    evidenceFor,
    evidenceAgainst,
    sourceUrls: sources,
    unknowns,
    complete: promotable && evidenceAgainst.length > 0 && Boolean(trigger),
    promotionBlockedBy: blocked,
  };
}

export function answerLiveDecisionQuestion(decision: LiveDecision, question: string) {
  const q = question.trim().toLowerCase();
  if (!q) return "";
  if (/why|لماذا|ليش|سبب|reason/.test(q)) {
    return decision.why || "التحليل لا يحتوي سببًا موثّقًا كفاية لهذا القرار.";
  }
  if (/source|evidence|دليل|مصدر|مصادر/.test(q)) {
    return decision.sourceUrls.length
      ? `المصادر المرتبطة مباشرة بهذا القرار: ${decision.sourceUrls.join(" · ")}`
      : "لا توجد روابط مصادر مرتبطة مباشرة بصف القرار؛ لذلك لا أرفع التوصية إلى قرار نهائي.";
  }
  if (/against|counter|ضد|معارض|عكس/.test(q)) {
    return decision.evidenceAgainst.length
      ? decision.evidenceAgainst.join(" · ")
      : "لم يسجل التحليل دليلًا معارضًا مرتبطًا بهذا القرار. هذا نقص في الدليل، وليس دليلًا على عدم وجود اعتراض.";
  }
  if (/unknown|مجهول|نعرف|ناقص|missing/.test(q)) {
    return decision.unknowns.length
      ? decision.unknowns.join(" · ")
      : "لم يسجل التحليل مجهولات صريحة. هذا لا يعني أن كل شيء معروف.";
  }
  if (/next|action|اعمل|خطوة|تصرف|تصرّف/.test(q)) {
    return decision.nextAction || "لا توجد خطوة تالية موثّقة بما يكفي في النتيجة الحالية.";
  }
  if (/trigger|when|متى|شرط|راجع/.test(q)) {
    return decision.trigger || "لا يوجد Trigger موثّق لإعادة فتح القرار بعد.";
  }
  return "لا أستطيع الإجابة من هذا الـDecision Event وحده. لن أملأ الفراغ بتخمين؛ اسأل عن السبب، الدليل، الدليل المعارض، المجهولات، الـTrigger أو الخطوة التالية.";
}

/** Existing model output stays an inference. No posture or evidence ID is manufactured. */
export function liveProjection(value: unknown) {
  const root = object(value),
    metadata = object(root["metadata"]);
  const signals = (Array.isArray(root["signals"]) ? root["signals"] : [])
    .slice(0, 20)
    .map((v: unknown) => {
      const s = object(v);
      return {
        title: str(s["title"]),
        description: str(s["description"]) || str(s["detail"]),
        sources: sourceList(s["sourceUrls"], s["source_urls"]),
      };
    })
    .filter((s) => s.title && s.description);
  return {
    signals,
    decision: deriveLiveDecision(root),
    unknowns: strings(root["unknowns"]),
    id: str(metadata["id"]),
    at: str(metadata["analyzedAt"]),
    url: safeSourceUrl(metadata["storeUrl"]),
    saved: metadata["evidenceLedgerPersisted"] === true,
  };
}
