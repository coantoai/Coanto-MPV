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
import { liveProjection, object } from "@/lib/decision-experience/live-model";
import { safeSourceUrl, type Lang } from "@/lib/decision-experience/model";

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
          "هذا المسار يستخدم خدمات COANTO الحالية. نعرض ما وصل فعلًا، ونفصل تفسير AI عن المصدر. صيغة القرار الجديدة لا تُضاف تلقائيًا إلى تحليل قديم.",
          "This view uses existing COANTO services. We show what actually returned and separate AI interpretation from its source. We do not automatically turn an older analysis into a full new decision brief.",
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
              "نفس نظام الدخول الموجود. تبقى بيانات الجلسة في Cookie آمنة؛ لا نحفظ كلمة السر هنا.",
              "The existing sign-in system. Session credentials stay in a secure cookie; this view does not store your password.",
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
            <a
              className="nx-secondary"
              href="/auth"
              target="_blank"
              rel="noreferrer"
            >
              {say(
                "إنشاء حساب / استعادة الدخول",
                "Create account / recover access",
              )}
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
              <h3>
                {say(
                  "سياق حسابك يحتاج إكمالًا",
                  "Your account context needs completion",
                )}
              </h3>
              <p className="nx-small">
                {say(
                  "الـAPI الحالية تشترط السياق الأساسي قبل الفحص. لم نغيّر هذا الشرط في المعاينة.",
                  "The existing API requires business context before analysis. This preview preserves that requirement.",
                )}
              </p>
              <div className="nx-button-row">
                <a
                  href="/onboarding"
                  target="_blank"
                  rel="noreferrer"
                  className="nx-primary"
                >
                  {say("أكمل السياق الحالي", "Complete existing setup")}
                  <ExternalLink size={14} />
                </a>
                <button
                  className="nx-secondary"
                  onClick={() => void initialize()}
                >
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
            <label htmlFor="nx-real-url">
              {say("رابط موقع شركتك", "Your business website")}
            </label>
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
              {say(
                "روابط المنافسين — اختياري، افصل بفاصلة",
                "Competitor URLs — optional, comma separated",
              )}
            </label>
            <input
              id="nx-real-competitors"
              dir="ltr"
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
            />
            <div className="nx-button-row">
              <button
                className="nx-primary"
                disabled={busy || !ready || !safeSourceUrl(url)}
              >
                {busy ? (
                  <Loader2 className="nx-loading" size={17} />
                ) : (
                  <Globe2 size={17} />
                )}{" "}
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
            <h3>
              {say("أو افتح تحليلًا من سجلك", "Or open a saved analysis")}
            </h3>
            {history.length ? (
              <>
                <label htmlFor="nx-history">
                  {say("آخر 20 تحليلًا متاحًا", "Up to 20 recent analyses")}
                </label>
                <select
                  id="nx-history"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">
                    {say("اختر تحليلًا", "Choose an analysis")}
                  </option>
                  {history.map((h) => (
                    <option value={h.id} key={h.id}>
                      {h.storeUrl} · {h.createdAt.slice(0, 10)}
                    </option>
                  ))}
                </select>
                <div className="nx-button-row">
                  <button
                    className="nx-secondary"
                    disabled={busy || !selected}
                    onClick={() => void loadHistory()}
                  >
                    {say("افتح مع الأدلة", "Open with evidence")}
                  </button>
                </div>
              </>
            ) : (
              <p className="nx-small">
                {say(
                  "لم يُرجع السجل تحليلات محفوظة.",
                  "No saved analyses were returned.",
                )}
              </p>
            )}
          </div>
        </>
      )}
      {busy && (
        <p role="status" className="nx-live-status">
          {say(
            "الطلب قيد التنفيذ… لا تغلق هذه الصفحة.",
            "Request in progress… keep this page open.",
          )}
        </p>
      )}
      {result && (
        <div className="nx-card">
          <span className="nx-mode-label">REAL ANALYSIS · NOT DEMO</span>
          <h3 style={{ marginTop: 16 }}>
            {say("شو وصلنا من الفحص؟", "What did the analysis return?")}
          </h3>
          <p className="nx-small">
            {stamp || say("تاريخ الفحص غير متاح", "Analysis time unavailable")}
          </p>
          <div className="nx-update-note">
            <b>
              Insufficient Evidence —{" "}
              {say("لقرار كامل بصيغة R60", "for a complete R60 decision")}
            </b>
            <p>
              {say(
                "هذا تحليل فعلي، لكن لا توجد هنا دورة قرار موثّقة تشمل المعارضة والتاريخ وشرط المراجعة. لن نخترع ACT أو TEST أو WATCH أو IGNORE.",
                "This is a real analysis, but it does not contain a verified decision lifecycle with counter-evidence, history and reopening conditions. We will not invent ACT, TEST, WATCH or IGNORE.",
              )}
            </p>
          </div>
          {result.signals.length ? (
            result.signals.slice(0, 3).map((s, i) => (
              <div className="nx-live-source" key={i}>
                <small>
                  AI INFERENCE ·{" "}
                  {say(
                    "تفسير يحتاج مراجعة المصدر",
                    "Interpretation to verify against its source",
                  )}
                </small>
                <h4>{s.title}</h4>
                <p>{s.description}</p>
                {s.sources.map((u) => (
                  <div key={u}>
                    <a href={u} target="_blank" rel="noreferrer">
                      {u}
                      <ExternalLink size={12} />
                    </a>
                  </div>
                ))}
                {!s.sources.length && (
                  <small>
                    {say(
                      "لا توجد روابط مصادر في هذه الملاحظة. لا تعتمدها كحقيقة.",
                      "This observation has no source links. Do not treat it as an established fact.",
                    )}
                  </small>
                )}
              </div>
            ))
          ) : (
            <p>
              {say(
                "لم ترجع ملاحظات قابلة للعرض.",
                "No displayable observations returned.",
              )}
            </p>
          )}
          <details className="nx-details">
            <summary>
              {say("شو بعدنا ما منعرف؟", "What is still unknown?")}
            </summary>
            {result.unknowns.length ? (
              <ul>
                {result.unknowns.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            ) : (
              <p>
                {say(
                  "لم يسجل التحليل مجهولات صريحة. هذا لا يعني أنها غير موجودة.",
                  "The analysis did not record explicit unknowns. That does not mean none exist.",
                )}
              </p>
            )}
            <p>
              {say(
                "الأدلة المعارضة وشرط تغيير القرار لم يُربطا بهذا العرض. نحتاج مراجعة قبل اقتراح تصرّف.",
                "Counter-evidence and a reopening trigger are not linked in this view. Review is needed before advice.",
              )}
            </p>
          </details>
          <details className="nx-details">
            <summary>
              {say(
                "سجل الأدلة المرتبط بهذا التحليل",
                "Evidence ledger linked to this analysis",
              )}{" "}
              · {evidence.length}
            </summary>
            {ledgerError && <p role="alert">{ledgerError}</p>}
            {!evidence.length && !ledgerError && (
              <p>
                {say(
                  "لا توجد أدلة محفوظة مرتبطة بهذه النتيجة.",
                  "No saved evidence is linked to this result.",
                )}
              </p>
            )}
            {evidence.map((e) => (
              <div className="nx-live-source" key={e.id}>
                <small>
                  {e.kind} · {e.status} · {e.group}
                </small>
                {safeSourceUrl(e.url) && (
                  <a
                    href={safeSourceUrl(e.url)!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {e.url}
                  </a>
                )}
                <p>{e.content}</p>
                <small>
                  {say("رُصد: ", "Observed: ")}
                  {e.observedAt || "Unknown"} · {say("جُلب: ", "Retrieved: ")}
                  {e.retrievedAt || "Unknown"}
                </small>
                <small dir="ltr">ID: {e.id}</small>
              </div>
            ))}
          </details>
        </div>
      )}
    </section>
  );
}
