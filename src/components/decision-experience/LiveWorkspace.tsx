import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ExternalLink,
  Globe2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { clientAuth } from "@/lib/auth-client";
import {
  getAnalysis,
  listAnalyses,
  type HistoryItem,
} from "@/lib/history.functions";
import {
  getLinkedEvidence,
  type LinkedEvidence,
} from "@/lib/decision-experience/live.functions";
import {
  answerLiveDecisionQuestion,
  liveProjection,
  object,
} from "@/lib/decision-experience/live-model";
import { safeSourceUrl, type Lang } from "@/lib/decision-experience/model";

const RETURN_TO_KEY = "coanto:return-to";
type DecisionResponse = "accept" | "modify" | "defer" | "reject" | "";

export function LiveWorkspace({ lang }: { lang: Lang }) {
  const say = useCallback(
    (ar: string, en: string) => (lang === "ar" ? ar : en),
    [lang],
  );
  const [session, setSession] = useState<
    "checking" | "signed-out" | "signed-in" | "error"
  >("checking");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<ReturnType<typeof liveProjection> | null>(null);
  const [evidence, setEvidence] = useState<LinkedEvidence[]>([]);
  const [error, setError] = useState("");
  const [ledgerError, setLedgerError] = useState("");
  const [stamp, setStamp] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [decisionContext, setDecisionContext] = useState("");
  const [contextResult, setContextResult] = useState("");
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
      const ctx = object(body["context"]);
      if (!mounted.current) return;
      setReady(body["completed"] === true);
      if (typeof ctx["websiteUrl"] === "string") setUrl(ctx["websiteUrl"]);
      const items = await listAnalyses();
      if (mounted.current) setHistory(items);
    } catch {
      if (!mounted.current) return;
      setSession("error");
      setError(
        say(
          "تعذّر الاتصال بخدمات الحساب. لا توجد نتيجة بديلة تجريبية.",
          "Account services could not be reached. No demo result has been substituted.",
        ),
      );
    }
  }, [say]);

  useEffect(() => {
    mounted.current = true;
    void initialize();
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [initialize]);

  function rememberLiveReturn() {
    if (typeof window !== "undefined")
      window.sessionStorage.setItem(RETURN_TO_KEY, "/live");
  }

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      await clientAuth.signIn(email, password);
      setPassword("");
      await initialize();
    } catch {
      setError(
        say(
          "تعذّر الدخول. تحقّق من بياناتك أو اتصال خدمة الحساب.",
          "Sign-in failed. Check your credentials or account service connection.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function show(data: unknown, knownId = "", knownTime = "") {
    const projected = liveProjection(data);
    setResult(projected);
    setEvidence([]);
    setLedgerError("");
    setStamp(projected.at || knownTime);
    setQuestion("");
    setAnswer("");
    setDecisionContext("");
    setContextResult("");
    setDecisionResponse("");

    const id = knownId || projected.id;
    if (!id) {
      setLedgerError(
        say(
          "لا يوجد معرّف حفظ لربط هذه النتيجة بسجل الأدلة.",
          "No saved analysis ID is available to link this result to its evidence ledger.",
        ),
      );
      return;
    }
    try {
      const rows = await getLinkedEvidence({ data: { id } });
      if (mounted.current) setEvidence(rows);
    } catch {
      if (mounted.current)
        setLedgerError(
          say(
            "تعذّر تحميل سجل الأدلة المرتبط. النتيجة المعروضة لا تصبح أكثر ثقة بسبب ذلك.",
            "The linked evidence ledger could not be loaded. The displayed result does not become more trustworthy because of that.",
          ),
        );
    }
  }

  async function loadHistory() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const row = await getAnalysis({ data: { id: selected } });
      if (mounted.current) await show(JSON.parse(row.json), row.id, row.createdAt);
    } catch {
      setError(say("تعذّر فتح التحليل المحفوظ.", "Could not open the saved analysis."));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function analyze() {
    if (!ready || !safeSourceUrl(url)) return;
    setBusy(true);
    setError("");
    setResult(null);
    setEvidence([]);
    setLedgerError("");
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
          competitors: competitors
            .split(/[\n,]/)
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      const body = object(await response.json());
      if (!response.ok)
        throw new Error(
          typeof body["error"] === "string"
            ? body["error"]
            : say("الفحص لم يكتمل.", "Analysis did not complete."),
        );
      if (!mounted.current) return;
      await show(body);
      try {
        setHistory(await listAnalyses());
      } catch {
        // The live result remains usable if history refresh fails.
      }
    } catch (caught) {
      if (!mounted.current) return;
      const timedOut = caught instanceof Error && caught.name === "AbortError";
      setError(
        timedOut
          ? say(
              "انتهت مهلة العرض. قد يكون الفحص ما زال يعمل على الخادم؛ راجع السجل قبل إعادته.",
              "The display timed out. The server may still be processing; check history before retrying.",
            )
          : say(
              "تعذّر إكمال الفحص. لا توجد نتيجة مؤكّدة من هذه المحاولة. ",
              "The analysis could not complete. No result is confirmed for this attempt. ",
            ) + (caught instanceof Error ? caught.message : ""),
      );
    } finally {
      clearTimeout(timer);
      if (mounted.current) setBusy(false);
    }
  }

  function askDecision() {
    if (!result) return;
    setAnswer(answerLiveDecisionQuestion(result.decision, question));
  }

  function reEvaluateWithContext() {
    if (!result || !decisionContext.trim()) return;
    const decision = result.decision;
    setContextResult(
      decision.posture === "INSUFFICIENT"
        ? say(
            `سجّلت هذا السياق لهذه الجلسة فقط: “${decisionContext.trim()}”. القرار يبقى INSUFFICIENT لأن النقص الحالي في الدليل نفسه (${decision.promotionBlockedBy.join("، ") || "دليل مرتبط بالقرار"})، وليس شيئًا يمكن ملؤه من كلام المستخدم.`,
            `Captured for this browser session only: “${decisionContext.trim()}”. The decision remains INSUFFICIENT because the current gap is evidence itself (${decision.promotionBlockedBy.join(", ") || "decision-linked evidence"}), not something user context can safely replace.`,
          )
        : say(
            `أعدت التقييم مع السياق: “${decisionContext.trim()}”. لا أغيّر ${decision.posture} آليًا لأن التحليل الحالي لا يعرّف قاعدة موثّقة تربط هذا القيد بتغيير القرار. نحتفظ بالسياق كعامل يحتاج اختباره بدل اختراع أثره.`,
            `Re-evaluated with: “${decisionContext.trim()}”. I am not changing ${decision.posture} automatically because this analysis does not define a verified rule linking that constraint to a posture change. The context is retained as a factor to test rather than an invented effect.`,
          ),
    );
  }

  function recordResponse(value: DecisionResponse) {
    if (!result || !value) return;
    setDecisionResponse(value);
    if (typeof window === "undefined") return;
    const key = `coanto:live-response:${result.id || result.url || "unsaved"}`;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        response: value,
        posture: result.decision.posture,
        complete: result.decision.complete,
        at: new Date().toISOString(),
      }),
    );
  }

  const decision = result?.decision;
  const bounded = Boolean(
    decision && decision.posture !== "INSUFFICIENT" && !decision.complete,
  );
  const counterEvidenceMissing = Boolean(
    decision && decision.posture !== "INSUFFICIENT" && !decision.evidenceAgainst.length,
  );

  return (
    <section className="nx-live">
      <span className="nx-eyebrow">
        <Globe2 size={16} />
        EXTERNAL EVIDENCE MODE
      </span>
      <h1>{say("ابدأ بشركتك. وبالدليل المتاح.", "Start with your business. And the available evidence.")}</h1>
      <p>
        {say(
          "هذا المسار يستخدم خدمات COANTO الحقيقية. نعرض ما وصل فعلًا، نفصل تفسير AI عن المصدر، ولا نرفع توصية إلى Decision Event إلا بعد مرور مصادر القرار عبر Evidence Gate.",
          "This path uses real COANTO services. We show what actually returned, separate AI interpretation from sources, and promote a recommendation into a Decision Event only after its decision sources pass the Evidence Gate.",
        )}
      </p>

      {session === "checking" && (
        <div className="nx-live-status" role="status">
          <Loader2 className="nx-loading" size={17} />
          {say("عم نتحقق من جلسة حسابك…", "Checking your account session…")}
        </div>
      )}
      {error && <div className="nx-live-status" role="alert">{error}</div>}
      {session === "error" && (
        <button className="nx-secondary" onClick={() => void initialize()}>
          {say("أعد الاتصال", "Retry connection")}
        </button>
      )}

      {session === "signed-out" && (
        <form
          className="nx-card nx-live-form"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn();
          }}
        >
          <h3>{say("ادخل بحساب COANTO", "Sign in with your COANTO account")}</h3>
          <p className="nx-small">
            {say(
              "نفس نظام الدخول الحقيقي. تبقى بيانات الجلسة في Cookie آمنة؛ لا نحفظ كلمة السر هنا.",
              "The real sign-in system. Session credentials stay in a secure cookie; this view does not store your password.",
            )}
          </p>
          <label htmlFor="nx-email">{say("البريد الإلكتروني", "Email")}</label>
          <input
            id="nx-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            dir="ltr"
          />
          <label htmlFor="nx-password">{say("كلمة السر", "Password")}</label>
          <input
            id="nx-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            dir="ltr"
          />
          <div className="nx-button-row">
            <button disabled={busy} className="nx-primary">
              {busy ? <Loader2 className="nx-loading" size={17} /> : <ArrowUpRight size={16} />}{" "}
              {say("دخول", "Sign in")}
            </button>
            <a className="nx-secondary" href="/auth" onClick={rememberLiveReturn}>
              {say("إنشاء حساب / استعادة الدخول", "Create account / recover access")}
            </a>
          </div>
        </form>
      )}

      {session === "signed-in" && (
        <>
          <div className="nx-live-status">
            <ShieldCheck size={16} />
            {say(
              "جلسة حساب فعلية. الفحص الجديد يستخدم حصة التحليل المعتادة في حسابك.",
              "Authenticated account. A new analysis uses your existing account’s normal analysis allowance.",
            )}
          </div>

          {!ready && (
            <div className="nx-card">
              <h3>{say("سياق حسابك يحتاج إكمالًا", "Your account context needs completion")}</h3>
              <p className="nx-small">
                {say(
                  "الـAPI الحقيقية تشترط السياق الأساسي قبل الفحص. عند الحفظ سترجع تلقائيًا إلى Live E2E.",
                  "The real API requires business context before analysis. After saving, you will return to Live E2E automatically.",
                )}
              </p>
              <div className="nx-button-row">
                <a href="/onboarding" onClick={rememberLiveReturn} className="nx-primary">
                  {say("أكمل سياق النشاط", "Complete business context")}
                </a>
                <button className="nx-secondary" onClick={() => void initialize()}>
                  {say("حدّث بعد الإكمال", "Refresh after completion")}
                </button>
              </div>
            </div>
          )}

          <form
            className="nx-card"
            onSubmit={(event) => {
              event.preventDefault();
              void analyze();
            }}
          >
            <h3>{say("فحص حقيقي جديد", "Run a real analysis")}</h3>
            <label htmlFor="nx-real-url">{say("رابط موقع شركتك", "Your business website")}</label>
            <input
              id="nx-real-url"
              type="url"
              required
              dir="ltr"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://your-business.com"
            />
            <label htmlFor="nx-real-competitors">
              {say("روابط المنافسين — اختياري، افصل بفاصلة", "Competitor URLs — optional, comma separated")}
            </label>
            <input
              id="nx-real-competitors"
              dir="ltr"
              value={competitors}
              onChange={(event) => setCompetitors(event.target.value)}
            />
            <div className="nx-button-row">
              <button className="nx-primary" disabled={busy || !ready || !safeSourceUrl(url)}>
                {busy ? <Loader2 className="nx-loading" size={17} /> : <Globe2 size={17} />}{" "}
                {say("افحص بالمصادر الحقيقية", "Analyze with real sources")}
              </button>
            </div>
            <p className="nx-small">
              {say(
                "قد يستغرق الفحص بضع دقائق. أي نقص في الوصول أو الحصة سيظهر كخطأ، لا كنجاح تجريبي.",
                "Analysis may take a few minutes. Acquisition or allowance failures are errors, not demo successes.",
              )}
            </p>
          </form>

          <div className="nx-card">
            <h3>{say("أو افتح تحليلًا من سجلك", "Or open a saved analysis")}</h3>
            {history.length ? (
              <>
                <label htmlFor="nx-history">{say("آخر 20 تحليلًا متاحًا", "Up to 20 recent analyses")}</label>
                <select id="nx-history" value={selected} onChange={(event) => setSelected(event.target.value)}>
                  <option value="">{say("اختر تحليلًا", "Choose an analysis")}</option>
                  {history.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.storeUrl} · {item.createdAt.slice(0, 10)}
                    </option>
                  ))}
                </select>
                <div className="nx-button-row">
                  <button className="nx-secondary" disabled={busy || !selected} onClick={() => void loadHistory()}>
                    {say("افتح مع الأدلة", "Open with evidence")}
                  </button>
                </div>
              </>
            ) : (
              <p className="nx-small">{say("لم يُرجع السجل تحليلات محفوظة.", "No saved analyses were returned.")}</p>
            )}
          </div>
        </>
      )}

      {busy && (
        <p role="status" className="nx-live-status">
          {say("الطلب قيد التنفيذ… لا تغلق هذه الصفحة.", "Request in progress… keep this page open.")}
        </p>
      )}

      {result && decision && (
        <div className="nx-card">
          <span className="nx-mode-label">REAL ANALYSIS · NOT DEMO</span>
          <h3 style={{ marginTop: 16 }}>{say("Decision Event", "Decision Event")}</h3>
          <p className="nx-small">{stamp || say("تاريخ الفحص غير متاح", "Analysis time unavailable")}</p>

          {decision.posture !== "INSUFFICIENT" ? (
            <div className="nx-update-note">
              <b>
                {decision.posture}
                {bounded ? " · BOUNDED" : " · EVIDENCE-COMPLETE"}
                {decision.title ? ` · ${decision.title}` : ""}
              </b>
              <p>{decision.why}</p>
              {bounded && (
                <p className="nx-small">
                  {say(
                    `هذه توصية قرار قابلة للاستخدام، لكنها ليست R60 Decision Brief مكتملًا. الناقص: ${decision.promotionBlockedBy.join("، ") || "دورة قرار كاملة"}. لا نرفع درجة اليقين بسبب وجود ACT أو TEST وحدها.`,
                    `This is a usable bounded decision recommendation, not a complete R60 Decision Brief. Missing: ${decision.promotionBlockedBy.join(", ") || "full decision lifecycle"}. ACT or TEST alone does not increase certainty.`,
                  )}
                </p>
              )}
            </div>
          ) : (
            <div className="nx-update-note">
              <b>
                INSUFFICIENT
                {decision.candidatePosture ? ` · Candidate ${decision.candidatePosture}` : ""}
              </b>
              <p>
                {say(
                  "التحليل الحقيقي قد يحتوي اتجاهًا، لكن COANTO لن يحوله إلى قرار من دون Evidence Gate مكتمل وسبب ومصدر موثّق مرتبط مباشرة بالقرار.",
                  "The real analysis may contain a direction, but COANTO will not promote it into a decision without a completed Evidence Gate, rationale, and a verified source directly linked to that decision.",
                )}
              </p>
              {decision.title && <p><b>{decision.title}</b></p>}
              {!!decision.promotionBlockedBy.length && (
                <p className="nx-small">
                  {say("الناقص: ", "Missing: ")}{decision.promotionBlockedBy.join(" · ")}
                </p>
              )}
            </div>
          )}

          {!!decision.evidenceFor.length && (
            <details className="nx-details" open>
              <summary>{say("Supporting interpretation — لماذا يميل التحليل لهذا الاتجاه", "Supporting interpretation — why the analysis leans this way")}</summary>
              <p className="nx-small">
                {say(
                  "النص أدناه من تفسير نموذج AI، وليس حقيقة مستقلة بحد ذاته. تحقق منه مقابل المصادر الموثّقة في القسم التالي.",
                  "The text below is AI interpretation, not an independently established fact. Check it against the gated sources in the next section.",
                )}
              </p>
              {decision.evidenceFor.map((item, index) => <p key={`for-${index}`}>{item}</p>)}
            </details>
          )}

          {!!decision.sourceUrls.length && (
            <details className="nx-details" open>
              <summary>{say("Gated Sources — المصادر التي اجتازت بوابة القرار", "Gated Sources — sources that passed the decision gate")}</summary>
              <p className="nx-small">
                {say(
                  "COANTO يسمح هنا فقط بروابط مطابقة لمصدر مرصود أو مصدر Grounding أعاده مزوّد AI؛ وجود الرابط لا يثبت وحده كل تفسير مكتوب فوقه.",
                  "COANTO only allows an exact observed URL or provider-grounded source here; the presence of a link does not by itself prove every interpretation written above it.",
                )}
              </p>
              {decision.sourceUrls.map((source) => (
                <div key={source} className="nx-live-source">
                  <a href={source} target="_blank" rel="noreferrer">
                    {source}<ExternalLink size={12} />
                  </a>
                </div>
              ))}
            </details>
          )}

          <details className="nx-details" open={counterEvidenceMissing}>
            <summary>{say("Counter-evidence / Red Team", "Counter-evidence / Red Team")}</summary>
            {decision.evidenceAgainst.length ? (
              <>
                <p className="nx-small">
                  {say(
                    "هذه نقاط معارضة سجّلها التحليل. تعامل معها كتفسير يحتاج نفس مراجعة المصادر، لا كحقائق مستقلة.",
                    "These are opposing points recorded by the analysis. Treat them as interpretations that require the same source review, not independent facts.",
                  )}
                </p>
                {decision.evidenceAgainst.map((item, index) => <p key={`against-${index}`}>{item}</p>)}
              </>
            ) : (
              <div className="nx-live-status" role="status">
                {say(
                  "EVIDENCE GAP — لم يُسجل Counter-evidence موثّق لهذا القرار. هذا لا يعني أن الاعتراض غير موجود؛ لذلك يبقى القرار BOUNDED وغير مكتمل.",
                  "EVIDENCE GAP — no verified counter-evidence was recorded for this decision. That does not mean no counter-case exists; the decision remains BOUNDED and incomplete.",
                )}
              </div>
            )}
          </details>

          <details className="nx-details" open>
            <summary>{say("Unknowns + Trigger + Next Action", "Unknowns + Trigger + Next Action")}</summary>
            {decision.unknowns.length ? (
              <ul>{decision.unknowns.map((unknown, index) => <li key={index}>{unknown}</li>)}</ul>
            ) : (
              <p>{say("لم يسجل التحليل مجهولات صريحة. هذا لا يعني أنها غير موجودة.", "The analysis did not record explicit unknowns. That does not mean none exist.")}</p>
            )}
            <p><b>Trigger:</b> {decision.trigger || say("غير موثّق بعد", "Not documented yet")}</p>
            <p><b>Next action:</b> {decision.nextAction || say("غير موثّقة بما يكفي", "Not sufficiently documented")}</p>
          </details>

          <div className="nx-card nx-live-form">
            <h3>{say("Ask COANTO — ضمن هذا الحدث فقط", "Ask COANTO — this event only")}</h3>
            <p className="nx-small">
              {say(
                "هذا مساعد Grounded حتمي للـDecision Event المعروض، وليس Chatbot حرًا. إذا الجواب غير موجود ضمن الحدث، يتوقف بدل التخمين.",
                "This is a deterministic grounded helper for the displayed Decision Event, not an open-ended chatbot. If the answer is not present in the event, it abstains instead of guessing.",
              )}
            </p>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={say("ليش؟ شو المصدر؟ شو ضد القرار؟ شو الناقص؟ متى أراجعه؟", "Why? Source? Counter-case? Unknowns? When should I revisit?")}
            />
            <div className="nx-button-row">
              <button type="button" className="nx-primary" disabled={!question.trim()} onClick={askDecision}>
                {say("اسأل ضمن الحدث", "Ask from this event")}
              </button>
            </div>
            {answer && <div className="nx-live-status">{answer}</div>}
          </div>

          <div className="nx-card nx-live-form">
            <h3>{say("هل في سياق داخلي قد يغيّر القرار؟", "Could internal context change the decision?")}</h3>
            <p className="nx-small">
              {say(
                "اكتب قيدًا واحدًا يمكن أن يغيّر القرار، مثل حد هامش، مخزون، هدف أو التزام تجاري. يبقى النص في هذه الجلسة ولا يتحول إلى دليل سوق.",
                "Add one constraint that could change the decision, such as a margin floor, inventory state, objective or commercial commitment. It stays session-only and never becomes market evidence.",
              )}
            </p>
            <input
              value={decisionContext}
              onChange={(event) => setDecisionContext(event.target.value)}
              placeholder={say("مثال: لا أستطيع خفض السعر تحت هامش X", "Example: I cannot price below my margin floor")}
            />
            <div className="nx-button-row">
              <button type="button" className="nx-secondary" disabled={!decisionContext.trim()} onClick={reEvaluateWithContext}>
                {say("أعد التقييم دون تخمين", "Re-evaluate without guessing")}
              </button>
            </div>
            {contextResult && <div className="nx-live-status">{contextResult}</div>}
          </div>

          <div className="nx-card">
            <h3>{say("قرارك أنت", "Your response")}</h3>
            <p className="nx-small">
              {say(
                "هذا التسجيل محلي في هذا المتصفح حاليًا؛ ليس Team Memory ولا إثبات Retention أو WTP.",
                "This is currently stored only in this browser; it is not team memory and not evidence of retention or willingness to pay.",
              )}
            </p>
            <div className="nx-button-row">
              {(["accept", "modify", "defer", "reject"] as DecisionResponse[]).map((value) => (
                <button
                  type="button"
                  className={decisionResponse === value ? "nx-primary" : "nx-secondary"}
                  onClick={() => recordResponse(value)}
                  key={value}
                >
                  {value === "accept"
                    ? say("أقبل", "Accept")
                    : value === "modify"
                      ? say("أعدّل", "Modify")
                      : value === "defer"
                        ? say("أنتظر", "Defer")
                        : say("أرفض", "Reject")}
                </button>
              ))}
            </div>
          </div>

          <h3 style={{ marginTop: 24 }}>{say("الإشارات التي وصلتنا", "Signals returned")}</h3>
          {result.signals.length ? (
            result.signals.slice(0, 3).map((signal, index) => (
              <div className="nx-live-source" key={index}>
                <small>AI INFERENCE · {say("تفسير يحتاج مراجعة المصدر", "Interpretation to verify against its source")}</small>
                <h4>{signal.title}</h4>
                <p>{signal.description}</p>
                {signal.sources.map((source) => (
                  <div key={source}>
                    <a href={source} target="_blank" rel="noreferrer">{source}<ExternalLink size={12} /></a>
                  </div>
                ))}
                {!signal.sources.length && (
                  <small>{say("لا توجد روابط مصادر في هذه الملاحظة. لا تعتمدها كحقيقة.", "This observation has no source links. Do not treat it as an established fact.")}</small>
                )}
              </div>
            ))
          ) : (
            <p>{say("لم ترجع ملاحظات قابلة للعرض.", "No displayable observations returned.")}</p>
          )}

          <details className="nx-details">
            <summary>{say("سجل الأدلة المرتبط بهذا التحليل", "Evidence ledger linked to this analysis")} · {evidence.length}</summary>
            {ledgerError && <p role="alert">{ledgerError}</p>}
            {!evidence.length && !ledgerError && (
              <p>{say("لا توجد أدلة محفوظة مرتبطة بهذه النتيجة.", "No saved evidence is linked to this result.")}</p>
            )}
            {evidence.map((item) => (
              <div className="nx-live-source" key={item.id}>
                <small>{item.kind} · {item.status} · {item.group}</small>
                {safeSourceUrl(item.url) && (
                  <a href={safeSourceUrl(item.url)!} target="_blank" rel="noreferrer">{item.url}</a>
                )}
                <p>{item.content}</p>
                <small>
                  {say("رُصد: ", "Observed: ")}{item.observedAt || "Unknown"} · {say("جُلب: ", "Retrieved: ")}{item.retrievedAt || "Unknown"}
                </small>
                <small dir="ltr">ID: {item.id}</small>
              </div>
            ))}
          </details>
        </div>
      )}
    </section>
  );
}
