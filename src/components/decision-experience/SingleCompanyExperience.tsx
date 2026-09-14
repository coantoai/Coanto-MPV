import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Globe2,
  History,
  Layers3,
  Loader2,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  Target,
  X,
  Zap,
} from "lucide-react";
import { clientAuth } from "@/lib/auth-client";
import { getAnalysis, listAnalyses, type HistoryItem } from "@/lib/history.functions";
import { getLinkedEvidence, type LinkedEvidence } from "@/lib/decision-experience/live.functions";
import { liveProjection, object } from "@/lib/decision-experience/live-model";
import { safeSourceUrl } from "@/lib/decision-experience/model";

type SessionState = "checking" | "signed-out" | "signed-in" | "error";
type Posture = "ACT" | "TEST" | "WATCH" | "IGNORE" | "INSUFFICIENT";
type FilterKey = "attention" | "WATCH" | "IGNORE" | "INSUFFICIENT";
type DecisionResponse = "accept" | "modify" | "wait" | "reject" | "";

type DecisionEvent = {
  id: string;
  theme: string;
  title: string;
  posture: Posture;
  candidatePosture: Exclude<Posture, "INSUFFICIENT"> | null;
  why: string;
  nextAction: string;
  trigger: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  unknowns: string[];
  sourceUrls: string[];
  competitor: string;
};

type CompetitorCard = {
  name: string;
  url: string | null;
  why: string;
  evidence: string[];
  sourceUrls: string[];
};

type InsightCard = { title: string; description: string };
type ChangeCard = { title: string; before: string; after: string; detail: string };
type SourceCard = { url: string; label: string; group: string };

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

function textList(...values: unknown[]) {
  const out: string[] = [];
  for (const value of values) {
    if (typeof value === "string" && value.trim()) out.push(value.trim());
    else out.push(...stringArray(value));
  }
  return [...new Set(out)].slice(0, 12);
}

function safeUrls(...values: unknown[]) {
  return [...new Set(textList(...values).map((value) => safeSourceUrl(value)).filter((value): value is string => Boolean(value)))].slice(0, 12);
}

function displayValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const row = object(value);
  return str(row["label"]) || str(row["value"]) || str(row["text"]);
}

function hostname(value: string | null | undefined) {
  if (!value) return "";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function formatStamp(value: string) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ar-LB", { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return value;
  }
}

function postureFromZone(value: unknown): Exclude<Posture, "INSUFFICIENT"> | null {
  const zone = str(value).toLowerCase().replace(/[_\s]+/g, "-");
  if (["do-now", "now", "execute-now", "act"].includes(zone)) return "ACT";
  if (["test", "pilot", "experiment"].includes(zone)) return "TEST";
  if (["monitor", "monitor-watch", "watch"].includes(zone)) return "WATCH";
  if (zone === "ignore") return "IGNORE";
  return null;
}

function postureArabic(posture: Posture) {
  if (posture === "ACT") return "تحرّك";
  if (posture === "TEST") return "اختبر";
  if (posture === "WATCH") return "راقب";
  if (posture === "IGNORE") return "استبعد";
  return "الدليل ناقص";
}

