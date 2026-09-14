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
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [url, setUrl] = useState(""),
    [competitors, setCompetitors] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]),
    [selected, setSelected] = useState("");
  const [result, setResult] = useState<ReturnType<
      typeof liveProjection
    > | null>(null),
    [evidence, setEvidence] = useState<LinkedEvidence[]>([]);
  const [error, setError] = useState(""),
    [ledgerError, setLedgerError] = useState(""),
    [stamp, setStamp] = useState("");
  const [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState("");
  const [decisionContext, setDecisionContext] = useState(""),
    [contextResult, setContextResult] = useState("");
  const [decisionResponse, setDecisionResponse] = useState<DecisionResponse>("");
  const mounted = useRef(true),
    controller = useRef<AbortController | null>(null);

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
      if (!response.ok)
        throw new Error(
          say(
            "تعذّر قراءة سياق حسابك. أعد المحاولة.",
            "Could not load your business context. Retry.",
          ),
        );
      const body = object(await response.json()),
        ctx = object(body["context"]);
      if (!mounted.current) return;
      setReady(body["completed"] === true);
      if (typeof ctx["websiteUrl"] === "string") setUrl(ctx["websiteUrl"]);
      const items = await listAnalyses();
      if (mounted.current) setHistory(items);
    } catch {
      if (mounted.current) {
        setSession("error");
        setError(
          say(
            "تعذّر الاتصال بخدمات الحساب. لا توجد نتيجة بديلة تجريبية.",
            "Account services could not be reached. No demo result has been substituted.",
          ),
        );
      }
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
            "تعذّر تحميل الأدلة المرتبطة. لا نعتمد النتيجة كتوصية مكتملة.",
            "Linked evidence could not be loaded. This is not a complete recommendation.",
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
      if (mounted.current)
        await show(JSON.parse(row.json), row.id, row.createdAt);
    } catch {
      setError(
        say("تعذّر فتح التحليل المحفوظ.", "Could not open the saved analysis."),
      );
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
            .map((x) => x.trim())
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
      if (mounted.current) {
        await show(body);
        try {
          setHistory(await listAnalyses());
        } catch {
          /* Analysis is still shown if history refresh fails. */
        }
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error && e.name === "AbortError"
            ? say(
                "انتهت مهلة العرض. قد يكون الفحص ما زال يعمل على الخادم؛ راجع السجل قبل إعادته.",
                "The display timed out. The server may still be processing; check history before retrying.",
              )
            : say(
                "تعذّر إكمال الفحص. لا توجد نتيجة مؤكّدة من هذه المحاولة. ",
                "The analysis could not complete. No result is confirmed for this attempt. ",
              ) + (e instanceof Error ? e.message : ""),
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
            `سجّلت هذا السياق لهذه الجلسة فقط: “${decisionContext.trim()}”. القرار يبقى INSUFFICIENT لأن النقص الحالي في الدليل نفسه (${decision.promotionBlockedBy.join("، ") || "دليل مرتبط بالقرار"})، وليس شيئًا يمكنني ملؤه من كلام المستخدم.`,
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
    if (typeof window !== "undefined") {
      const key = `coanto:live-response:${result.id || result.url || "unsaved"}`;
      window.localStorage.setItem(
        key,
        JSON.stringify({
          response: value,
          posture: result.decision.posture,
          at: new Date().toISOString(),
        }),
      );
    }
  }

  return (
    <section className="nx-live">
      <span className="nx-eyebrow">
        <Globe2 size={16} />
        EXTERNAL EVIDENCE MODE
      </span>
      <h1>
        {say(
          "ابدأ بشركتك. وبالدليل المتاح.",
          "Start with your business. And the available evidence.",
        )}
      </h1>
      <p>
        {say(
          "هذا المسار يستخدم خدمات COANTO الحقيقية. نعرض ما وصل فعلًا، نفصل تفسير AI عن المصدر، ونرفع Priority Matrix إلى Decision Event فقط عندما يكون الدليل المرتبط به كافيًا.",
          "This path uses real COANTO services. We show what actually returned, separate AI interpretation from sources, and promote a priority-matrix item into a Decision Event only when its linked evidence is sufficient.",
        )}
      </p>

      {session === "checking" && (
        <div className="nx-live-status" role="status">
          <Loader2 className="nx-loading" size={17} />
          {say("عم نتحقق من جلسة حسابك…", "Checking your account session…")}
        </div>
      )}
      {error && (
        <div className="nx-live-status" role="alert">
          {error}
        </div>
      )}
      {session === "error" && (
        <button className="nx-secondary" onClick={() => void initialize()}>
          {say("أعد الاتصال", "Retry connection")}
        </button>
      )}

      {session === "signed-out" && (
        <form
          className="nx-card nx-live-form"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <h3>
            {say("ادخل بحساب COANTO", "Sign in with your COANTO account")}
          </h3>
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
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
          />
          <label htmlFor="nx-password">{say("كلمة السر", "Password")}</label>
          <input
            id="nx-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
          />
          <div className="nx-button-row">
            <button disabled={busy} className="nx-primary">
              {busy ? (
                <Loader2 className="nx-loading" size={17} />
              ) : (
                <ArrowUpRight size={16} />
              )}{" "}
              {say("دخول", "Sign in")}
            </button>
            <a className="nx-secondary" href="/auth" target="_blank" rel="noreferrer">
              {say("إنشاء حساب / استعادة الدخول", "Create account / recover access")}
              <ExternalLink size={14} />
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
            onSubmit={(e) => {
              e.preventDefault();
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
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-business.com"
            />
            <label htmlFor="nx-real-competitors">
              {say("روابط المنافسين — اختياري، افصل بفاصلة", "Competitor URLs — optional, comma separated")}
            </label>
            <input
              id="nx-real-competitors"
              dir="ltr"
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
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
                <select id="nx-history" value={selected} onChange={(e) => setSelected(e.target.value)}>
                  <option value="">{say("اختر تحليلًا", "Choose an analysis")}</option>
                  {history.map((h) => (
                    <option value={h.id} key={h.id}>
                      {h.storeUrl} · {h.createdAt.slice(0, 10)}
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

      {result && (
        <div className="nx-card">
          <span className="nx-mode-label">REAL ANALYSIS · NOT DEMO</span>
          <h3 style={{ marginTop: 16 }}>{say("Decision Event", "Decision Event")}</h3>
          <p className="nx-small">{stamp || say("تاريخ الفحص غير متاح", "Analysis time unavailable")}</p>

          {result.decision.posture !== "INSUFFICIENT" ? (
            <div className="nx-update-note">
              <b>{result.decision.posture} · {result.decision.title}</b>
              <p>{result.decision.why}</p>
              {!result.decision.complete && (
                <p className="nx-small">
                  {say(
                    `هذا Decision Triage حقيقي لكنه غير مكتمل كـR60 Decision Brief. الناقص: ${result.decision.promotionBlockedBy.join("، ") || "دورة قرار كاملة"}.`,
                    `This is a real Decision Triage, but not yet a complete R60 Decision Brief. Missing: ${result.decision.promotionBlockedBy.join(", ") || "full decision lifecycle"}.`,
                  )}
                </p>
              )}
            </div>
          ) : (
            <div className="nx-update-note">
              <b>
                INSUFFICIENT
                {result.decision.candidatePosture ? ` · Candidate ${result.decision.candidatePosture}` : ""}
              </b>
              <p>
                {say(
                  "التحليل الحقيقي قد يحتوي أولوية أو اتجاهًا، لكن COANTO لن يحوله إلى قرار نهائي من دون سبب ومصادر مرتبطة مباشرة بصف القرار.",
                  "The real analysis may contain a priority or direction, but COANTO will not promote it to a final decision without a rationale and source URLs directly linked to that decision row.",
                )}
              </p>
              {result.decision.title && <p><b>{result.decision.title}</b></p>}
              {!!result.decision.promotionBlockedBy.length && (
                <p className="nx-small">
                  {say("الناقص: ", "Missing: ")}{result.decision.promotionBlockedBy.join(" · ")}
                </p>
              )}
            </div>
          )}

          {!!result.decision.sourceUrls.length && (
            <details className="nx-details" open>
              <summary>{say("Evidence For — المصادر المرتبطة بالقرار", "Evidence For — decision-linked sources")}</summary>
              {result.decision.evidenceFor.map((item, i) => <p key={`for-${i}`}>{item}</p>)}
              {result.decision.sourceUrls.map((u) => (
                <div key={u} className="nx-live-source">
                  <a href={u} target="_blank" rel="noreferrer">{u}<ExternalLink size={12} /></a>
                </div>
              ))}
            </details>
          )}

          <details className="nx-details">
            <summary>{say("Evidence Against", "Evidence Against")}</summary>
            {result.decision.evidenceAgainst.length ? (
              result.decision.evidenceAgainst.map((item, i) => <p key={`against-${i}`}>{item}</p>)
            ) : (
              <p>{say("لم يُسجل دليل معارض مرتبط بالقرار. هذا نقص، وليس إثباتًا لعدم وجود اعتراض.", "No decision-linked counter-evidence was recorded. That is a gap, not proof that no counter-case exists.")}</p>
            )}
          </details>

          <details className="nx-details">
            <summary>{say("Unknowns + Trigger + Next Action", "Unknowns + Trigger + Next Action")}</summary>
            {result.decision.unknowns.length ? (
              <ul>{result.decision.unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul>
            ) : (
              <p>{say("لم يسجل التحليل مجهولات صريحة. هذا لا يعني أنها غير موجودة.", "The analysis did not record explicit unknowns. That does not mean none exist.")}</p>
            )}
            <p><b>Trigger:</b> {result.decision.trigger || say("غير موثّق بعد", "Not documented yet")}</p>
            <p><b>Next action:</b> {result.decision.nextAction || say("غير موثّقة بما يكفي", "Not sufficiently documented")}</p>
          </details>

          <div className="nx-card nx-live-form">
            <h3>{say("Ask COANTO — ضمن هذا الحدث فقط", "Ask COANTO — this event only")}</h3>
            <p className="nx-small">
              {say(
                "هذا مساعد Grounded حتمي للـDecision Event المعروض، وليس Chatbot حرًا. إذا الجواب غير موجود بالأدلة، سيقول ذلك.",
                "This is a deterministic grounded helper for the displayed Decision Event, not an open-ended chatbot. If the answer is not in the event evidence, it abstains.",
              )}
            </p>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={say("ليش؟ شو الدليل؟ شو ضد القرار؟ شو الناقص؟ متى أراجعه؟", "Why? Evidence? Counter-case? Unknowns? When should I revisit?")}
            />
            <div className="nx-button-row">
              <button type="button" className="nx-primary" disabled={!question.trim()} onClick={askDecision}>
                {say("اسأل ضمن الأدلة", "Ask from evidence")}
              </button>
            </div>
            {answer && <div className="nx-live-status">{answer}</div>}
          </div>

          <div className="nx-card nx-live-form">
            <h3>{say("هل في سياق داخلي قد يغيّر القرار؟", "Could internal context change the decision?")}</h3>
            <p className="nx-small">
              {say(
                "اكتب قيدًا واحدًا فقط يمكن أن يغيّر القرار، مثل حد هامش، مخزون، هدف أو التزام تجاري. يبقى هذا النص في هذه الجلسة ولا يتحول إلى دليل سوق.",
                "Add one constraint that could change the decision, such as a margin floor, inventory state, objective or commercial commitment. It stays session-only and never becomes market evidence.",
              )}
            </p>
            <input
              value={decisionContext}
              onChange={(e) => setDecisionContext(e.target.value)}
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
                  {value === "accept" ? say("أقبل", "Accept") : value === "modify" ? say("أعدّل", "Modify") : value === "defer" ? say("أنتظر", "Defer") : say("أرفض", "Reject")}
                </button>
              ))}
            </div>
          </div>

          <h3 style={{ marginTop: 24 }}>{say("الإشارات التي وصلتنا", "Signals returned")}</h3>
          {result.signals.length ? (
            result.signals.slice(0, 3).map((s, i) => (
              <div className="nx-live-source" key={i}>
                <small>AI INFERENCE · {say("تفسير يحتاج مراجعة المصدر", "Interpretation to verify against its source")}</small>
                <h4>{s.title}</h4>
                <p>{s.description}</p>
                {s.sources.map((u) => (
                  <div key={u}><a href={u} target="_blank" rel="noreferrer">{u}<ExternalLink size={12} /></a></div>
                ))}
                {!s.sources.length && (
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
            {evidence.map((e) => (
              <div className="nx-live-source" key={e.id}>
                <small>{e.kind} · {e.status} · {e.group}</small>
                {safeSourceUrl(e.url) && (
                  <a href={safeSourceUrl(e.url)!} target="_blank" rel="noreferrer">{e.url}</a>
                )}
                <p>{e.content}</p>
                <small>{say("رُصد: ", "Observed: ")}{e.observedAt || "Unknown"} · {say("جُلب: ", "Retrieved: ")}{e.retrievedAt || "Unknown"}</small>
                <small dir="ltr">ID: {e.id}</small>
              </div>
            ))}
          </details>
        </div>
      )}
    </section>
  );
}
