import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Globe2,
  History,
  Loader2,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { clientAuth } from "@/lib/auth-client";
import { getAnalysis, listAnalyses, type HistoryItem } from "@/lib/history.functions";
import { getLinkedEvidence, type LinkedEvidence } from "@/lib/decision-experience/live.functions";
import { answerLiveDecisionQuestion, liveProjection, object } from "@/lib/decision-experience/live-model";
import { safeSourceUrl } from "@/lib/decision-experience/model";

type DecisionResponse = "accept" | "modify" | "defer" | "reject" | "";
type SessionState = "checking" | "signed-out" | "signed-in" | "error";

type CompetitorCard = {
  name: string;
  url: string | null;
  why: string;
  evidence: string[];
  sourceUrls: string[];
};

type InsightCard = {
  title: string;
  description: string;
  severity: string;
};

type ChangeCard = {
  title: string;
  before: string;
  after: string;
  detail: string;
};

type SourceCard = {
  url: string;
  label: string;
  group: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function displayValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    return asString(row["label"]) || asString(row["value"]) || asString(row["text"]);
  }
  return "";
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

function safeUrls(value: unknown) {
  return stringArray(value)
    .map((item) => safeSourceUrl(item))
    .filter((item): item is string => Boolean(item));
}

function extractCompetitors(value: unknown): CompetitorCard[] {
  const root = object(value);
  const rows = Array.isArray(root["competitors"]) ? root["competitors"] : [];
  return rows
    .map((raw) => {
      const item = object(raw);
      const name = asString(item["name"]);
      const url = safeSourceUrl(asString(item["url"]));
      const evidence = typeof item["evidence"] === "string"
        ? [asString(item["evidence"])].filter(Boolean)
        : stringArray(item["evidence"]);
      const why = asString(item["why"]) || asString(item["note"]) || evidence[0] || "";
      const sourceUrls = [...new Set([
        ...(url ? [url] : []),
        ...safeUrls(item["sourceUrls"]),
      ])];
      return { name, url, why, evidence: evidence.slice(0, 3), sourceUrls: sourceUrls.slice(0, 5) };
    })
    .filter((item) => item.name)
    .slice(0, 8);
}

function extractInsights(value: unknown): InsightCard[] {
  return objectArray(value)
    .map((item) => ({
      title:
        asString(item["title"]) ||
        asString(item["name"]) ||
        asString(item["action"]) ||
        asString(item["recommendation"]),
      description:
        asString(item["description"]) ||
        asString(item["detail"]) ||
        asString(item["why"]) ||
        asString(item["reason"]) ||
        asString(item["recommendation"]),
      severity:
        asString(item["severity"]) ||
        asString(item["priority"]) ||
        asString(item["strength"]) ||
        asString(item["impact"]),
    }))
    .filter((item) => item.title || item.description)
    .slice(0, 6);
}

function extractChanges(value: unknown): ChangeCard[] {
  return objectArray(value)
    .map((item, index) => ({
      title:
        asString(item["title"]) ||
        asString(item["name"]) ||
        asString(item["metric"]) ||
        `تغيّر ${index + 1}`,
      before:
        displayValue(item["before"]) ||
        displayValue(item["previous"]) ||
        displayValue(item["from"]),
      after:
        displayValue(item["after"]) ||
        displayValue(item["current"]) ||
        displayValue(item["to"]),
      detail:
        asString(item["description"]) ||
        asString(item["detail"]) ||
        asString(item["why"]),
    }))
    .filter((item) => item.before || item.after || item.detail)
    .slice(0, 6);
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
    return new Intl.DateTimeFormat("ar-LB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return value;
  }
}

function postureCopy(posture: ReturnType<typeof liveProjection>["decision"]["posture"]) {
  if (posture === "ACT") return { ar: "تحرّك الآن", en: "ACT" };
  if (posture === "TEST") return { ar: "اختبر أولًا", en: "TEST" };
  if (posture === "WATCH") return { ar: "راقب", en: "WATCH" };
  if (posture === "IGNORE") return { ar: "لا تتحرك الآن", en: "IGNORE" };
  return { ar: "نحتاج معلومات أكثر", en: "INSUFFICIENT" };
}