function extractDecisionEvents(value: unknown): DecisionEvent[] {
  const root = object(value);
  const metadata = object(root["metadata"]);
  const sourceGateChecked = metadata["decisionSourceLinkageChecked"] === true;
  const rootUnknowns = stringArray(root["unknowns"]);
  const rootNext = object(root["next_action"]);
  const rows = objectArray(root["priorityMatrix"] ?? root["priority_matrix"]);

  const events = rows.map((item, index): DecisionEvent | null => {
    const candidatePosture = postureFromZone(item["zone"] ?? item["bucket"] ?? item["quadrant"]);
    const title = str(item["title"]) || str(item["name"]) || str(item["action"]) || str(item["decision"]) || str(item["recommendation"]);
    if (!candidatePosture || !title) return null;
    const why = str(item["why"]) || str(item["reason"]) || str(item["rationale"]) || str(item["description"]) || str(item["detail"]);
    const sourceUrls = safeUrls(item["sourceUrls"], item["source_urls"], item["evidenceUrls"], item["evidence_urls"]);
    const linked = item["decisionEvidenceStatus"] === "linked";
    const posture: Posture = sourceGateChecked && linked && Boolean(why) && sourceUrls.length > 0 ? candidatePosture : "INSUFFICIENT";
    const nextAction = str(item["nextAction"]) || str(item["next_action"]) || str(rootNext["title"]) || str(rootNext["action"]) || str(rootNext["description"]);
    return {
      id: str(item["id"]) || `decision-${index + 1}`,
      theme: str(item["theme"]) || str(item["category"]) || str(item["type"]) || "حركة مرتبطة بقرار",
      title,
      posture,
      candidatePosture,
      why,
      nextAction,
      trigger: str(item["trigger"]) || str(item["reviewTrigger"]) || str(item["reopenWhen"]) || str(item["checkAgain"]),
      evidenceFor: textList(item["evidenceFor"], item["evidence_for"], item["evidence"], item["supportingEvidence"]),
      evidenceAgainst: textList(item["counterEvidence"], item["counter_evidence"], item["evidenceAgainst"], item["evidence_against"], item["against"]),
      unknowns: textList(item["unknowns"], rootUnknowns),
      sourceUrls,
      competitor: str(item["competitor"]) || str(item["actor"]) || str(item["company"]),
    };
  }).filter((item): item is DecisionEvent => Boolean(item));

  if (events.length) return events.slice(0, 8);

  const fallback = liveProjection(value).decision;
  if (!fallback.title) return [];
  return [{
    id: "decision-1",
    theme: "قرار رئيسي",
    title: fallback.title,
    posture: fallback.posture,
    candidatePosture: fallback.candidatePosture,
    why: fallback.why,
    nextAction: fallback.nextAction,
    trigger: fallback.trigger,
    evidenceFor: fallback.evidenceFor,
    evidenceAgainst: fallback.evidenceAgainst,
    unknowns: fallback.unknowns,
    sourceUrls: fallback.sourceUrls,
    competitor: "",
  }];
}

function extractCompetitors(value: unknown): CompetitorCard[] {
  const rows = objectArray(object(value)["competitors"]);
  return rows.map((item) => {
    const name = str(item["name"]);
    const url = safeSourceUrl(str(item["url"]));
    const evidence = typeof item["evidence"] === "string" ? [str(item["evidence"])].filter(Boolean) : stringArray(item["evidence"]);
    return {
      name,
      url,
      why: str(item["why"]) || str(item["note"]) || evidence[0] || "",
      evidence: evidence.slice(0, 3),
      sourceUrls: [...new Set([...(url ? [url] : []), ...safeUrls(item["sourceUrls"])])].slice(0, 5),
    };
  }).filter((item) => item.name).slice(0, 8);
}

function extractInsights(value: unknown): InsightCard[] {
  return objectArray(value).map((item) => ({
    title: str(item["title"]) || str(item["name"]) || str(item["action"]) || str(item["recommendation"]),
    description: str(item["description"]) || str(item["detail"]) || str(item["why"]) || str(item["reason"]) || str(item["recommendation"]),
  })).filter((item) => item.title || item.description).slice(0, 5);
}

function extractChanges(value: unknown): ChangeCard[] {
  return objectArray(value).map((item, index) => ({
    title: str(item["title"]) || str(item["name"]) || str(item["metric"]) || `تغيّر ${index + 1}`,
    before: displayValue(item["before"]) || displayValue(item["previous"]) || displayValue(item["from"]),
    after: displayValue(item["after"]) || displayValue(item["current"]) || displayValue(item["to"]),
    detail: str(item["description"]) || str(item["detail"]) || str(item["why"]),
  })).filter((item) => item.before || item.after || item.detail).slice(0, 6);
}

function collectSources(targetUrl: string | null, competitors: CompetitorCard[], signals: ReturnType<typeof liveProjection>["signals"], events: DecisionEvent[], ledger: LinkedEvidence[]) {
  const map = new Map<string, SourceCard>();
  const add = (candidate: string | null | undefined, label: string, group: string) => {
    const url = safeSourceUrl(candidate);
    if (!url) return;
    const existing = map.get(url);
    if (!existing || group === "مرتبط بالقرار") map.set(url, { url, label, group });
  };
  add(targetUrl, "موقع الشركة", "الشركة");
  competitors.forEach((item) => {
    add(item.url, item.name, "منافس");
    item.sourceUrls.forEach((source) => add(source, item.name, "منافس"));
  });
  signals.forEach((signal) => signal.sources.forEach((source) => add(source, signal.title, "إشارة")));
  events.forEach((event) => event.sourceUrls.forEach((source) => add(source, event.title, "مرتبط بالقرار")));
  ledger.forEach((item) => add(item.url, item.kind || "دليل محفوظ", "دليل"));
  return [...map.values()].slice(0, 40);
}

