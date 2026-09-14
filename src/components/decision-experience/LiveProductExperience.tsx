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
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractCompetitors(value: unknown): CompetitorCard[] {
  const root = object(value);
  const rows = Array.isArray(root["competitors"]) ? root["competitors"] : [];
  return rows
    .map((raw) => {
      const item = object(raw);
      const name = asString(item["name"]);
      const url = safeSourceUrl(asString(item["url"]));
      const evidence = Array.isArray(item["evidence"])
        ? item["evidence"].filter((entry): entry is string => typeof entry === "string").join(" · ")
        : asString(item["evidence"]);
      const why = asString(item["why"]) || asString(item["note"]) || evidence;
      return { name, url, why };
    })
    .filter((item) => item.name)
    .slice(0, 8);
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
  if (posture === "ACT") return { ar: "تحرّك الآن", en: "Act now" };
  if (posture === "TEST") return { ar: "اختبر أولًا", en: "Test first" };
  if (posture === "WATCH") return { ar: "راقب", en: "Watch" };
  if (posture === "IGNORE") return { ar: "لا تتحرك الآن", en: "Ignore for now" };
  return { ar: "الدليل غير كافٍ", en: "Insufficient evidence" };
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
      if (mounted.current) setLedgerError("تعذّر تحميل سجل الأدلة المرتبط بهذا التحليل.");
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
      if (!response.ok) {
        throw new Error(asString(body["error"]) || "التحليل لم يكتمل.");
      }
      if (!mounted.current) return;
      await show(body);
      try {
        setHistory(await listAnalyses());
      } catch {
        // Live result stays usable if history refresh fails.
      }
    } catch (caught) {
      if (!mounted.current) return;
      const timedOut = caught instanceof Error && caught.name === "AbortError";
      setError(
        timedOut
          ? "انتهت مهلة العرض. راجع التحليلات المحفوظة قبل إعادة الفحص حتى لا تكرر الاستهلاك."
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
      `سجّلنا هذا القيد لهذه الجلسة فقط: “${decisionContext.trim()}”. لم نغيّر القرار تلقائيًا لأن القيد يحتاج قاعدة موثّقة تربطه بالقرار.`,
    );
  }

  const decision = projection?.decision;
  const competitors = extractCompetitors(rawResult);
  const posture = decision ? postureCopy(decision.posture) : null;
  const bounded = Boolean(decision && decision.posture !== "INSUFFICIENT" && !decision.complete);
  const targetDomain = hostname(projection?.url || safeSourceUrl(url));

  return (
    <section className="lp-app" dir="rtl">
      <div className="lp-hero">
        <div>
          <span className="lp-kicker"><Sparkles size={15} /> تجربة COANTO الحية</span>
          <h1>من موقع الشركة إلى قرار واضح.</h1>
          <p>COANTO يكتشف المنافسين، يقرأ الإشارات، يتحقق من المصادر، ثم يقول لك ماذا يستحق أن تفعل الآن — وما الذي لا نعرفه بعد.</p>
        </div>
        <div className="lp-flow" aria-label="رحلة التحليل">
          <div><Globe2 size={18} /><span>1</span><b>شركتك</b></div>
          <i>←</i>
          <div><Users size={18} /><span>2</span><b>المنافسون</b></div>
          <i>←</i>
          <div><Search size={18} /><span>3</span><b>الإشارات</b></div>
          <i>←</i>
          <div><Target size={18} /><span>4</span><b>القرار</b></div>
        </div>
      </div>

      {session === "checking" && (
        <div className="lp-banner"><Loader2 className="lp-spin" size={18} /> نتحقق من جلسة حسابك…</div>
      )}

      {error && <div className="lp-banner lp-banner-error" role="alert"><AlertTriangle size={18} /> {error}</div>}

      {session === "error" && (
        <button className="lp-btn lp-btn-secondary" onClick={() => void initialize()}>إعادة الاتصال</button>
      )}

      {session === "signed-out" && (
        <div className="lp-auth-card">
          <div>
            <span className="lp-section-label">ابدأ من هنا</span>
            <h2>ادخل بحسابك وشغّل أول تحليل حي</h2>
            <p>لن نعرض Demo أو بيانات وهمية. النتيجة التي ستراها تأتي من التحليل الحقيقي والمصادر الحقيقية.</p>
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
          <div><b>قبل أول تحليل نحتاج سياق نشاطك الأساسي.</b><br /><a href="/onboarding" onClick={() => window.sessionStorage.setItem("coanto:return-to", "/live")}>أكمل معلومات الشركة ثم ارجع تلقائيًا إلى هنا.</a></div>
        </div>
      )}

      {session === "signed-in" && (
        <div className="lp-run-panel">
          <div className="lp-run-copy">
            <span className="lp-section-label">تحليل جديد</span>
            <h2>أي شركة تريد أن نحللها؟</h2>
            <p>ضع رابط الشركة. اترك المنافسين فارغين إذا أردت أن يكتشفهم COANTO بنفسه.</p>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void analyze(); }} className="lp-run-form">
            <label htmlFor="lp-url">موقع الشركة</label>
            <input id="lp-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.allbirds.com/" dir="ltr" />
            <label htmlFor="lp-competitors">منافسون تعرفهم <small>اختياري</small></label>
            <input id="lp-competitors" value={competitorInput} onChange={(event) => setCompetitorInput(event.target.value)} placeholder="https://competitor.com" dir="ltr" />
            <button className="lp-btn lp-btn-primary lp-run-btn" disabled={busy || !ready || !safeSourceUrl(url)}>
              {busy ? <Loader2 className="lp-spin" size={18} /> : <Zap size={18} />}
              {busy ? "COANTO يحلل الآن…" : "ابدأ التحليل الحي"}
            </button>
          </form>
        </div>
      )}

      {busy && (
        <div className="lp-progress" role="status">
          <div className="lp-progress-head"><Loader2 className="lp-spin" size={20} /><div><b>التحليل قيد التنفيذ</b><span>لا تعمل Refresh. سنعرض النتيجة هنا عند اكتمالها.</span></div></div>
          <div className="lp-progress-steps">
            <span className="is-active">قراءة الشركة</span><span>اكتشاف المنافسين</span><span>فحص الإشارات</span><span>بناء القرار</span>
          </div>
        </div>
      )}

      {projection && decision && (
        <div className="lp-results">
          <div className="lp-result-head">
            <div>
              <span className="lp-section-label">نتيجة حقيقية · {formatStamp(stamp) || "الآن"}</span>
              <h2>{targetDomain || "الشركة تحت التحليل"}</h2>
              <p>هذه هي الخلاصة التي يجب أن تفهمها قبل أي تفاصيل.</p>
            </div>
            <div className={`lp-posture lp-posture-${decision.posture.toLowerCase()}`}>
              <small>قرار COANTO</small>
              <strong>{posture?.ar}</strong>
              <span>{decision.posture}</span>
            </div>
          </div>

          <div className="lp-decision-grid">
            <div className="lp-decision-main">
              <div className="lp-decision-title-row">
                <Target size={22} />
                <div><span>{bounded ? "قرار محدود بالأدلة المتاحة" : decision.complete ? "قرار مكتمل بالأدلة المتاحة" : "قرار يحتاج دليلًا إضافيًا"}</span><h3>{decision.title || "لم يثبت عنوان قرار واضح بعد"}</h3></div>
              </div>
              <p className="lp-decision-why">{decision.why || "لا يوجد سبب موثّق كفاية لعرض توصية أقوى."}</p>
              <div className="lp-next-action"><Zap size={20} /><div><small>الخطوة التالية</small><b>{decision.nextAction || "لا تنفّذ إجراءً بعد — نحتاج دليلًا أو سياقًا إضافيًا."}</b></div></div>
            </div>
            <div className="lp-revisit-card">
              <Clock3 size={21} />
              <small>متى نعيد فتح القرار؟</small>
              <b>{decision.trigger || "لم يتحدد Trigger موثّق بعد."}</b>
            </div>
          </div>

          <div className="lp-section-head"><Users size={20} /><div><span>المشهد التنافسي</span><h3>من يقف حول {targetDomain || "الشركة"}؟</h3></div></div>
          {competitors.length ? (
            <div className="lp-competitor-grid">
              <article className="lp-company-card lp-company-card-primary">
                <div className="lp-avatar">أنت</div>
                <small>الشركة تحت التحليل</small>
                <h4>{targetDomain || hostname(url)}</h4>
                <p>نقارن الإشارات حول هذه الشركة مع المنافسين المكتشفين، بدون افتراض أنها أفضل أو أسوأ مسبقًا.</p>
              </article>
              {competitors.map((competitor, index) => (
                <article className="lp-company-card" key={`${competitor.name}-${index}`}>
                  <div className="lp-avatar">{index + 1}</div>
                  <small>منافس مكتشف</small>
                  <h4>{competitor.name}</h4>
                  <p>{competitor.why || "ظهر كمنافس تجاري ذي صلة في التحليل."}</p>
                  {competitor.url && <a href={competitor.url} target="_blank" rel="noreferrer">{hostname(competitor.url)} <ExternalLink size={12} /></a>}
                </article>
              ))}
            </div>
          ) : (
            <div className="lp-empty">لم نحصل على منافسين قابلين للعرض من هذه النتيجة.</div>
          )}

          <div className="lp-section-head"><Search size={20} /><div><span>ما الذي لفت انتباه COANTO؟</span><h3>الإشارات الأهم</h3></div></div>
          {projection.signals.length ? (
            <div className="lp-signal-list">
              {projection.signals.slice(0, 5).map((signal, index) => (
                <article className="lp-signal-card" key={`${signal.title}-${index}`}>
                  <div className="lp-signal-index">{String(index + 1).padStart(2, "0")}</div>
                  <div><small>إشارة من التحليل</small><h4>{signal.title}</h4><p>{signal.description}</p>
                    {!!signal.sources.length && <div className="lp-source-row">{signal.sources.slice(0, 3).map((source) => <a href={source} target="_blank" rel="noreferrer" key={source}>{hostname(source)} <ExternalLink size={11} /></a>)}</div>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="lp-empty">لم تُرجع هذه المحاولة إشارات واضحة قابلة للعرض.</div>
          )}

          <div className="lp-section-head"><ShieldCheck size={20} /><div><span>لماذا هذا القرار؟</span><h3>الدليل، الاعتراض، وما لا نعرفه</h3></div></div>
          <div className="lp-evidence-grid">
            <article className="lp-evidence-card lp-evidence-for">
              <div className="lp-evidence-title"><CheckCircle2 size={18} /><b>ما يدعم الاتجاه</b></div>
              <small>تفسير AI يجب قراءته مع المصادر</small>
              {decision.evidenceFor.length ? <ul>{decision.evidenceFor.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>لا يوجد تفسير داعم مفصّل في النتيجة الحالية.</p>}
            </article>
            <article className="lp-evidence-card lp-evidence-against">
              <div className="lp-evidence-title"><AlertTriangle size={18} /><b>ما قد يعارضه</b></div>
              <small>Red Team</small>
              {decision.evidenceAgainst.length ? <ul>{decision.evidenceAgainst.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p><b>فجوة دليل:</b> لم نجد Counter-evidence موثّقًا. هذا لا يعني أنه غير موجود.</p>}
            </article>
            <article className="lp-evidence-card lp-evidence-unknown">
              <div className="lp-evidence-title"><Search size={18} /><b>ما لا نعرفه بعد</b></div>
              <small>Unknowns</small>
              {decision.unknowns.length ? <ul>{decision.unknowns.slice(0, 6).map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>لم يسجل التحليل مجهولات صريحة. لا نعتبر هذا دليلًا أن الصورة كاملة.</p>}
            </article>
          </div>

          <div className="lp-source-panel">
            <div className="lp-section-head lp-section-head-compact"><ShieldCheck size={20} /><div><span>المصادر التي اجتازت التحقق</span><h3>افتحها بنفسك</h3></div></div>
            {decision.sourceUrls.length ? (
              <div className="lp-source-grid">{decision.sourceUrls.map((source) => <a href={source} target="_blank" rel="noreferrer" key={source}><Globe2 size={16} /><span>{hostname(source)}</span><ExternalLink size={13} /></a>)}</div>
            ) : <div className="lp-empty">لا توجد مصادر مرتبطة مباشرة بالقرار؛ لذلك لا ينبغي التعامل معه كقرار نهائي.</div>}
          </div>

          <div className="lp-conversation-grid">
            <article className="lp-conversation-card">
              <div className="lp-section-head lp-section-head-compact"><MessageCircle size={20} /><div><span>اسأل COANTO</span><h3>عن هذا القرار فقط</h3></div></div>
              <div className="lp-question-chips">
                {["ليش هذا القرار؟", "شو المصدر؟", "شو ضد القرار؟", "شو الناقص؟", "متى أراجعه؟"].map((preset) => <button type="button" key={preset} onClick={() => ask(preset)}>{preset}</button>)}
              </div>
              <div className="lp-ask-row"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="اسأل عن السبب، المصدر، الاعتراض أو الخطوة التالية" /><button type="button" className="lp-btn lp-btn-primary" disabled={!question.trim()} onClick={() => ask()}>اسأل</button></div>
              {answer && <div className="lp-answer">{answer}</div>}
            </article>

            <article className="lp-conversation-card">
              <div className="lp-section-head lp-section-head-compact"><Target size={20} /><div><span>هل هناك قيد داخلي؟</span><h3>أضف شيئًا قد يغيّر القرار</h3></div></div>
              <p>مثال: هامش ربح أدنى، مخزون محدود، هدف نمو، أو التزام تجاري. لن نحوله إلى “دليل سوق”.</p>
              <div className="lp-ask-row"><input value={decisionContext} onChange={(event) => setDecisionContext(event.target.value)} placeholder="مثال: لا أستطيع خفض السعر تحت حد معين" /><button type="button" className="lp-btn lp-btn-secondary" disabled={!decisionContext.trim()} onClick={captureContext}>سجّل</button></div>
              {contextNote && <div className="lp-answer">{contextNote}</div>}
            </article>
          </div>

          <div className="lp-response-panel">
            <div><span className="lp-section-label">قرارك أنت</span><h3>بعد ما شفت الصورة، شو رح تعمل؟</h3><p>هذا التسجيل يبقى محليًا في هذا المتصفح حاليًا.</p></div>
            <div className="lp-response-buttons">
              {(["accept", "modify", "defer", "reject"] as DecisionResponse[]).map((value) => (
                <button type="button" key={value} className={decisionResponse === value ? "is-selected" : ""} onClick={() => recordResponse(value)}>
                  {value === "accept" ? "أقبل" : value === "modify" ? "أعدّل" : value === "defer" ? "أنتظر" : "أرفض"}
                </button>
              ))}
            </div>
          </div>

          <details className="lp-tech-details">
            <summary><ShieldCheck size={16} /> كيف تحقّقنا؟ <span>تفاصيل تقنية اختيارية</span></summary>
            <div className="lp-tech-body">
              <p>COANTO لا يرفع التوصية إلى Decision Event إلا إذا ارتبطت بمصدر مرصود أو مصدر Grounding اجتاز بوابة الربط. وجود ACT أو TEST وحده لا يعني يقينًا.</p>
              {decision.promotionBlockedBy.length > 0 && <p><b>النواقص الحالية:</b> {decision.promotionBlockedBy.join(" · ")}</p>}
              {ledgerError && <p>{ledgerError}</p>}
              <div className="lp-ledger-grid">
                {evidence.slice(0, 12).map((item) => (
                  <div key={item.id}><small>{item.kind} · {item.status}</small><p>{item.content.slice(0, 280)}</p>{safeSourceUrl(item.url) && <a href={safeSourceUrl(item.url)!} target="_blank" rel="noreferrer">المصدر <ExternalLink size={11} /></a>}</div>
                ))}
              </div>
            </div>
          </details>
        </div>
      )}

      {session === "signed-in" && history.length > 0 && (
        <details className="lp-history">
          <summary><History size={17} /> افتح تحليلًا سابقًا بدل استهلاك API جديد</summary>
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
