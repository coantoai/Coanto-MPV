import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Eye,
  FileText,
  Globe2,
  Layers3,
  Loader2,
  PackageSearch,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { clientAuth } from "@/lib/auth-client";

type SessionState = "checking" | "signed-out" | "signed-in" | "error";
type ViewKey = "overview" | "moves" | "battlecards" | "gaps" | "brief";
type Json = Record<string, unknown>;

type Observation = {
  kind: string;
  entity: string;
  title: string;
  detail: string;
  sourceUrl: string;
  sourceType: string;
};

type Decision = {
  title: string;
  zone: string;
  why: string;
  nextAction: string;
  trigger: string;
  sourceUrls: string[];
  decisionEvidenceStatus: string;
};

type Battlecard = {
  name: string;
  url: string;
  whyItMatters: string;
  threat: string;
  observedMoves: Array<{ kind: string; title: string; detail: string; sourceUrl: string }>;
  signals: Json[];
};

function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function objects(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Json => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : []; }
function safeUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch { return ""; }
}
function host(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value; }
}
function posture(zone: string, linked: string) {
  if (linked !== "linked") return "INSUFFICIENT";
  const key = zone.toLowerCase().replace(/[\s_]+/g, "-");
  if (["do-now", "act", "execute-now", "now"].includes(key)) return "ACT";
  if (["test", "experiment", "pilot"].includes(key)) return "TEST";
  if (["monitor", "watch", "monitor-watch"].includes(key)) return "WATCH";
  if (key === "ignore") return "IGNORE";
  return "INSUFFICIENT";
}
function postureLabel(value: string) {
  if (value === "ACT") return "تحرّك الآن";
  if (value === "TEST") return "اختبر";
  if (value === "WATCH") return "راقب";
  if (value === "IGNORE") return "استبعد";
  return "الدليل ناقص";
}
function capabilityLabel(key: string) {
  const map: Record<string, string> = {
    monitoring: "الرصد والتغيّرات",
    pricing: "الأسعار",
    promotions: "العروض",
    availability: "التوفر",
    assortment: "التشكيلة",
    delivery: "التوصيل",
    battlecards: "Battlecards",
    seoTrafficGap: "SEO & Traffic Gap",
    reviewsSentiment: "Reviews & Sentiment",
    alerts: "Slack / Teams Alerts",
    executiveBrief: "Executive Brief",
  };
  return map[key] || key;
}
function statusLabel(status: string) {
  if (status === "observed") return "مرصود الآن";
  if (status === "available") return "متاح";
  if (status === "generated-from-current-evidence") return "متاح من الأدلة الحالية";
  if (status === "baseline-ready") return "تم إنشاء خط أساس";
  if (status === "event-layer-ready") return "طبقة الأحداث جاهزة";
  if (status === "provider-expansion-required") return "يحتاج مزود بيانات";
  if (status === "source-expansion-required") return "يحتاج مصادر إضافية";
  if (status === "insufficient-public-evidence") return "دليل عام غير كافٍ";
  return status || "غير محدد";
}