function answerEventQuestion(event: DecisionEvent, question: string) {
  const q = question.trim().toLowerCase();
  if (!q) return "";
  if (/why|لماذا|ليش|سبب/.test(q)) return event.why || "لا يوجد سبب موثّق بما يكفي في هذا الحدث.";
  if (/source|evidence|دليل|مصدر/.test(q)) return event.sourceUrls.length ? event.sourceUrls.join(" · ") : "لا يوجد مصدر مباشر مرتبط بهذا القرار بعد.";
  if (/against|counter|ضد|معارض/.test(q)) return event.evidenceAgainst.length ? event.evidenceAgainst.join(" · ") : "لم يُسجّل دليل معارض؛ هذا نقص في الدليل وليس إثباتًا لعدم وجود اعتراض.";
  if (/unknown|ناقص|نعرف|مجهول/.test(q)) return event.unknowns.length ? event.unknowns.join(" · ") : "لا توجد مجهولات صريحة مسجلة لهذا الحدث.";
  if (/next|action|اعمل|خطوة|تصرف|تصرّف/.test(q)) return event.nextAction || "لا توجد خطوة تالية موثقة بما يكفي.";
  if (/trigger|when|متى|راجع|شرط/.test(q)) return event.trigger || "لا يوجد Trigger موثّق لإعادة المراجعة بعد.";
  return "اسأل عن السبب، الدليل، الاعتراض، المجهولات، الخطوة التالية أو متى يتغيّر القرار.";
}