function evidenceStrengthCopy(value: unknown) {
  const key = asString(value).toLowerCase();
  if (key === "high") return "قوية";
  if (key === "medium") return "متوسطة";
  if (key === "low") return "محدودة";
  return "غير محددة";
}

function collectSources(
  targetUrl: string | null,
  competitors: CompetitorCard[],
  signals: ReturnType<typeof liveProjection>["signals"],
  decisionUrls: string[],
  ledger: LinkedEvidence[],
): SourceCard[] {
  const map = new Map<string, SourceCard>();
  const add = (candidate: string | null | undefined, label: string, group: string) => {
    const url = safeSourceUrl(candidate);
    if (!url) return;
    const existing = map.get(url);
    if (!existing || group === "مرتبط بالقرار") map.set(url, { url, label, group });
  };

  add(targetUrl, "موقع الشركة", "الشركة");
  for (const competitor of competitors) {
    add(competitor.url, competitor.name, "منافس");
    competitor.sourceUrls.forEach((source) => add(source, competitor.name, "منافس"));
  }
  for (const signal of signals) signal.sources.forEach((source) => add(source, signal.title, "إشارة"));
  for (const item of ledger) add(item.url, item.kind || "دليل محفوظ", "دليل");
  for (const source of decisionUrls) add(source, "مصدر القرار", "مرتبط بالقرار");
  return [...map.values()].slice(0, 30);
}