export function CompanyIntelligenceExperience() {
  const [session, setSession] = useState<SessionState>("checking");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<Json | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewKey>("overview");
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);

  const initialize = useCallback(async () => {
    setSession("checking");
    setError("");
    try {
      const auth = await clientAuth.getSession();
      if (!mounted.current) return;
      if (!auth) { setSession("signed-out"); return; }
      setSession("signed-in");
      const response = await fetch("/api/business-context", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("context-read-failed");
      const body = object(await response.json());
      const context = object(body["context"]);
      setReady(body["completed"] === true);
      const website = text(context["websiteUrl"]);
      if (website) setUrl(website);
    } catch {
      if (!mounted.current) return;
      setSession("error");
      setError("تعذّر الاتصال بالحساب. أعد المحاولة.");
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
    } finally { setBusy(false); }
  }

  async function analyze() {
    if (!ready || !safeUrl(url)) return;
    setBusy(true);
    setError("");
    setResult(null);
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 180000);
    try {
      const response = await fetch("/api/company-intelligence", {
        method: "POST",
        credentials: "same-origin",
        signal: abort.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeUrl: url.trim() }),
      });
      const body = object(await response.json());
      if (!response.ok) throw new Error(text(body["error"]) || "التحليل لم يكتمل.");
      if (!mounted.current) return;
      setResult(body);
      setView("overview");
    } catch (caught) {
      if (!mounted.current) return;
      const timedOut = caught instanceof Error && caught.name === "AbortError";
      setError(timedOut ? "انتهت مهلة التحليل. حاول لاحقًا." : (caught instanceof Error ? caught.message : "تعذّر إكمال التحليل."));
    } finally {
      clearTimeout(timer);
      if (mounted.current) setBusy(false);
    }
  }

  const commercial = useMemo(() => object(result?.["commercialIntelligence"]), [result]);
  const coverage = object(commercial["coverage"]);
  const observations: Observation[] = useMemo(() => objects(commercial["observations"]).map((item) => ({
    kind: text(item["kind"]), entity: text(item["entity"]), title: text(item["title"]), detail: text(item["detail"]),
    sourceUrl: safeUrl(item["sourceUrl"]), sourceType: text(item["sourceType"]),
  })), [commercial]);
  const decisions: Decision[] = useMemo(() => objects(result?.["priorityMatrix"] ?? result?.["priority_matrix"]).map((item) => ({
    title: text(item["title"]), zone: text(item["zone"]), why: text(item["why"]), nextAction: text(item["nextAction"]),
    trigger: text(item["trigger"]), sourceUrls: strings(item["sourceUrls"]).map(safeUrl).filter(Boolean), decisionEvidenceStatus: text(item["decisionEvidenceStatus"]),
  })).filter((item) => item.title), [result]);
  const battlecards: Battlecard[] = useMemo(() => objects(result?.["battlecards"]).map((item) => ({
    name: text(item["name"]), url: safeUrl(item["url"]), whyItMatters: text(item["whyItMatters"]), threat: text(item["threat"]),
    observedMoves: objects(item["observedMoves"]).map((move) => ({ kind: text(move["kind"]), title: text(move["title"]), detail: text(move["detail"]), sourceUrl: safeUrl(move["sourceUrl"]) })),
    signals: objects(item["signals"]),
  })).filter((item) => item.name), [result]);
  const brief = object(result?.["executiveBrief"]);
  const topThreat = object(brief["topThreat"]);
  const topOpportunity = object(brief["topOpportunity"]);
  const nextMove = object(brief["nextMove"]);
  const capabilities = object(result?.["capabilities"]);
  const competitors = objects(result?.["competitors"]);
  const signals = objects(result?.["signals"]);
  const metadata = object(result?.["metadata"]);

  if (session === "checking") {
    return <div className="ci-app"><div className="ci-login"><span className="ci-loading"><Loader2 className="ci-spin" size={18}/> عم نفتح مساحة COANTO…</span></div></div>;
  }
  if (session === "signed-out") {
    return <div className="ci-app"><div className="ci-login">
      <div className="ci-brand"><span className="ci-brand-mark"/> COANTO</div>
      <h2>ادخل إلى مساحة التحليل</h2>
      <p className="ci-sub">هذه نسخة اختبار داخلية حقيقية، مرتبطة بمحرك التحليل والمصادر.</p>
      <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" dir="ltr" />
      <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" dir="ltr" />
      <button className="ci-primary" disabled={busy} onClick={signIn}>{busy ? "عم ندخل…" : "دخول"}</button>
      {error ? <p className="ci-error">{error}</p> : null}
    </div></div>;
  }

  return <div className="ci-app"><div className="ci-shell">
    <aside className="ci-side">
      <div className="ci-brand"><span className="ci-brand-mark"/> COANTO</div>
      <div className="ci-company-chip"><strong>{url ? host(url) : "الشركة"}</strong><span>{url || "أدخل رابط الشركة"}</span></div>
      <nav className="ci-nav">
        <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><Target size={16}/> ما يستحق انتباهك</button>
        <button className={view === "moves" ? "active" : ""} onClick={() => setView("moves")}><Radar size={16}/> التحركات المرصودة</button>
        <button className={view === "battlecards" ? "active" : ""} onClick={() => setView("battlecards")}><Swords size={16}/> Battlecards</button>
        <button className={view === "gaps" ? "active" : ""} onClick={() => setView("gaps")}><BarChart3 size={16}/> Gaps & Coverage</button>
        <button className={view === "brief" ? "active" : ""} onClick={() => setView("brief")}><FileText size={16}/> Executive Brief</button>
      </nav>
    </aside>

    <main className="ci-main">
      <div className="ci-topbar">
        <div>
          <div className="ci-kicker">COMPETITIVE DECISION INTELLIGENCE</div>
          <h1 className="ci-title">شو لازم تعرف عن شركتك الآن؟</h1>
          <p className="ci-sub">COANTO يراقب الأدلة العامة، يفلتر الضجيج، ويرفع فقط التحركات التي يمكن أن تؤثر على قرار تجاري.</p>
        </div>
        <div className="ci-runbox">
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://company.com" />
          <button className="ci-primary" disabled={busy || !ready || !safeUrl(url)} onClick={analyze}>
            {busy ? <span className="ci-loading"><Loader2 className="ci-spin" size={15}/> عم نحلل</span> : <span className="ci-loading"><Search size={15}/> حلّل الشركة</span>}
          </button>
        </div>
      </div>

      {!ready ? <div className="ci-error">أكمل إعداد نشاطك أولًا حتى نربط التحليل بسياق شركتك.</div> : null}
      {error ? <div className="ci-error">{error}</div> : null}

      {!result && !busy ? <div className="ci-empty">
        <Sparkles size={28}/>
        <h3>ابدأ من رابط شركة واحدة فقط</h3>
        <p>المنافسون يُكتشفون تلقائيًا. ما منطلب منك تعبئة Dashboard ولا إدخال سيناريوهات.</p>
      </div> : null}

      {result && view === "overview" ? <>
        <section className="ci-pulse-grid">
          <article className="ci-pulse-card threat"><div className="ci-pulse-label"><AlertTriangle size={15}/> أهم تهديد الآن</div><h3>{text(topThreat["title"]) || "لا يوجد تهديد حاسم بعد"}</h3><p>{text(topThreat["detail"]) || "الدليل الحالي لا يبرر رفع تهديد محدد أكثر من غيره."}</p></article>
          <article className="ci-pulse-card opportunity"><div className="ci-pulse-label"><TrendingUp size={15}/> أهم فرصة الآن</div><h3>{text(topOpportunity["title"]) || "لا توجد فرصة حاسمة بعد"}</h3><p>{text(topOpportunity["detail"]) || "الدليل الحالي لا يبرر رفع فرصة محددة أكثر من غيرها."}</p></article>
          <article className="ci-pulse-card action"><div className="ci-pulse-label"><Zap size={15}/> أفضل خطوة تالية</div><h3>{text(nextMove["title"]) || "راجع أعلى حدث موثّق"}</h3><p>{text(nextMove["detail"]) || "نرفع فقط خطوة يمكن ربطها بدليل واضح أو نبقيها بحاجة لمعلومات أكثر."}</p></article>
        </section>

        <section className="ci-machine">
          <div className="ci-machine-step"><strong>{Number(coverage["observations"] || observations.length)}</strong><span>ملاحظة تجارية مرصودة</span></div><div className="ci-machine-arrow">←</div>
          <div className="ci-machine-step"><strong>{competitors.length}</strong><span>منافسون موثّقون</span></div><div className="ci-machine-arrow">←</div>
          <div className="ci-machine-step"><strong>{signals.length}</strong><span>إشارات نجت من الفلترة</span></div><div className="ci-machine-arrow">←</div>
          <div className="ci-machine-step"><strong>{decisions.filter((item) => item.decisionEvidenceStatus === "linked").length}</strong><span>أحداث مرتبطة بقرار</span></div>
        </section>

        <section className="ci-section">
          <div className="ci-section-head"><div><h2>ما الذي وجدناه تجاريًا؟</h2><p>أسعار، عروض، توفر، تشكيلة، توصيل وتموضع — فقط عندما يظهر دليل عام.</p></div><PackageSearch size={19}/></div>
          <div className="ci-observation-grid">
            {observations.slice(0, 12).map((item, index) => <article className="ci-observation" key={`${item.sourceUrl}-${item.kind}-${index}`}><span className="kind">{item.kind}</span><h4>{item.entity} · {item.title}</h4><p>{item.detail}</p>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer"><Globe2 size={11}/> المصدر</a> : null}</article>)}
          </div>
        </section>

        <section className="ci-section">
          <div className="ci-section-head"><div><h2>ما الذي يستحق قرارًا؟</h2><p>القرار يأتي بعد الفلترة، وليس بدل التحليل.</p></div><ShieldCheck size={19}/></div>
          <div className="ci-decision-list">
            {decisions.slice(0, 6).map((item, index) => { const p = posture(item.zone, item.decisionEvidenceStatus); return <article className="ci-decision" key={`${item.title}-${index}`}><div className={`ci-posture ${p}`}>{postureLabel(p)}</div><div><h3>{item.title}</h3><p>{item.why || "لا يوجد تفسير موثّق كافٍ بعد."}</p>{item.nextAction ? <p><strong>الخطوة التالية:</strong> {item.nextAction}</p> : null}{item.trigger ? <small>يتغيّر القرار عندما: {item.trigger}</small> : null}</div><span>{item.sourceUrls.length ? `${item.sourceUrls.length} مصادر` : "بلا مصدر مباشر"}</span></article>; })}
          </div>
        </section>
      </> : null}

      {result && view === "moves" ? <section className="ci-section">
        <div className="ci-section-head"><div><h2>التحركات المرصودة</h2><p>هذا هو الخط الأساسي الحالي. التشغيلات القادمة تسمح بـ Before → After الحقيقي.</p></div><Eye size={19}/></div>
        <div className="ci-observation-grid">{observations.map((item, index) => <article className="ci-observation" key={`${item.entity}-${index}`}><span className="kind">{item.kind}</span><h4>{item.entity}</h4><p>{item.detail}</p>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">فتح المصدر</a> : null}</article>)}</div>
      </section> : null}

      {result && view === "battlecards" ? <section className="ci-section">
        <div className="ci-section-head"><div><h2>Competitive Battlecards</h2><p>كل بطاقة تُبنى من المنافس الموثّق والتحركات والإشارات المرتبطة به.</p></div><Swords size={19}/></div>
        <div className="ci-battle-grid">{battlecards.map((card) => <article className="ci-battle" key={card.name}><h3>{card.name}</h3><p>{card.whyItMatters || "منافس موثّق في نفس السياق التجاري."}</p>{card.observedMoves.length ? <><strong>ما رصدناه</strong><ul>{card.observedMoves.slice(0, 5).map((move, index) => <li key={`${move.kind}-${index}`}>{move.title}: {move.detail}</li>)}</ul></> : <p>لا توجد حركة تجارية كافية من المصادر العامة الحالية.</p>}{card.url ? <a href={card.url} target="_blank" rel="noreferrer">الموقع الرسمي</a> : null}</article>)}</div>
      </section> : null}

      {result && view === "gaps" ? <>
        <section className="ci-section"><div className="ci-section-head"><div><h2>Data Coverage & Gaps</h2><p>هون ما منخترع Traffic أو Sentiment أو Market Share. بنقول بالضبط شو متوفر وشو ناقص.</p></div><Layers3 size={19}/></div>
          <div className="ci-cap-grid">{Object.entries(capabilities).map(([key, value]) => { const row = object(value); return <article className="ci-cap" key={key}><strong>{capabilityLabel(key)}</strong><span className="status">{statusLabel(text(row["status"]))}</span><span>{text(row["detail"])}</span></article>; })}</div>
        </section>
        <section className="ci-section"><div className="ci-section-head"><div><h2>المجهولات الحالية</h2><p>النقص ظاهر بدل ما يتحول إلى أرقام وهمية.</p></div><AlertTriangle size={19}/></div><div className="ci-decision-list">{strings(result["unknowns"]).slice(0, 10).map((item, index) => <article className="ci-decision" key={index}><div className="ci-posture INSUFFICIENT">UNKNOWN</div><div><p>{item}</p></div></article>)}</div></section>
      </> : null}

      {result && view === "brief" ? <section className="ci-section">
        <div className="ci-brief"><h3>Executive Brief</h3><p>{text(brief["headline"]) || "تم تحديث صورة المنافسة الحالية بناءً على الأدلة المتاحة."}</p><div className="ci-brief-grid"><div className="ci-brief-mini"><strong>أهم تهديد</strong><span>{text(topThreat["title"]) || "غير محسوم"}</span></div><div className="ci-brief-mini"><strong>أهم فرصة</strong><span>{text(topOpportunity["title"]) || "غير محسومة"}</span></div><div className="ci-brief-mini"><strong>أفضل خطوة</strong><span>{text(nextMove["title"]) || "راجع أعلى قرار موثّق"}</span></div></div></div>
        <div className="ci-section"><div className="ci-decision-list">{decisions.slice(0, 5).map((item, index) => { const p = posture(item.zone, item.decisionEvidenceStatus); return <article className="ci-decision" key={index}><div className={`ci-posture ${p}`}>{postureLabel(p)}</div><div><h3>{item.title}</h3><p>{item.why}</p>{item.nextAction ? <p><strong>التالي:</strong> {item.nextAction}</p> : null}</div></article>; })}</div></div>
      </section> : null}

      {result ? <div className="ci-section-head" style={{ marginTop: 28 }}><p>آخر تحليل: {text(metadata["analyzedAt"]) || "الآن"} · AI: {text(metadata["aiModel"]) || "—"} · Observations: {String(metadata["commercialObservationCount"] ?? observations.length)}</p><button className="ci-secondary" onClick={() => setView("overview")}><ArrowLeft size={14}/> العودة للملخص</button></div> : null}
    </main>
  </div></div>;
}