export function SingleCompanyExperience() {
  const [session, setSession] = useState<SessionState>("checking");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyId, setHistoryId] = useState("");
  const [projection, setProjection] = useState<ReturnType<typeof liveProjection> | null>(null);
  const [rawResult, setRawResult] = useState<unknown>(null);
  const [evidence, setEvidence] = useState<LinkedEvidence[]>([]);
  const [stamp, setStamp] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<FilterKey>("attention");
  const [error, setError] = useState("");
  const [ledgerError, setLedgerError] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [response, setResponse] = useState<DecisionResponse>("");
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);

  const initialize = useCallback(async () => {
    setSession("checking");
    setError("");
    try {
      const auth = await clientAuth.getSession();
      if (!mounted.current) return;
      if (!auth) {
        setSession("signed-out");
        return;
      }
      setSession("signed-in");
      const response = await fetch("/api/business-context", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("context-read-failed");
      const body = object(await response.json());
      const context = object(body["context"]);
      setReady(body["completed"] === true);
      const website = str(context["websiteUrl"]);
      if (website) setUrl(website);
      try { setHistory(await listAnalyses()); } catch { setHistory([]); }
    } catch {
      if (!mounted.current) return;
      setSession("error");
      setError("تعذّر الاتصال بخدمة الحساب. جرّب إعادة الاتصال.");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void initialize();
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [initialize]);

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      await clientAuth.signIn(email, password);
      setPassword("");
      await initialize();
    } catch {
      setError("تعذّر تسجيل الدخول. تحقق من البريد وكلمة المرور.");
    } finally {
      setBusy(false);
    }
  }

  async function show(data: unknown, knownId = "", knownTime = "") {
    const next = liveProjection(data);
    const events = extractDecisionEvents(data);
    setProjection(next);
    setRawResult(data);
    setEvidence([]);
    setLedgerError("");
    setStamp(next.at || knownTime);
    setSelectedId(events[0]?.id || "");
    setFilter("attention");
    setQuestion("");
    setAnswer("");
    setResponse("");
    const id = knownId || next.id;
    if (!id) return;
    try {
      const rows = await getLinkedEvidence({ data: { id } });
      if (mounted.current) setEvidence(rows);
    } catch {
      if (mounted.current) setLedgerError("تعذّر تحميل بعض الأدلة المحفوظة لهذا التحليل.");
    }
  }

  async function analyze() {
    if (!ready || !safeSourceUrl(url)) return;
    setBusy(true);
    setError("");
    setProjection(null);
    setRawResult(null);
    setEvidence([]);
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 180000);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        credentials: "same-origin",
        signal: abort.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeUrl: url.trim(), competitors: [] }),
      });
      const body = object(await response.json());
      if (!response.ok) throw new Error(str(body["error"]) || "التحليل لم يكتمل.");
      if (!mounted.current) return;
      await show(body);
      try { setHistory(await listAnalyses()); } catch { /* keep result visible */ }
    } catch (caught) {
      if (!mounted.current) return;
      const timedOut = caught instanceof Error && caught.name === "AbortError";
      setError(timedOut ? "انتهت مهلة التحليل. افتح تحليلًا سابقًا قبل إعادة الطلب." : `تعذّر إكمال التحليل. ${caught instanceof Error ? caught.message : ""}`);
    } finally {
      clearTimeout(timer);
      if (mounted.current) setBusy(false);
    }
  }

  async function loadHistory(id = historyId) {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const row = await getAnalysis({ data: { id } });
      setUrl(row.storeUrl);
      setHistoryId(row.id);
      await show(JSON.parse(row.json), row.id, row.createdAt);
    } catch {
      setError("تعذّر فتح التحليل المحفوظ.");
    } finally {
      setBusy(false);
    }
  }

  const root = object(rawResult);
  const events = useMemo(() => extractDecisionEvents(rawResult), [rawResult]);
  const competitors = useMemo(() => extractCompetitors(rawResult), [rawResult]);
  const opportunities = useMemo(() => extractInsights(root["opportunities"]), [rawResult]);
  const threats = useMemo(() => extractInsights(root["threats"]), [rawResult]);
  const actions = useMemo(() => extractInsights(root["actions"] ?? root["action_plan"]), [rawResult]);
  const changes = useMemo(() => extractChanges(root["beforeAfter"]), [rawResult]);
  const selectedEvent = events.find((item) => item.id === selectedId) || events[0] || null;
  const targetUrl = projection?.url || safeSourceUrl(url);
  const targetDomain = hostname(targetUrl || url);
  const sources = useMemo(
    () => projection ? collectSources(targetUrl, competitors, projection.signals, events, evidence) : [],
    [projection, targetUrl, competitors, events, evidence],
  );

  const visibleEvents = events.filter((event) => {
    if (filter === "attention") return ["ACT", "TEST", "WATCH"].includes(event.posture);
    return event.posture === filter;
  });
  const attentionCount = events.filter((event) => ["ACT", "TEST", "WATCH"].includes(event.posture)).length;
  const watchCount = events.filter((event) => event.posture === "WATCH").length;
  const ignoreCount = events.filter((event) => event.posture === "IGNORE").length;
  const insufficientCount = events.filter((event) => event.posture === "INSUFFICIENT").length;

  function chooseFilter(value: FilterKey) {
    setFilter(value);
    const first = events.find((event) => value === "attention" ? ["ACT", "TEST", "WATCH"].includes(event.posture) : event.posture === value);
    if (first) setSelectedId(first.id);
  }

  function ask(text = question) {
    if (!selectedEvent || !text.trim()) return;
    setQuestion(text);
    setAnswer(answerEventQuestion(selectedEvent, text));
  }

  function saveResponse(value: DecisionResponse) {
    if (!selectedEvent || !value) return;
    setResponse(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`coanto:decision-response:${projection?.id || targetDomain || "current"}:${selectedEvent.id}`, JSON.stringify({ value, posture: selectedEvent.posture, at: new Date().toISOString() }));
    }
  }

  function startNew() {
    setProjection(null);
    setRawResult(null);
    setEvidence([]);
    setSelectedId("");
    setError("");
  }

  return (
    <div className="nx sc" dir="rtl" lang="ar">
      <a className="nx-skip" href="#coanto-main">انتقل للمحتوى</a>
      <aside className="nx-sidebar">
        <a href="/live" className="nx-brand" aria-label="COANTO">
          <span className="nx-brand-mark"><span /><span /><span /></span>
          <strong dir="ltr">COANTO<span>DECISION INTELLIGENCE</span></strong>
        </a>
        <div className="nx-workspace">
          <div className="nx-avatar">{targetDomain ? targetDomain.slice(0, 1).toUpperCase() : "C"}</div>
          <div className="sc-company-label">
            <small>الشركة</small>
            <b dir="ltr">{targetDomain || "شركة واحدة"}</b>
          </div>
        </div>
        <div className="nx-nav-label">مساحة القرار</div>
        <nav aria-label="التنقل">
          <button className={filter === "attention" ? "active" : ""} onClick={() => chooseFilter("attention")}><Layers3 size={19} /> ما يستحق انتباهك <span className="nx-nav-count">{attentionCount}</span></button>
          <button className={filter === "WATCH" ? "active" : ""} onClick={() => chooseFilter("WATCH")}><Eye size={19} /> قيد المتابعة <span className="nx-nav-count">{watchCount}</span></button>
          <button onClick={() => document.getElementById("coanto-history")?.scrollIntoView({ behavior: "smooth" })}><FileText size={19} /> التحليلات السابقة <span className="nx-nav-count">{history.length}</span></button>
          <button onClick={startNew}><Globe2 size={19} /> تحليل شركة</button>
        </nav>
        <div className="nx-sidebar-bottom">
          <div className="nx-quiet"><ShieldCheck size={21} /><b>وضوح أكثر. ضجيج أقل.</b><p>نراقب الكثير، ونرفع فقط ما يستحق قرارًا.</p></div>
        </div>
      </aside>

      <div className="nx-body">
        <header className="nx-topbar">
          <div className="nx-breadcrumb">مساحة العمل <span>/</span> <b>القرار التالي</b></div>
          <div className="nx-top-actions"><span className="nx-preview-label">تحليل الشركة</span><span className="nx-user">C</span></div>
        </header>

        <main id="coanto-main" className="nx-main">
          {session === "checking" && <div className="sc-status"><Loader2 className="nx-loading" size={18} /> نتحقق من حسابك…</div>}
          {error && <div className="sc-status sc-error"><AlertTriangle size={18} /> {error}</div>}

          {session === "error" && <button className="nx-secondary" onClick={() => void initialize()}>إعادة الاتصال</button>}

          {session === "signed-out" && (
            <section className="nx-card sc-auth">
              <div><span className="nx-eyebrow"><span /> COANTO</span><h1>ادخل إلى مساحة شركتك.</h1><p>بعد تسجيل الدخول، ضع رابط الشركة فقط. COANTO يتولى اكتشاف المنافسين وبناء الصورة.</p></div>
              <form onSubmit={(event) => { event.preventDefault(); void signIn(); }}>
                <label htmlFor="sc-email">البريد الإلكتروني</label>
                <input id="sc-email" type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} dir="ltr" />
                <label htmlFor="sc-password">كلمة المرور</label>
                <input id="sc-password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} dir="ltr" />
                <button className="nx-primary" disabled={busy}>{busy ? <Loader2 className="nx-loading" size={17} /> : <Check size={17} />} دخول</button>
                <a href="/auth?next=/live" className="sc-auth-link">إنشاء حساب أو استعادة كلمة المرور</a>
              </form>
            </section>
          )}

          {session === "signed-in" && !ready && (
            <div className="sc-status sc-warn"><AlertTriangle size={18} /><div><b>نحتاج معلومات شركتك الأساسية أولًا.</b><br /><a href="/onboarding" onClick={() => window.sessionStorage.setItem("coanto:return-to", "/live")}>أكمل معلومات الشركة</a></div></div>
          )}

          {session === "signed-in" && !projection && (
            <>
              <section className="nx-intro">
                <div>
                  <div className="nx-eyebrow"><span /> صورة أوضح لقرارك التالي</div>
                  <h1>مش كل تغيير بدّه ردّ.<br /><span>هيدا اللي يستحق انتباهك.</span></h1>
                  <p>أدخل رابط شركتك فقط. COANTO يقرأ الشركة، يكتشف المنافسين، يربط الإشارات، ويرفع ما يستحق قرارًا.</p>
                </div>
              </section>
              <section className="nx-card sc-company-start">
                <div><Globe2 size={26} /><h2>حلّل شركتك</h2><p>لا تحتاج لإدخال المنافسين. نبدأ من شركتك ونبحث حولها.</p></div>
                <form onSubmit={(event) => { event.preventDefault(); void analyze(); }}>
                  <label htmlFor="sc-url">موقع الشركة</label>
                  <input id="sc-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://company.com" dir="ltr" />
                  <button className="nx-primary" disabled={busy || !ready || !safeSourceUrl(url)}>{busy ? <Loader2 className="nx-loading" size={18} /> : <Zap size={18} />}{busy ? "COANTO يحلل الآن…" : "ابدأ التحليل"}</button>
                </form>
              </section>
            </>
          )}

          {busy && session === "signed-in" && (
            <section className="nx-card sc-progress" role="status">
              <div><Loader2 className="nx-loading" size={21} /><b>COANTO يبني صورة الشركة الآن</b></div>
              <div className="sc-progress-line"><span className="active">قراءة الشركة</span><span>اكتشاف المنافسين</span><span>ربط الإشارات</span><span>ترتيب القرارات</span></div>
            </section>
          )}

          {session === "signed-in" && projection && (
            <>
              <section className="nx-intro sc-result-intro">
                <div>
                  <div className="nx-eyebrow"><span /> صورة أوضح لقرارك التالي</div>
                  <h1>مش كل تغيير بدّه ردّ.<br /><span>هيدا اللي يستحق انتباهك.</span></h1>
                  <p><b dir="ltr">{targetDomain}</b> · آخر تحليل {formatStamp(stamp) || "الآن"}</p>
                </div>
                <button className="nx-secondary" onClick={startNew}><Globe2 size={17} /> تحليل شركة أخرى</button>
              </section>

              <div className="nx-attention-strip">
                <Filter size={17} />
                <span>في هذا التحليل: <b>{projection.signals.length}</b> إشارات</span>
                <span className="nx-strip-line" />
                <span><b>{events.length}</b> أحداث مرتبطة بقرارات</span>
                <span className="nx-strip-line" />
                <strong>{attentionCount} تستحق المراجعة</strong>
                <small>أرقام ناتجة عن التحليل الحالي</small>
              </div>

              <div className="nx-filter-row" role="group" aria-label="فلترة الأحداث">
                <button className={filter === "attention" ? "active" : ""} onClick={() => chooseFilter("attention")}>يستحق انتباهك <span>{attentionCount}</span></button>
                <button className={filter === "WATCH" ? "active" : ""} onClick={() => chooseFilter("WATCH")}>قيد المتابعة <span>{watchCount}</span></button>
                <button className={filter === "IGNORE" ? "active" : ""} onClick={() => chooseFilter("IGNORE")}>تم استبعادها <span>{ignoreCount}</span></button>
                <button className={filter === "INSUFFICIENT" ? "active" : ""} onClick={() => chooseFilter("INSUFFICIENT")}>دليل ناقص <span>{insufficientCount}</span></button>
              </div>

              {visibleEvents.length ? (
                <div className="nx-event-picker">
                  {visibleEvents.map((event) => (
                    <button key={event.id} className={selectedEvent?.id === event.id ? "selected" : ""} onClick={() => setSelectedId(event.id)}>
                      <span className={`nx-state-dot nx-${event.posture.toLowerCase()}`} />
                      <span>{event.theme}</span>
                      <b dir="ltr">{event.posture === "INSUFFICIENT" ? "—" : event.posture}</b>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="nx-empty"><Eye size={32} /><h2>ما في حدث ضمن هالفئة حاليًا.</h2><p>COANTO ما بيضيف أحداث لمجرد ملء الشاشة.</p></div>
              )}

              {selectedEvent && visibleEvents.some((item) => item.id === selectedEvent.id) && (
                <article className="nx-brief nx-card">
                  <div className="nx-brief-top">
                    <div className="nx-eyebrow"><ShieldCheck size={16} /> {selectedEvent.theme}</div>
                    <div className="nx-brief-id" dir="ltr">EVENT · {String(events.findIndex((item) => item.id === selectedEvent.id) + 1).padStart(2, "0")}</div>
                  </div>
                  <div className="nx-brief-grid">
                    <div className="nx-brief-copy">
                      <div className="nx-state-line"><span className={`nx-state nx-${selectedEvent.posture.toLowerCase()}`}><b dir="ltr">{selectedEvent.posture === "INSUFFICIENT" ? "—" : selectedEvent.posture}</b> {postureArabic(selectedEvent.posture)}</span></div>
                      <h2>{selectedEvent.title}</h2>
                      <p className="nx-relevance">{selectedEvent.why || "لا يوجد تفسير موثّق بما يكفي لهذا الحدث."}</p>
                      <div className="nx-reasons">
                        {(selectedEvent.evidenceFor.length ? selectedEvent.evidenceFor : [selectedEvent.why]).filter(Boolean).slice(0, 3).map((reason, index) => <div key={index}><span>{String(index + 1).padStart(2, "0")}</span><p>{reason}</p></div>)}
                      </div>
                    </div>

                    <div className="nx-visual sc-live-visual">
                      <div className="nx-visual-caption"><b>شو تغيّر؟</b><span>من التحليل الحالي</span></div>
                      {changes.length ? (
                        <div className="sc-change-focus">
                          <small>{changes[0].title}</small>
                          {(changes[0].before || changes[0].after) && <div className="sc-before-after"><div><span>قبل</span><strong>{changes[0].before || "غير متوفر"}</strong></div><i>←</i><div><span>الآن</span><strong>{changes[0].after || "غير متوفر"}</strong></div></div>}
                          {changes[0].detail && <p>{changes[0].detail}</p>}
                        </div>
                      ) : (
                        <div className="nx-event-visual">
                          <div className="nx-orbit"><Globe2 size={30} /></div>
                          <h3 dir="ltr">{targetDomain}</h3>
                          <p>{selectedEvent.competitor ? `الحركة مرتبطة بـ ${selectedEvent.competitor}.` : "ربطنا الحركة بالشركة وبالسياق التنافسي المتاح."}</p>
                          <div className="nx-signal-tags">{competitors.slice(0, 4).map((item) => <span key={item.name}>{item.name}</span>)}{projection.signals.slice(0, 2).map((item) => <span key={item.title}>{item.title}</span>)}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="nx-next-action">
                    <div className="nx-next-icon"><Zap size={18} /></div>
                    <div><small>الخطوة التالية</small><p>{selectedEvent.nextAction || "لا تتخذ إجراءً بعد؛ اجمع المعلومة الناقصة أولًا."}</p></div>
                    <button className="nx-secondary" onClick={() => setAskOpen(true)}><MessageCircle size={15} /> اسأل COANTO</button>
                  </div>
                </article>
              )}

              {selectedEvent && (
                <div className="nx-below-grid">
                  <section className="nx-evidence nx-card">
                    <div className="nx-section-head"><div><span className="nx-eyebrow">الدليل</span><h3>ليش هالقرار؟</h3></div><ShieldCheck size={21} /></div>
                    <p className="nx-small">نفصل ما يدعم القرار عن أقوى اعتراض مسجل بدل خلطهم ببعض.</p>
                    <div className="nx-evidence-columns">
                      <div><h4><span className="nx-evidence-plus">+</span> ما يدعمه</h4>{selectedEvent.evidenceFor.length ? selectedEvent.evidenceFor.slice(0, 4).map((item, index) => <p className="sc-evidence-line" key={index}>{item}</p>) : <p className="nx-small">لا يوجد دعم صريح إضافي.</p>}</div>
                      <div><h4><span className="nx-evidence-minus">−</span> ما يعارضه</h4>{selectedEvent.evidenceAgainst.length ? selectedEvent.evidenceAgainst.slice(0, 4).map((item, index) => <p className="sc-evidence-line" key={index}>{item}</p>) : <p className="nx-counter-text">لم يُسجّل اعتراض موثّق. نعامل هذا كنقص في الدليل.</p>}</div>
                    </div>
                    {!!selectedEvent.sourceUrls.length && <details className="nx-details"><summary>مصادر مرتبطة مباشرة بهذا القرار <ChevronDown size={15} /></summary><div className="sc-source-list">{selectedEvent.sourceUrls.map((source) => <a href={source} target="_blank" rel="noreferrer" key={source}>{hostname(source)} <ExternalLink size={11} /></a>)}</div></details>}
                  </section>

                  <div className="nx-watch-stack">
                    <section className="nx-tripwire nx-card"><Clock3 size={20} /><span className="nx-eyebrow">TRIGGER</span><h3>متى نراجع القرار؟</h3><p>{selectedEvent.trigger || "عند ظهور معلومات جديدة مرتبطة بهذا الحدث."}</p></section>
                    <section className="nx-context-card"><AlertTriangle size={20} /><h3>شو ما منعرفه بعد؟</h3>{selectedEvent.unknowns.length ? selectedEvent.unknowns.slice(0, 4).map((item, index) => <p key={index}>{item}</p>) : <p>لم يسجّل التحليل مجهولات صريحة إضافية.</p>}</section>
                  </div>
                </div>
              )}

              {(opportunities.length || threats.length || actions.length) ? (
                <section className="nx-card sc-commerce">
                  <div className="nx-section-head"><div><span className="nx-eyebrow">الصورة التجارية</span><h3>شو يعني هيدا للشركة؟</h3></div><Target size={21} /></div>
                  <div className="sc-commerce-grid">
                    <div><b>فرص</b>{opportunities.length ? opportunities.map((item, index) => <article key={index}><strong>{item.title}</strong><p>{item.description}</p></article>) : <p className="nx-small">لا توجد فرصة واضحة بما يكفي.</p>}</div>
                    <div><b>تهديدات</b>{threats.length ? threats.map((item, index) => <article key={index}><strong>{item.title}</strong><p>{item.description}</p></article>) : <p className="nx-small">لا يوجد تهديد واضح بما يكفي.</p>}</div>
                    <div><b>خطوات مقترحة</b>{actions.length ? actions.map((item, index) => <article key={index}><strong>{item.title}</strong><p>{item.description}</p></article>) : <p className="nx-small">لا توجد خطوة إضافية موثقة.</p>}</div>
                  </div>
                </section>
              ) : null}

              {!!competitors.length && (
                <section className="nx-card sc-context-section">
                  <div className="nx-section-head"><div><span className="nx-eyebrow">السياق التنافسي</span><h3>مين ظهر حول {targetDomain}؟</h3></div><Search size={21} /></div>
                  <div className="sc-competitor-row">{competitors.map((item) => <article key={item.name}><span>{item.name}</span><p>{item.why || "ظهر كمنافس ذي صلة في التحليل."}</p>{item.url && <a href={item.url} target="_blank" rel="noreferrer">{hostname(item.url)} <ExternalLink size={10} /></a>}</article>)}</div>
                </section>
              )}

              <section className="nx-card sc-sources">
                <div className="nx-section-head"><div><span className="nx-eyebrow">المصادر</span><h3>شو قرأ COANTO؟</h3></div><Globe2 size={21} /></div>
                <p className="nx-small">المصادر المجمعة أوسع من المصادر المرتبطة مباشرة بقرار واحد.</p>
                {ledgerError && <p className="sc-inline-error">{ledgerError}</p>}
                <div className="sc-source-grid">{sources.length ? sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}><span>{source.group}</span><b>{source.label}</b><small dir="ltr">{hostname(source.url)}</small></a>) : <p className="nx-small">لم تُجمع روابط مصادر قابلة للعرض في هذه المحاولة.</p>}</div>
              </section>

              {selectedEvent && (
                <section className="nx-human">
                  <div><h3>قرارك يبقى إلك.</h3><p>سجّل ردك على هذا الحدث حتى نقارن القرار مع ما يحدث لاحقًا.</p></div>
                  <div>{([['accept','أوافق'],['modify','أعدّل'],['wait','أنتظر'],['reject','أرفض']] as const).map(([value, label]) => <button key={value} className={response === value ? "sc-selected-response" : ""} onClick={() => saveResponse(value)}>{response === value && <Check size={13} />}{label}</button>)}</div>
                </section>
              )}
            </>
          )}

          {session === "signed-in" && history.length > 0 && (
            <section id="coanto-history" className="nx-history nx-card sc-history">
              <div className="nx-section-head"><div><span className="nx-eyebrow">السجل</span><h3>التحليلات السابقة</h3></div><History size={21} /></div>
              <p className="nx-small">افتح تحليلًا محفوظًا بدل تشغيل API جديد إذا كنت تريد مراجعة نتيجة سابقة.</p>
              <div className="sc-history-row">
                <select value={historyId} onChange={(event) => setHistoryId(event.target.value)}><option value="">اختر تحليلًا سابقًا</option>{history.map((item) => <option key={item.id} value={item.id}>{hostname(item.storeUrl)} · {formatStamp(item.createdAt)}</option>)}</select>
                <button className="nx-secondary" disabled={!historyId || busy} onClick={() => void loadHistory()}>فتح التحليل</button>
              </div>
            </section>
          )}
        </main>
      </div>

      {selectedEvent && projection && <button className="nx-ask-fab" onClick={() => setAskOpen(true)}><MessageCircle size={18} /> Ask COANTO <span className="nx-fab-small">عن القرار الحالي</span></button>}

      {askOpen && selectedEvent && (
        <div className="nx-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAskOpen(false); }}>
          <section className="nx-drawer" role="dialog" aria-modal="true" aria-label="Ask COANTO">
            <div className="nx-drawer-head"><h2>Ask COANTO</h2><button onClick={() => setAskOpen(false)}><X size={18} /></button></div>
            <div className="nx-drawer-content">
              <span className="nx-mode-label">القرار الحالي</span>
              <div className="nx-ask-context"><b>{selectedEvent.title}</b><span className={`nx-state nx-${selectedEvent.posture.toLowerCase()}`}>{postureArabic(selectedEvent.posture)}</span></div>
              <div className="nx-ask-prompts">{["ليش هالقرار؟", "شو الدليل؟", "شو ضد القرار؟", "شو ما منعرفه؟", "شو الخطوة التالية؟", "متى نراجع القرار؟"].map((prompt) => <button key={prompt} onClick={() => ask(prompt)}>{prompt}<Send size={12} /></button>)}</div>
              {answer && <div className="nx-answer"><p>{answer}</p></div>}
              <div className="nx-ask-input"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="اسأل عن هذا القرار…" onKeyDown={(event) => { if (event.key === "Enter") ask(); }} /><button onClick={() => ask()}><Send size={16} /></button></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