export function LiveProductExperience() {
  const [session, setSession] = useState<SessionState>("checking");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [competitorInput, setCompetitorInput] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState("");
  const [projection, setProjection] = useState<ReturnType<typeof liveProjection> | null>(null);
  const [rawResult, setRawResult] = useState<unknown>(null);
  const [evidence, setEvidence] = useState<LinkedEvidence[]>([]);
  const [stamp, setStamp] = useState("");
  const [error, setError] = useState("");
  const [ledgerError, setLedgerError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [decisionContext, setDecisionContext] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [decisionResponse, setDecisionResponse] = useState<DecisionResponse>("");
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
      const response = await fetch("/api/business-context", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("context-read-failed");
      const body = object(await response.json());
      const context = object(body["context"]);
      setReady(body["completed"] === true);
      const website = asString(context["websiteUrl"]);
      if (website) setUrl(website);
      try {
        setHistory(await listAnalyses());
      } catch {
        setHistory([]);
      }
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
    setProjection(next);
    setRawResult(data);
    setEvidence([]);
    setLedgerError("");
    setStamp(next.at || knownTime);
    setQuestion("");
    setAnswer("");
    setDecisionContext("");
    setContextNote("");
    setDecisionResponse("");

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
        body: JSON.stringify({
          storeUrl: url.trim(),
          competitors: competitorInput
            .split(/[\n,]/)
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      const body = object(await response.json());
      if (!response.ok) throw new Error(asString(body["error"]) || "التحليل لم يكتمل.");
      if (!mounted.current) return;
      await show(body);
      try {
        setHistory(await listAnalyses());
      } catch {
        // A completed result stays visible if refreshing history fails.
      }
    } catch (caught) {
      if (!mounted.current) return;
      const timedOut = caught instanceof Error && caught.name === "AbortError";
      setError(
        timedOut
          ? "انتهت مهلة العرض. راجع التحليلات السابقة قبل إعادة الفحص حتى لا تكرر الطلب."
          : `تعذّر إكمال الفحص. ${caught instanceof Error ? caught.message : ""}`,
      );
    } finally {
      clearTimeout(timer);
      if (mounted.current) setBusy(false);
    }
  }

  async function loadHistory() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const row = await getAnalysis({ data: { id: selected } });
      await show(JSON.parse(row.json), row.id, row.createdAt);
    } catch {
      setError("تعذّر فتح التحليل المحفوظ.");
    } finally {
      setBusy(false);
    }
  }

  function ask(text = question) {
    if (!projection || !text.trim()) return;
    setQuestion(text);
    setAnswer(answerLiveDecisionQuestion(projection.decision, text));
  }

  function recordResponse(value: DecisionResponse) {
    if (!projection || !value) return;
    setDecisionResponse(value);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `coanto:live-response:${projection.id || projection.url || "unsaved"}`,
      JSON.stringify({
        response: value,
        posture: projection.decision.posture,
        complete: projection.decision.complete,
        at: new Date().toISOString(),
      }),
    );
  }

  function captureContext() {
    if (!decisionContext.trim()) return;
    setContextNote(
      `تم أخذ هذا القيد بعين الاعتبار لهذه الجلسة: “${decisionContext.trim()}”. لم نغيّر القرار تلقائيًا لأن أثر هذا القيد يحتاج معلومات إضافية.`,
    );
  }

  const root = object(rawResult);
  const decision = projection?.decision;
  const competitors = extractCompetitors(rawResult);
  const threats = extractInsights(root["threats"]);
  const opportunities = extractInsights(root["opportunities"]);
  const actions = extractInsights(root["actions"] ?? root["action_plan"]);
  const changes = extractChanges(root["beforeAfter"]);
  const snapshot = object(root["snapshot"]);
  const posture = decision ? postureCopy(decision.posture) : null;
  const bounded = Boolean(decision && decision.posture !== "INSUFFICIENT" && !decision.complete);
  const targetUrl = projection?.url || safeSourceUrl(url);
  const targetDomain = hostname(targetUrl);
  const sources = projection && decision
    ? collectSources(targetUrl, competitors, projection.signals, decision.sourceUrls, evidence)
    : [];
  const directDecisionSources = new Set(decision?.sourceUrls ?? []);

  return (
    <section className="lp-app" dir="rtl">
      <div className="lp-hero">
        <div>
          <span className="lp-kicker"><Sparkles size={15} /> COANTO</span>
          <h1>راقب السوق. افهم ما تغيّر. قرّر.</h1>
          <p>أدخل موقع الشركة واترك COANTO يكتشف المنافسين والإشارات المهمة ويحوّلها إلى قرار قابل للمراجعة.</p>
        </div>
        <div className="lp-flow" aria-label="رحلة التحليل">
          <div><Globe2 size={18} /><span>1</span><b>الشركة</b></div>
          <i>←</i>
          <div><Users size={18} /><span>2</span><b>المنافسون</b></div>
          <i>←</i>
          <div><Search size={18} /><span>3</span><b>ما تغيّر</b></div>
          <i>←</i>
          <div><Target size={18} /><span>4</span><b>القرار</b></div>
        </div>
      </div>

      {session === "checking" && (
        <div className="lp-banner"><Loader2 className="lp-spin" size={18} /> نتحقق من حسابك…</div>
      )}

      {error && <div className="lp-banner lp-banner-error" role="alert"><AlertTriangle size={18} /> {error}</div>}

      {session === "error" && (
        <button className="lp-btn lp-btn-secondary" onClick={() => void initialize()}>إعادة الاتصال</button>
      )}

      {session === "signed-out" && (
        <div className="lp-auth-card">
          <div>
            <span className="lp-section-label">تسجيل الدخول</span>
            <h2>ادخل إلى COANTO</h2>
            <p>بعد الدخول يمكنك تشغيل تحليل جديد أو فتح تحليل سابق.</p>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void signIn(); }}>
            <label htmlFor="lp-email">البريد الإلكتروني</label>
            <input id="lp-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} dir="ltr" />
            <label htmlFor="lp-password">كلمة المرور</label>
            <input id="lp-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} dir="ltr" />
            <button className="lp-btn lp-btn-primary" disabled={busy}>{busy ? <Loader2 className="lp-spin" size={17} /> : <ArrowUpRight size={17} />} دخول</button>
            <a className="lp-text-link" href="/auth?next=/live">إنشاء حساب أو استعادة كلمة المرور</a>
          </form>
        </div>
      )}

      {session === "signed-in" && !ready && (
        <div className="lp-banner lp-banner-warn">
          <AlertTriangle size={18} />
          <div><b>نحتاج معلومات شركتك الأساسية قبل التحليل.</b><br /><a href="/onboarding" onClick={() => window.sessionStorage.setItem("coanto:return-to", "/live")}>أكمل معلومات الشركة ثم ارجع إلى هنا.</a></div>
        </div>
      )}

      {session === "signed-in" && (
        <div className="lp-run-panel">
          <div className="lp-run-copy">
            <span className="lp-section-label">تحليل جديد</span>
            <h2>ما الشركة التي تريد تحليلها؟</h2>
            <p>ضع رابط الشركة. يمكنك ترك المنافسين فارغين ليكتشفهم COANTO بنفسه.</p>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void analyze(); }} className="lp-run-form">
            <label htmlFor="lp-url">موقع الشركة</label>
            <input id="lp-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://company.com" dir="ltr" />
            <label htmlFor="lp-competitors">منافسون تعرفهم <small>اختياري</small></label>
            <input id="lp-competitors" value={competitorInput} onChange={(event) => setCompetitorInput(event.target.value)} placeholder="https://competitor.com" dir="ltr" />
            <button className="lp-btn lp-btn-primary lp-run-btn" disabled={busy || !ready || !safeSourceUrl(url)}>
              {busy ? <Loader2 className="lp-spin" size={18} /> : <Zap size={18} />}
              {busy ? "COANTO يحلل الآن…" : "ابدأ التحليل"}
            </button>
          </form>
        </div>
      )}

      {busy && (
        <div className="lp-progress" role="status">
          <div className="lp-progress-head"><Loader2 className="lp-spin" size={20} /><div><b>التحليل قيد التنفيذ</b><span>سنضع النتيجة هنا فور اكتمالها.</span></div></div>
          <div className="lp-progress-steps">
            <span className="is-active">قراءة الشركة</span><span>اكتشاف المنافسين</span><span>ربط الإشارات</span><span>بناء القرار</span>
          </div>
        </div>
      )}

      {projection && decision && (
        <div className="lp-results">
          <div className="lp-result-head">
            <div>
              <span className="lp-section-label">آخر تحليل · {formatStamp(stamp) || "الآن"}</span>
              <h2>{targetDomain || "الشركة"}</h2>
              <p>ابدأ من الخلاصة، ثم انزل إلى المنافسين والمصادر والتفاصيل.</p>
            </div>
            <div className={`lp-posture lp-posture-${decision.posture.toLowerCase()}`}>
              <small>قرار COANTO</small>
              <strong>{posture?.ar}</strong>
              <span>{posture?.en}</span>
            </div>
          </div>

          <div className="lp-overview" aria-label="ملخص التحليل">
            <div className="lp-stat"><Users size={18} /><span>منافسون</span><strong>{competitors.length}</strong></div>
            <div className="lp-stat"><Search size={18} /><span>إشارات مهمة</span><strong>{projection.signals.length}</strong></div>
            <div className="lp-stat"><Globe2 size={18} /><span>مصادر جُمعت</span><strong>{sources.length}</strong></div>
            <div className="lp-stat"><ShieldCheck size={18} /><span>قوة البيانات</span><strong>{evidenceStrengthCopy(snapshot["evidenceStrength"])}</strong></div>
          </div>

          <div className="lp-decision-grid">
            <div className="lp-decision-main">
              <div className="lp-decision-title-row">
                <Target size={22} />
                <div>
                  <span>{bounded ? "قرار مؤقت حتى تتضح الصورة أكثر" : decision.complete ? "القرار مدعوم بالمعلومات المتاحة" : "نحتاج معلومات إضافية قبل قرار أقوى"}</span>
                  <h3>{decision.title || "لا يوجد قرار واضح بما يكفي بعد"}</h3>
                </div>
              </div>
              <p className="lp-decision-why">{decision.why || "المعلومات الحالية لا تكفي لشرح توصية أقوى."}</p>
              <div className="lp-next-action"><Zap size={20} /><div><small>ماذا تفعل الآن؟</small><b>{decision.nextAction || "لا تتخذ إجراءً بعد. اجمع المعلومات الناقصة أولًا."}</b></div></div>
            </div>
            <div className="lp-revisit-card">
              <Clock3 size={21} />
              <small>متى نراجع القرار؟</small>
              <b>{decision.trigger || "عند ظهور معلومات جديدة مرتبطة بالمنافس أو السوق."}</b>
            </div>
          </div>

          <div className="lp-section-head"><Users size={20} /><div><span>المشهد التنافسي</span><h3>من ينافس {targetDomain || "هذه الشركة"}؟</h3></div></div>
          {competitors.length ? (
            <div className="lp-competitor-grid">
              <article className="lp-company-card lp-company-card-primary">
                <div className="lp-avatar">أنت</div>
                <small>الشركة تحت التحليل</small>
                <h4>{targetDomain || hostname(url)}</h4>
                <p>هذه هي نقطة المقارنة التي تُقرأ حولها تحركات المنافسين والإشارات.</p>
                {targetUrl && <a href={targetUrl} target="_blank" rel="noreferrer">فتح الموقع <ExternalLink size={12} /></a>}
              </article>
              {competitors.map((competitor, index) => (
                <article className="lp-company-card" key={`${competitor.name}-${index}`}>
                  <div className="lp-avatar">{index + 1}</div>
                  <small>منافس مكتشف</small>
                  <h4>{competitor.name}</h4>
                  <p>{competitor.why || "ظهر كمنافس تجاري ذي صلة في التحليل."}</p>
                  {!!competitor.evidence.length && (
                    <div className="lp-competitor-evidence">
                      <b>ما وجدناه</b>
                      {competitor.evidence.slice(0, 2).map((item, evidenceIndex) => <span key={evidenceIndex}>{item}</span>)}
                    </div>
                  )}
                  {competitor.url && <a href={competitor.url} target="_blank" rel="noreferrer">{hostname(competitor.url)} <ExternalLink size={12} /></a>}
                </article>
              ))}
            </div>
          ) : (
            <div className="lp-empty">لم يظهر منافس موثوق بما يكفي في هذه المحاولة.</div>
          )}

          {!!changes.length && (
            <>
              <div className="lp-section-head"><Sparkles size={20} /><div><span>قبل ← بعد</span><h3>ما الذي تغيّر؟</h3></div></div>
              <div className="lp-change-grid">
                {changes.map((change, index) => (
                  <article className="lp-change-card" key={`${change.title}-${index}`}>
                    <h4>{change.title}</h4>
                    {(change.before || change.after) && (
                      <div className="lp-change-row">
                        <div><small>قبل</small><strong>{change.before || "غير متوفر"}</strong></div>
                        <span>←</span>
                        <div><small>الآن</small><strong>{change.after || "غير متوفر"}</strong></div>
                      </div>
                    )}
                    {change.detail && <p>{change.detail}</p>}
                  </article>
                ))}
              </div>
            </>
          )}

          <div className="lp-section-head"><Search size={20} /><div><span>ما الذي يستحق الانتباه؟</span><h3>الإشارات الأهم</h3></div></div>
          {projection.signals.length ? (
            <div className="lp-signal-list">
              {projection.signals.slice(0, 8).map((signal, index) => (
                <article className="lp-signal-card" key={`${signal.title}-${index}`}>
                  <div className="lp-signal-index">{String(index + 1).padStart(2, "0")}</div>
                  <div>
                    <small>إشارة مرتبطة بالتحليل</small>
                    <h4>{signal.title}</h4>
                    <p>{signal.description}</p>
                    {!!signal.sources.length && <div className="lp-source-row">{signal.sources.slice(0, 4).map((source) => <a href={source} target="_blank" rel="noreferrer" key={source}>{hostname(source)} <ExternalLink size={11} /></a>)}</div>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="lp-empty">لم تظهر إشارات كافية في هذه المحاولة. راجع المنافسين والمصادر التي تم جمعها أدناه.</div>
          )}

          {(opportunities.length > 0 || threats.length > 0 || actions.length > 0) && (
            <>
              <div className="lp-section-head"><Target size={20} /><div><span>الصورة الأوسع</span><h3>الفرص والتهديدات والخطوات المقترحة</h3></div></div>
              <div className="lp-insight-grid">
                <article className="lp-insight-column lp-insight-positive">
                  <span>فرص</span>
                  {opportunities.length ? opportunities.map((item, index) => <Insight key={index} item={item} />) : <p>لا توجد فرصة واضحة بما يكفي.</p>}
                </article>
                <article className="lp-insight-column lp-insight-negative">
                  <span>تهديدات</span>
                  {threats.length ? threats.map((item, index) => <Insight key={index} item={item} />) : <p>لا يوجد تهديد واضح بما يكفي.</p>}
                </article>
                <article className="lp-insight-column lp-insight-action">
                  <span>خطوات ممكنة</span>
                  {actions.length ? actions.map((item, index) => <Insight key={index} item={item} />) : <p>لا توجد خطوات إضافية موثقة.</p>}
                </article>
              </div>
            </>
          )}

          <div className="lp-section-head"><Globe2 size={20} /><div><span>المصادر التي جمعها COANTO</span><h3>كل ما استطعنا ربطه بهذه النتيجة</h3></div></div>
          <div className="lp-source-panel">
            {sources.length ? (
              <div className="lp-source-grid lp-source-grid-rich">
                {sources.map((source) => (
                  <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                    <Globe2 size={16} />
                    <div><b>{source.label || hostname(source.url)}</b><small>{source.group} · {hostname(source.url)}</small></div>
                    {directDecisionSources.has(source.url) && <em>مرتبط بالقرار</em>}
                    <ExternalLink size={13} />
                  </a>
                ))}
              </div>
            ) : (
              <div className="lp-empty">لم نستطع ربط مصدر قابل للفتح بهذه النتيجة حتى الآن.</div>
            )}
            {ledgerError && <div className="lp-source-note">{ledgerError}</div>}
          </div>

          <div className="lp-section-head"><ShieldCheck size={20} /><div><span>مصادر مرتبطة بهذا القرار تحديدًا</span><h3>هل نستطيع تتبّع القرار إلى مصدر مباشر؟</h3></div></div>
          <div className="lp-source-panel lp-decision-source-panel">
            {decision.sourceUrls.length ? (
              <div className="lp-source-grid">{decision.sourceUrls.map((source) => <a href={source} target="_blank" rel="noreferrer" key={source}><ShieldCheck size={16} /><span>{hostname(source)}</span><ExternalLink size={13} /></a>)}</div>
            ) : sources.length ? (
              <div className="lp-empty">وجد COANTO {sources.length} مصدرًا في التحليل، لكن لم يربط أي رابط مباشرة بهذا القرار بعد. لذلك يبقى القرار أكثر تحفظًا.</div>
            ) : (
              <div className="lp-empty">لا توجد مصادر قابلة للتتبّع لهذا القرار في هذه المحاولة.</div>
            )}
          </div>

          <div className="lp-section-head"><ShieldCheck size={20} /><div><span>لماذا هذا القرار؟</span><h3>ما يدعمه، ما يعارضه، وما لا نعرفه</h3></div></div>
          <div className="lp-evidence-grid">
            <article className="lp-evidence-card lp-evidence-for">
              <div className="lp-evidence-title"><CheckCircle2 size={18} /><b>ما يدعم الاتجاه</b></div>
              <small>استنتاج من المعلومات المتاحة</small>
              {decision.evidenceFor.length ? <ul>{decision.evidenceFor.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>لا توجد أسباب داعمة مفصّلة بما يكفي.</p>}
            </article>
            <article className="lp-evidence-card lp-evidence-against">
              <div className="lp-evidence-title"><AlertTriangle size={18} /><b>ما قد يعارض القرار</b></div>
              <small>الحجة المقابلة</small>
              {decision.evidenceAgainst.length ? <ul>{decision.evidenceAgainst.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>لم نجد اعتراضًا موثقًا بعد. هذا لا يعني أنه غير موجود.</p>}
            </article>
            <article className="lp-evidence-card lp-evidence-unknown">
              <div className="lp-evidence-title"><Search size={18} /><b>ما لا نعرفه بعد</b></div>
              <small>معلومات قد تغيّر القرار</small>
              {decision.unknowns.length ? <ul>{decision.unknowns.slice(0, 8).map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>لم تُسجل مجهولات واضحة في النتيجة الحالية.</p>}
            </article>
          </div>

          <div className="lp-conversation-grid">
            <article className="lp-conversation-card">
              <div className="lp-section-head lp-section-head-compact"><MessageCircle size={20} /><div><span>اسأل COANTO</span><h3>افهم القرار أكثر</h3></div></div>
              <div className="lp-question-chips">
                {["ليش هذا القرار؟", "شو المصدر؟", "شو ضد القرار؟", "شو الناقص؟", "متى أراجعه؟"].map((preset) => <button type="button" key={preset} onClick={() => ask(preset)}>{preset}</button>)}
              </div>
              <div className="lp-ask-row"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="اسأل عن السبب، المصدر، الاعتراض أو الخطوة التالية" /><button type="button" className="lp-btn lp-btn-primary" disabled={!question.trim()} onClick={() => ask()}>اسأل</button></div>
              {answer && <div className="lp-answer">{answer}</div>}
            </article>

            <article className="lp-conversation-card">
              <div className="lp-section-head lp-section-head-compact"><Target size={20} /><div><span>سياق شركتك</span><h3>هل هناك قيد قد يغيّر القرار؟</h3></div></div>
              <p>مثل هامش ربح أدنى، مخزون محدود، هدف نمو أو التزام تجاري.</p>
              <div className="lp-ask-row"><input value={decisionContext} onChange={(event) => setDecisionContext(event.target.value)} placeholder="مثال: لا أستطيع خفض السعر تحت حد معين" /><button type="button" className="lp-btn lp-btn-secondary" disabled={!decisionContext.trim()} onClick={captureContext}>أضف</button></div>
              {contextNote && <div className="lp-answer">{contextNote}</div>}
            </article>
          </div>

          <div className="lp-response-panel">
            <div><span className="lp-section-label">قرارك أنت</span><h3>بعد ما شفت الصورة، ماذا ستفعل؟</h3><p>اختيارك لا ينفّذ أي إجراء تلقائي.</p></div>
            <div className="lp-response-buttons">
              {(["accept", "modify", "defer", "reject"] as DecisionResponse[]).map((value) => (
                <button type="button" key={value} className={decisionResponse === value ? "is-selected" : ""} onClick={() => recordResponse(value)}>
                  {value === "accept" ? "أقبل" : value === "modify" ? "أعدّل" : value === "defer" ? "أنتظر" : "أرفض"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {session === "signed-in" && history.length > 0 && (
        <details className="lp-history">
          <summary><History size={17} /> التحليلات السابقة</summary>
          <div className="lp-history-row">
            <select value={selected} onChange={(event) => setSelected(event.target.value)}>
              <option value="">اختر تحليلًا محفوظًا</option>
              {history.map((item) => <option value={item.id} key={item.id}>{hostname(item.storeUrl)} · {item.createdAt.slice(0, 10)}</option>)}
            </select>
            <button type="button" className="lp-btn lp-btn-secondary" disabled={busy || !selected} onClick={() => void loadHistory()}>فتح التحليل</button>
          </div>
        </details>
      )}
    </section>
  );
}

function Insight({ item }: { item: InsightCard }) {
  return (
    <div className="lp-insight-card">
      {item.severity && <small>{item.severity}</small>}
      {item.title && <b>{item.title}</b>}
      {item.description && <p>{item.description}</p>}
    </div>
  );
}
