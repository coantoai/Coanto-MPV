import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpLeft,
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Eye,
  FileText,
  Filter,
  Globe2,
  Layers3,
  MessageCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  X,
  GitBranch,
  CircleHelp,
  ExternalLink,
  CheckCircle2,
  Send,
  Download,
} from "lucide-react";
import { events } from "@/lib/decision-experience/fixtures";
import {
  answerQuestion,
  briefText,
  classifyQuestion,
  copy,
  effectivePosture,
  revisedEvent,
  floorScenario,
  postureLabel,
  STORAGE_KEY,
  type AskTopic,
  type Context,
  type Copy,
  type DecisionEvent,
  type DecisionRecord,
  type Lang,
  type Posture,
  type ResponseChoice,
} from "@/lib/decision-experience/model";
import { LiveWorkspace } from "./LiveWorkspace";

const filterList = [
  "all",
  "WATCH",
  "IGNORE",
  "changed",
  "INSUFFICIENT",
] as const;
type FilterKey = (typeof filterList)[number];
type Panel = "ask" | "context" | "record" | "pilot" | "about" | null;
const labels: Record<FilterKey, Copy> = {
  all: copy("تستحق انتباهك", "Needs attention"),
  WATCH: copy("قيد المتابعة", "Watching"),
  IGNORE: copy("تم استبعادها", "Intentionally ignored"),
  changed: copy("قرارات تغيّرت", "Changed decisions"),
  INSUFFICIENT: copy("دليل ناقص", "Missing evidence"),
};
const responses: Record<ResponseChoice, Copy> = {
  accepted: copy("أوافق", "Accept"),
  modified: copy("أعدّل", "Modify"),
  wait: copy("أنتظر", "Wait"),
  rejected: copy("أرفض", "Reject"),
};

export function DecisionExperience() {
  const [lang, setLang] = useState<Lang>("ar");
  const [cohort, setCohort] = useState<"retailer" | "brand">("retailer");
  const [selectedId, setSelectedId] = useState("price-window");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [panel, setPanel] = useState<Panel>(null);
  const [advanced, setAdvanced] = useState(false);
  const [context, setContext] = useState<Context>({
    floor: null,
    stock: "unknown",
  });
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [live, setLive] = useState(false);
  const [pilot, setPilot] = useState(false);
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [baselineInput, setBaselineInput] = useState("");
  const [choice, setChoice] = useState<ResponseChoice>("accepted");
  const [reason, setReason] = useState("");
  const [actualAction, setActualAction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<
    { question: string; answer: string }[]
  >([]);
  const t = (s: Copy) => s[lang];
  const say = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const event = revisedEvent(
    events.find((x) => x.id === selectedId) ?? events[0],
    advanced,
  );
  const posture = effectivePosture(event, advanced);
  const revision = event.id === "price-window" && advanced ? 2 : 1;
  const revealed = !pilot || Boolean(baseline[`${event.id}:${revision}`]);
  const Arrow = lang === "ar" ? ArrowUpLeft : ArrowUpRight;
  const visibleEvents = events
    .filter((x) => x.cohort === cohort)
    .filter((x) =>
      filter === "all"
        ? !["IGNORE", "INSUFFICIENT"].includes(effectivePosture(x, advanced))
        : filter === "changed"
          ? x.id === "price-window" && advanced
          : effectivePosture(x, advanced) === filter,
    );
  const scopeEvents = events.filter((x) => x.cohort === cohort);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as {
        records?: DecisionRecord[];
        advanced?: boolean;
      };
      if (Array.isArray(saved.records))
        setRecords(
          saved.records
            .filter(
              (r) =>
                r &&
                typeof r.eventId === "string" &&
                typeof r.reason === "string" &&
                typeof r.time === "string" &&
                typeof r.actualAction === "string" &&
                typeof r.outcome === "string" &&
                typeof r.baseline === "string" &&
                ["accepted", "modified", "wait", "rejected"].includes(
                  r.choice,
                ) &&
                [1, 2].includes(r.revision),
            )
            .slice(-100),
        );
      if (typeof saved.advanced === "boolean") setAdvanced(saved.advanced);
    } catch {
      /* Storage can be unavailable; session still works. */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, advanced }));
    } catch {
      /* No server fallback for demo data. */
    }
  }, [records, advanced, loaded]);
  useEffect(() => {
    setMessages([]);
    setQuery("");
    setNotice("");
    setReason("");
    setActualAction("");
    setOutcome("");
    setBaselineInput("");
  }, [selectedId, lang, advanced]);
  function chooseEvent(id: string) {
    setSelectedId(id);
    setPanel(null);
  }
  function changeCohort(value: "retailer" | "brand") {
    setCohort(value);
    setFilter("all");
    chooseEvent(value === "retailer" ? "price-window" : "channel-review");
    setContext({ floor: null, stock: "unknown" });
  }
  function setSelectedFilter(value: FilterKey) {
    setFilter(value);
    const first = scopeEvents.find((x) =>
      value === "all"
        ? !["IGNORE", "INSUFFICIENT"].includes(effectivePosture(x, advanced))
        : value === "changed"
          ? advanced && x.id === "price-window"
          : effectivePosture(x, advanced) === value,
    );
    if (first) chooseEvent(first.id);
  }
  async function share() {
    const text = briefText(event, lang, advanced, context);
    try {
      await navigator.clipboard.writeText(text);
      setNotice(
        say(
          "نسخنا الملخص مع الأدلة والتحفّظات ووسم DEMO. لم يُرسل لأحد.",
          "Copied with evidence, caveats and DEMO label. Nothing was sent.",
        ),
      );
    } catch {
      download(text, `COANTO-DEMO-${event.id}.txt`, "text/plain");
      setNotice(
        say("تم تنزيل الملخص بدل النسخ.", "Downloaded the brief instead."),
      );
    }
  }
  function ask(topic: AskTopic, question: string) {
    setMessages((old) =>
      [
        ...old,
        {
          question,
          answer: answerQuestion(event, topic, lang, advanced, context),
        },
      ].slice(-12),
    );
    setQuery("");
  }
  function recordChoice(value: ResponseChoice) {
    setChoice(value);
    setPanel("record");
  }
  function saveResponse() {
    if (!reason.trim()) return;
    const entry: DecisionRecord = {
      eventId: event.id,
      revision,
      choice,
      reason: reason.trim(),
      time: new Date().toISOString(),
      actualAction: actualAction.trim(),
      outcome: outcome.trim(),
      baseline: baseline[`${event.id}:${revision}`] ?? "",
    };
    setRecords((old) => [...old, entry].slice(-100));
    setPanel(null);
    setNotice(
      say(
        "سجّلنا رأيك في هذه المعاينة على جهازك. لم نغيّر أي سعر أو نشغّل إجراء.",
        "Your preview response was recorded on this device. No price or business action was changed.",
      ),
    );
  }
  const count = (key: FilterKey) =>
    scopeEvents.filter((x) =>
      key === "all"
        ? !["IGNORE", "INSUFFICIENT"].includes(effectivePosture(x, advanced))
        : key === "changed"
          ? advanced && x.id === "price-window"
          : effectivePosture(x, advanced) === key,
    ).length;
  return (
    <div className="nx" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <a className="nx-skip" href="#nx-main">
        {say("انتقل للمحتوى", "Skip to content")}
      </a>
      <aside className="nx-sidebar">
        <a
          href="/next"
          className="nx-brand"
          aria-label="COANTO Decision Experience"
        >
          <span className="nx-brand-mark">
            <span />
            <span />
            <span />
          </span>
          <strong dir="ltr">
            COANTO<span>DECISION EXPERIENCE</span>
          </strong>
        </a>
        <div className="nx-workspace">
          <div className="nx-avatar">{cohort === "retailer" ? "N" : "R"}</div>
          <label>
            <small>{say("شركة تجريبية", "Fictional business")}</small>
            <select
              aria-label={say("اختر الشركة", "Choose business")}
              value={cohort}
              onChange={(e) =>
                changeCohort(e.target.value as "retailer" | "brand")
              }
            >
              <option value="retailer">
                {say("نُقطة · متجر إلكتروني", "Nuqta · online retailer")}
              </option>
              <option value="brand">
                {say("رِواق · علامة تجارية", "Riwaq · channel brand")}
              </option>
            </select>
          </label>
        </div>
        <div className="nx-nav-label">
          {say("مساحة القرار", "YOUR DECISION SPACE")}
        </div>
        <nav aria-label={say("التنقل", "Navigation")}>
          <button
            className={!live ? "active" : ""}
            onClick={() => {
              setLive(false);
              setSelectedFilter("all");
            }}
          >
            <Layers3 size={19} />
            {say("ما يستحق انتباهك", "Your attention")}
          </button>
          <button
            onClick={() => {
              setLive(false);
              setSelectedFilter("WATCH");
            }}
          >
            <Eye size={19} />
            {say("المتابعة والشروط", "Watches & triggers")}
          </button>
          <button onClick={() => setPanel("pilot")}>
            <FileText size={19} />
            {say("سجل التجربة", "Decision notebook")}
            <span className="nx-nav-count">{records.length}</span>
          </button>
          <button
            className={live ? "active" : ""}
            onClick={() => setLive(true)}
          >
            <Globe2 size={19} />
            {say("جرّب بياناتك الحقيقية", "Use your real data")}
          </button>
        </nav>
        <div className="nx-sidebar-bottom">
          <div className="nx-quiet">
            <ShieldCheck size={21} />
            <b>{say("وضوح أكثر. ضجيج أقل.", "More clarity. Less noise.")}</b>
            <p>
              {say(
                "الدليل أولًا. والقرار يبقى إلك.",
                "Evidence first. The decision stays yours.",
              )}
            </p>
          </div>
          <button className="nx-link" onClick={() => setPanel("about")}>
            <CircleHelp size={16} />
            {say("عن هذه المعاينة", "About this preview")}
          </button>
          <a href="/demo" target="_blank" rel="noreferrer" className="nx-link">
            <ExternalLink size={16} />
            {say("افتح COANTO الحالية", "Open existing COANTO")}
          </a>
        </div>
      </aside>
      <div className="nx-body">
        <header className="nx-topbar">
          <div className="nx-breadcrumb">
            {say("مساحة العمل", "Workspace")}
            <span>/</span>
            <b>{say("القرار التالي", "Your next decision")}</b>
          </div>
          <div className="nx-top-actions">
            <span className="nx-preview-label">R1–R60 PREVIEW</span>
            <button
              className="nx-lang"
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              aria-label="Switch language"
            >
              {lang === "ar" ? "EN" : "العربية"}
            </button>
            <span className="nx-user">C</span>
          </div>
        </header>
        <main id="nx-main" className="nx-main">
          <div className="nx-demo-banner">
            <span className="nx-demo-dot" />
            <p>
              {live
                ? say(
                    "بيانات حسابك الحقيقية · لا تُستبدل بسيناريوهات عند تعذّر الفحص.",
                    "Real account data · never replaced with fixtures on failure.",
                  )
                : say(
                    "معاينة تفاعلية ببيانات تجريبية. الشركات والأسعار والأحداث هنا للتوضيح فقط.",
                    "Interactive preview with fictional data. Companies, prices and events are illustrative.",
                  )}
            </p>
            <button onClick={() => setPanel("about")}>
              {say("شو بيشتغل فعلًا؟", "What actually works?")}
              <Arrow size={14} />
            </button>
          </div>
          {live ? (
            <LiveWorkspace lang={lang} />
          ) : (
            <>
              <section className="nx-intro">
                <div>
                  <div className="nx-eyebrow">
                    <span />
                    {say(
                      "صورة أوضح لقرارك التالي",
                      "CLARITY FOR YOUR NEXT MOVE",
                    )}
                  </div>
                  <h1>
                    {say(
                      "مش كل تغيير بدّه ردّ.",
                      "Not every move needs a response.",
                    )}
                    <br />
                    <span>
                      {say(
                        "هيدا اللي يستحق انتباهك.",
                        "Here’s what deserves yours.",
                      )}
                    </span>
                  </h1>
                  <p>
                    {say(
                      "جمعنا التغييرات المرتبطة بقرار واحد. شوف السبب، ثم قرّر على بيّنة.",
                      "Related changes, brought into one decision. Understand the reason. Then make your call.",
                    )}
                  </p>
                </div>
                <button
                  className="nx-secondary"
                  onClick={() => setPanel("context")}
                >
                  <SlidersHorizontal size={17} />
                  {say("سياق شركتك", "Business context")}
                </button>
              </section>
              <div className="nx-attention-strip">
                <Filter size={17} />
                <span>
                  {say("في هذه العيّنة:", "In this sample:")}{" "}
                  <b>
                    {scopeEvents.reduce(
                      (sum, x) => sum + x.observations.length,
                      0,
                    )}
                  </b>{" "}
                  {say("ملاحظات", "observations")}
                </span>
                <span className="nx-strip-line" />
                <span>
                  <b>{scopeEvents.length}</b>{" "}
                  {say("أحداث مرتبطة بقرارات", "decision events")}
                </span>
                <span className="nx-strip-line" />
                <strong>
                  {count("all")} {say("تستحق المراجعة", "worth reviewing")}
                </strong>
                <small>
                  {say("ليست أرقام رصد حيّ", "Not live monitoring counts")}
                </small>
              </div>
              <div
                className="nx-filter-row"
                hidden={pilot && !revealed}
                role="group"
                aria-label={say("فلترة الأحداث", "Filter events")}
              >
                {filterList.map((key) => (
                  <button
                    key={key}
                    className={filter === key ? "active" : ""}
                    onClick={() => setSelectedFilter(key)}
                  >
                    {t(labels[key])}
                    <span>{count(key)}</span>
                  </button>
                ))}
              </div>
              {!visibleEvents.length ? (
                <div className="nx-empty">
                  <Eye size={34} />
                  <h2>
                    {say("ما في شيء هنا حاليًا.", "Nothing here right now.")}
                  </h2>
                  <p>
                    {filter === "changed"
                      ? say(
                          "افتح حدث التخفيض وجرّب تحديث المراقبة لتشوف كيف يتغيّر القرار.",
                          "Open the price event and simulate a new observation to see the decision change.",
                        )
                      : say(
                          "عدم وجود نتيجة حالة صحيحة. ما منضيف أحداث لمجرّد ملء الشاشة.",
                          "An empty state is valid. We do not invent events to fill the screen.",
                        )}
                  </p>
                  <button
                    className="nx-primary"
                    onClick={() => setSelectedFilter("all")}
                  >
                    {say("ارجع للأحداث", "Back to events")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="nx-event-picker">
                    {visibleEvents.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => chooseEvent(item.id)}
                        className={selectedId === item.id ? "selected" : ""}
                      >
                        <span
                          hidden={pilot && !revealed}
                          className={`nx-state-dot nx-${effectivePosture(item, advanced).toLowerCase()}`}
                        />
                        <span>{t(item.theme)}</span>
                        <b dir="ltr" hidden={pilot && !revealed}>
                          {effectivePosture(item, advanced) === "INSUFFICIENT"
                            ? "—"
                            : effectivePosture(item, advanced)}
                        </b>
                      </button>
                    ))}
                  </div>
                  {pilot && (
                    <div className="nx-pilot-banner">
                      <FileText size={17} />
                      {say(
                        "تمرين Pilot: سجّل قرارك قبل قراءة اقتراح COANTO. ليس اختبارًا مع عميل حقيقي.",
                        "Pilot rehearsal: record your decision before seeing COANTO’s advice. This is not a real customer test.",
                      )}
                      <button onClick={() => setPilot(false)}>
                        {say("إنهاء التمرين", "End rehearsal")}
                      </button>
                    </div>
                  )}
                  {!revealed ? (
                    <section className="nx-baseline nx-card">
                      <span className="nx-eyebrow">BEFORE COANTO</span>
                      <h2>
                        {say(
                          "قبل ما تشوف اقتراحنا، شو كنت رح تعمل؟",
                          "Before our advice, what would you do?",
                        )}
                      </h2>
                      <p>{t(event.happened)}</p>
                      <label htmlFor="nx-baseline">
                        {say(
                          "قرارك، السبب، ومتى تتصرّف",
                          "Your decision, reason and timing",
                        )}
                      </label>
                      <textarea
                        id="nx-baseline"
                        value={baselineInput}
                        maxLength={1500}
                        onChange={(e) => setBaselineInput(e.target.value)}
                      />
                      <button
                        className="nx-primary"
                        disabled={!baselineInput.trim()}
                        onClick={() => {
                          setBaseline((old) => ({
                            ...old,
                            [`${event.id}:${revision}`]: baselineInput.trim(),
                          }));
                          setBaselineInput("");
                        }}
                      >
                        {say(
                          "احفظ قراري واكشف الملخص",
                          "Save baseline & reveal brief",
                        )}
                        <Arrow size={16} />
                      </button>
                    </section>
                  ) : (
                    <>
                      <article
                        className="nx-brief nx-card"
                        key={`${event.id}:${revision}`}
                      >
                        <div className="nx-brief-top">
                          <div className="nx-eyebrow">
                            <ShieldCheck size={16} />
                            {t(event.theme)}
                          </div>
                          <div className="nx-brief-id" dir="ltr">
                            DEMO ·{" "}
                            {event.id === "price-window"
                              ? "01"
                              : event.id === "bundle-test"
                                ? "02"
                                : "03"}{" "}
                            / v{revision}
                          </div>
                        </div>
                        <div className="nx-brief-grid">
                          <div className="nx-brief-copy">
                            <div className="nx-state-line">
                              <button
                                className="nx-ask-inline"
                                onClick={() => setPanel("ask")}
                              >
                                <MessageCircle size={15} />
                                Ask COANTO
                              </button>
                              <State posture={posture} lang={lang} />
                              {revision === 2 && (
                                <span className="nx-changed">
                                  <GitBranch size={14} />
                                  WATCH → ACT
                                </span>
                              )}
                            </div>
                            <h2>
                              {t(
                                revision === 2 && event.changedTitle
                                  ? event.changedTitle
                                  : event.title,
                              )}
                            </h2>
                            <p className="nx-relevance">{t(event.relevance)}</p>
                            <div className="nx-reasons">
                              {(revision === 2
                                ? [
                                    copy(
                                      "المحاكاة أعادت توفر نفس الموديل.",
                                      "The simulation restored availability of the same model.",
                                    ),
                                    copy(
                                      "منافس ثانٍ لحق السعر في المحاكاة.",
                                      "A second seller followed in the simulation.",
                                    ),
                                    copy(
                                      "ACT يعني مراجعة العرض، وليس خفضًا تلقائيًا.",
                                      "ACT means review the offer, not an automatic price cut.",
                                    ),
                                  ]
                                : event.reasons
                              ).map((r, i) => (
                                <div key={i}>
                                  <span>{String(i + 1).padStart(2, "0")}</span>
                                  {t(r)}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="nx-visual">
                            <div className="nx-visual-caption">
                              {say("شو تغيّر؟", "What changed?")}
                              <span>{say("مثال توضيحي", "ILLUSTRATION")}</span>
                            </div>
                            {event.id === "price-window" ? (
                              <OfferVisual lang={lang} advanced={advanced} />
                            ) : (
                              <div className="nx-event-visual">
                                <div className="nx-orbit">
                                  <Layers3 size={32} />
                                </div>
                                <h3>{t(event.theme)}</h3>
                                <p>{t(event.happened)}</p>
                                <div className="nx-signal-tags">
                                  {event.observations.map((o) => (
                                    <span key={o.id}>
                                      {o.id} · {t(o.title)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="nx-visual-foot">
                              <ShieldCheck size={15} />
                              {say(
                                "الملاحظة منفصلة عن تفسيرها",
                                "Observation is separate from interpretation",
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="nx-next-action">
                          <div className="nx-next-icon">
                            <Arrow size={22} />
                          </div>
                          <div>
                            <small>
                              {say("الخطوة التالية", "YOUR NEXT STEP")}
                            </small>
                            <p>
                              {revision === 2
                                ? say(
                                    "راجع عرضك اليوم بعد التحقق من الشحن وحدّ السعر المقبول. لا خفض تلقائي.",
                                    "Review your offer today after checking delivery terms and your price floor. No automatic discount.",
                                  )
                                : t(event.next)}
                            </p>
                          </div>
                          <button
                            className="nx-primary"
                            onClick={() => recordChoice("accepted")}
                          >
                            {say("راجع وسجّل قرارك", "Review & record")}
                            <Arrow size={16} />
                          </button>
                        </div>
                      </article>
                      <div className="nx-below-grid">
                        <section className="nx-card nx-evidence">
                          <div className="nx-section-head">
                            <div>
                              <span className="nx-eyebrow">
                                EVIDENCE, NOT JUST AN ANSWER
                              </span>
                              <h3>
                                {say(
                                  "ليش وصلنا لهالقرار؟",
                                  "Why this decision?",
                                )}
                              </h3>
                            </div>
                            <ShieldCheck size={20} />
                          </div>
                          <p className="nx-small">
                            {say(
                              "أدلة السيناريو وتفسيرها. ليست ملاحظات حيّة عن السوق.",
                              "Scenario evidence and its interpretation. These are not live market observations.",
                            )}
                          </p>
                          <div className="nx-evidence-columns">
                            <div>
                              <h4>
                                <span className="nx-evidence-plus">+</span>
                                {say("ما يدعم القرار", "The supporting case")}
                              </h4>
                              {event.observations
                                .filter((o) => o.stance === "for")
                                .map((o) => (
                                  <EvidenceRow
                                    key={o.id}
                                    observation={o}
                                    lang={lang}
                                  />
                                ))}
                              {!event.observations.some(
                                (o) => o.stance === "for",
                              ) && (
                                <p>
                                  {say(
                                    "لا يوجد دليل كافٍ يدعم إجراءً.",
                                    "No sufficient evidence supports an action.",
                                  )}
                                </p>
                              )}
                            </div>
                            <div>
                              <h4>
                                <span className="nx-evidence-minus">−</span>
                                {say(
                                  "أقوى حجة ضدّه",
                                  "The strongest counter-case",
                                )}
                              </h4>
                              <p className="nx-counter-text">
                                {t(event.against)}
                              </p>
                              {event.observations
                                .filter((o) => o.stance === "against")
                                .map((o) => (
                                  <EvidenceRow
                                    key={o.id}
                                    observation={o}
                                    lang={lang}
                                  />
                                ))}
                            </div>
                          </div>
                          {revision === 2 && (
                            <div className="nx-update-note">
                              {say(
                                "تحديث تجريبي v2: توفر المخزون ومنافس ثانٍ غيّرا الموقف. الملاحظات السابقة باقية كتاريخ، وليست وصفًا للحالة الجديدة.",
                                "Simulated v2: restock and a second mover changed the posture. Prior observations remain historical, not current-state evidence.",
                              )}
                            </div>
                          )}
                          <details className="nx-details">
                            <summary>
                              {say("شو بعدنا ما منعرف؟", "What don’t we know?")}
                              <ChevronDown size={16} />
                            </summary>
                            <ul>
                              {event.unknowns.map((u, i) => (
                                <li key={i}>{t(u)}</li>
                              ))}
                            </ul>
                            <p>
                              {say(
                                "استنتاج: التوصية حكم قابل للمراجعة، مش حقيقة عن ربحك.",
                                "Inference: this recommendation is revisable judgment, not a fact about your profit.",
                              )}
                            </p>
                          </details>
                          <details className="nx-details">
                            <summary>
                              {say(
                                "سياق المنافس والتفسيرات البديلة",
                                "Entity context & alternative explanations",
                              )}
                              <ChevronDown size={16} />
                            </summary>
                            <p>{t(event.entity)}</p>
                            <ul>
                              {event.alternatives.map((a, i) => (
                                <li key={i}>{t(a)}</li>
                              ))}
                            </ul>
                          </details>
                        </section>
                        <div className="nx-watch-stack">
                          <section className="nx-card nx-tripwire">
                            <div className="nx-eyebrow">
                              <Eye size={17} />
                              {say("متابعة لها سبب", "A WATCH WITH A PURPOSE")}
                            </div>
                            <h3>
                              {say(
                                "شو ممكن يغيّر القرار؟",
                                "What would change the call?",
                              )}
                            </h3>
                            <p>{t(event.trigger)}</p>
                            <div className="nx-review">
                              <Clock3 size={17} />
                              <span>{t(event.review)}</span>
                            </div>
                            {event.id === "price-window" && (
                              <button
                                className="nx-simulate"
                                onClick={() => {
                                  setAdvanced(!advanced);
                                  setFilter("all");
                                  setPanel(null);
                                }}
                              >
                                <GitBranch size={17} />
                                {advanced
                                  ? say(
                                      "ارجع للملاحظة السابقة",
                                      "Reset to previous observation",
                                    )
                                  : say(
                                      "جرّب: المخزون رجع ومنافس لحقه",
                                      "Simulate: restock + second mover",
                                    )}
                                <Arrow size={15} />
                              </button>
                            )}
                            <small>
                              {say(
                                "محاكاة فقط. لا توجد متابعة آلية لهذا الحدث التجريبي.",
                                "Simulation only. This fictional event is not being monitored automatically.",
                              )}
                            </small>
                          </section>
                          <section className="nx-context-card">
                            <SlidersHorizontal size={20} />
                            <h3>
                              {say(
                                "معلومة منك قد تغيّر الجواب.",
                                "One fact from you may change the answer.",
                              )}
                            </h3>
                            <p>{t(event.question)}</p>
                            <button onClick={() => setPanel("context")}>
                              {say(
                                "أضف السياق المهم فقط",
                                "Add only what matters",
                              )}
                              <Arrow size={15} />
                            </button>
                          </section>
                        </div>
                      </div>
                      <section className="nx-card nx-history">
                        <div className="nx-section-head">
                          <h3>
                            {say("كيف وصلنا لهون؟", "How did we get here?")}
                          </h3>
                          <span className="nx-small">
                            {say(
                              "تاريخ تجريبي · ليس رصدًا حيًا",
                              "Illustrative history · not live monitoring",
                            )}
                          </span>
                        </div>
                        {event.history.length ? (
                          <div className="nx-timeline">
                            {[
                              ...event.history,
                              ...(revision === 2
                                ? [
                                    {
                                      time: "Day +1",
                                      title: copy(
                                        "تحقق شرط المراجعة",
                                        "Reopening trigger crossed",
                                      ),
                                      detail: copy(
                                        "ACT: راجع العرض. لم يُنفّذ أي تغيير.",
                                        "ACT: review the offer. No change executed.",
                                      ),
                                    },
                                  ]
                                : []),
                            ].map((h, i) => (
                              <div key={i}>
                                <span className="nx-timeline-dot" />
                                <small dir="ltr">{h.time}</small>
                                <h4>{t(h.title)}</h4>
                                <p>{t(h.detail)}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="nx-small">
                            {say(
                              "لا يوجد تاريخ كافٍ في هذا المثال. لن نخترع نمطًا.",
                              "No sufficient history in this example. We will not invent a pattern.",
                            )}
                          </p>
                        )}
                      </section>
                      <section className="nx-human">
                        <div>
                          <h3>
                            {say(
                              "اقتراحنا واضح. القرار إلك.",
                              "Our reasoning is open. The decision is yours.",
                            )}
                          </h3>
                          <p>
                            {say(
                              "الموافقة مش مقياس النجاح. القرار المفيد هو المهم.",
                              "Agreement is not the success metric. A useful decision is.",
                            )}
                          </p>
                        </div>
                        <div>
                          {(Object.keys(responses) as ResponseChoice[]).map(
                            (key) => (
                              <button
                                key={key}
                                onClick={() => recordChoice(key)}
                              >
                                {key === "accepted" && <Check size={15} />}{" "}
                                {t(responses[key])}
                              </button>
                            ),
                          )}
                          <button onClick={() => void share()}>
                            <FileText size={15} />
                            {say("انسخ الملخص", "Copy brief")}
                          </button>
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}
              <footer className="nx-footer">
                <span dir="ltr">
                  COANTO · Evidence → Intelligence → Decision
                </span>
                <button
                  onClick={() => {
                    setPanel("about");
                  }}
                >
                  {say(
                    "فرضية منتج قيد الاختبار",
                    "A product hypothesis under review",
                  )}
                </button>
              </footer>
            </>
          )}
        </main>
        {!live && revealed && (
          <button className="nx-ask-fab" onClick={() => setPanel("ask")}>
            <MessageCircle size={20} />
            <span>Ask COANTO</span>
            <span className="nx-fab-small">
              {say("عن هالقرار", "about this decision")}
            </span>
          </button>
        )}
      </div>
      {notice && (
        <div className="nx-toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
          <button aria-label="Dismiss" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {panel && (
        <Drawer
          title={
            panel === "ask"
              ? "Ask COANTO"
              : panel === "context"
                ? say("سياق يغيّر القرار", "Context that changes the call")
                : panel === "record"
                  ? say("شو قرارك؟", "What is your decision?")
                  : panel === "pilot"
                    ? say("سجل التجربة", "Decision notebook")
                    : say("عن المعاينة", "About the preview")
          }
          onClose={() => setPanel(null)}
        >
          {panel === "ask" && (
            <>
              <p className="nx-panel-note">
                {say(
                  "ردود تجريبية جاهزة ومربوطة بالحدث، وليست محادثة AI حيّة.",
                  "Prepared, event-grounded prototype replies. This is not a live AI chat.",
                )}
              </p>
              <div className="nx-ask-context">
                <State posture={posture} lang={lang} />
                <b>
                  {t(
                    revision === 2 && event.changedTitle
                      ? event.changedTitle
                      : event.title,
                  )}
                </b>
              </div>
              <div className="nx-ask-prompts">
                {(
                  [
                    ["why", copy("ليش هذا القرار؟", "Why this posture?")],
                    [
                      "counter",
                      copy("أقوى حجة ضدّه؟", "Strongest argument against?"),
                    ],
                    [
                      "change",
                      copy("شو بيغيّر الجواب؟", "What changes the answer?"),
                    ],
                    [
                      "uncertain",
                      copy("بشو أنت أقل تأكدًا؟", "What is least certain?"),
                    ],
                  ] as [AskTopic, Copy][]
                ).map(([topic, label]) => (
                  <button key={topic} onClick={() => ask(topic, t(label))}>
                    {t(label)}
                    <Arrow size={14} />
                  </button>
                ))}
              </div>
              <div className="nx-messages" aria-live="polite">
                {messages.map((m, i) => (
                  <div key={i}>
                    <div className="nx-question">{m.question}</div>
                    <div className="nx-answer">
                      <span className="nx-eyebrow">COANTO · DEMO</span>
                      <p>{m.answer}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form
                className="nx-ask-input"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim()) ask(classifyQuestion(query), query.trim());
                }}
              >
                <input
                  aria-label={say("اسأل عن القرار", "Ask about the decision")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={500}
                  placeholder={say(
                    "اسأل عن هالقرار…",
                    "Ask about this decision…",
                  )}
                />
                <button
                  disabled={!query.trim()}
                  aria-label={say("إرسال السؤال", "Submit question")}
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          )}
          {panel === "context" && (
            <>
              <span className="nx-mode-label">
                {context.floor !== null || context.stock !== "unknown"
                  ? "SUPPLIED CONTEXT · DEMO"
                  : "EXTERNAL EVIDENCE · DEMO"}
              </span>
              <h3>{t(event.question)}</h3>
              <p>
                {say(
                  "ما في ربط مع متجرك هنا. المعلومات التي تدخلها تُستخدم في سيناريو هذه الجلسة فقط.",
                  "No store connection here. Your inputs apply only to this session’s scenario.",
                )}
              </p>
              {event.id === "price-window" ? (
                <>
                  <label htmlFor="nx-floor">
                    {say(
                      "أقل سعر بيع مقبول ($) — اختياري",
                      "Minimum acceptable selling price ($) — optional",
                    )}
                  </label>
                  <input
                    id="nx-floor"
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    value={context.floor ?? ""}
                    onChange={(e) =>
                      setContext((old) => ({
                        ...old,
                        floor:
                          e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                  />
                  <label htmlFor="nx-stock">
                    {say(
                      "مخزونك لهذا المنتج",
                      "Your inventory for this product",
                    )}
                  </label>
                  <select
                    id="nx-stock"
                    value={context.stock}
                    onChange={(e) =>
                      setContext((old) => ({
                        ...old,
                        stock: e.target.value as Context["stock"],
                      }))
                    }
                  >
                    <option value="unknown">
                      {say(
                        "لا أعرف / لا أريد الإضافة",
                        "Unknown / prefer not to say",
                      )}
                    </option>
                    <option value="available">
                      {say("متوفر", "Available")}
                    </option>
                    <option value="limited">{say("محدود", "Limited")}</option>
                  </select>
                  <Scenario context={context} lang={lang} />
                  {context.stock === "limited" && (
                    <div className="nx-update-note">
                      {say(
                        "مخزونك محدود حسب إدخالك. هذا يزيد سبب الحذر من تحفيز طلب لا تستطيع تلبيته؛ لا يثبت حجم الطلب.",
                        "You report limited stock. This adds a reason to avoid stimulating demand you cannot fulfill; it does not establish demand volume.",
                      )}
                    </div>
                  )}
                  <button
                    className="nx-secondary"
                    onClick={() =>
                      setContext({ floor: null, stock: "unknown" })
                    }
                  >
                    <RotateCcw size={15} />
                    {say("امسح السياق", "Clear context")}
                  </button>
                </>
              ) : (
                <div className="nx-panel-note">
                  {say(
                    "لهذا الحدث، السياق المطلوب وصفي. سجّل جوابك في سبب القرار؛ لا نحوّل الجواب وحده إلى دليل سوقي أو حكم قانوني.",
                    "This event needs qualitative context. Record it in your decision reason; an answer alone is not market evidence or a legal conclusion.",
                  )}
                </div>
              )}
              <div className="nx-mode-comparison">
                <b>External → Connected</b>
                <p>
                  {say(
                    "من الخارج: نثبت ما ظهر ونوضح المجهول. مع سياقك: نفحص القيود. تحديد الربح أو السعر الأمثل يحتاج بيانات أكثر واختبارًا.",
                    "External: establish observations and unknowns. With your context: check constraints. Profit or optimal-price claims need more data and validation.",
                  )}
                </p>
              </div>
            </>
          )}
          {panel === "record" && (
            <>
              <div className="nx-panel-note">
                {say(
                  "سجل تجريبي محلي. لا يرسل تعليمات لمتجرك ولا يدرّب AI.",
                  "Local prototype record. It does not instruct your store or train AI.",
                )}
              </div>
              <div className="nx-choice-row">
                {(Object.keys(responses) as ResponseChoice[]).map((key) => (
                  <button
                    className={choice === key ? "active" : ""}
                    key={key}
                    onClick={() => setChoice(key)}
                  >
                    {t(responses[key])}
                  </button>
                ))}
              </div>
              <label htmlFor="nx-reason">
                {choice === "modified"
                  ? say(
                      "شو بتغيّر بالخطوة، وليش؟",
                      "What would you change, and why?",
                    )
                  : say(
                      "ليش اخترت هذا الموقف؟",
                      "Why did you choose this response?",
                    )}
              </label>
              <textarea
                id="nx-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1500}
                required
              />
              <label htmlFor="nx-actual">
                {say(
                  "شو نفّذت فعلًا؟ (اختياري)",
                  "What did you actually do? (optional)",
                )}
              </label>
              <input
                id="nx-actual"
                value={actualAction}
                onChange={(e) => setActualAction(e.target.value)}
                maxLength={800}
              />
              <label htmlFor="nx-outcome">
                {say(
                  "شو لاحظت بعدها؟ (اختياري)",
                  "What did you observe afterward? (optional)",
                )}
              </label>
              <textarea
                id="nx-outcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                maxLength={1500}
              />
              <p className="nx-small">
                {say(
                  "النتيجة التي تسجّلها ملاحظة منك، وليست إثباتًا أن COANTO سبّبتها.",
                  "An outcome you record is your observation, not proof that COANTO caused it.",
                )}
              </p>
              <button
                className="nx-primary"
                disabled={!reason.trim()}
                onClick={saveResponse}
              >
                {say("احفظ في سجل التجربة", "Save prototype record")}
                <Check size={16} />
              </button>
            </>
          )}
          {panel === "pilot" && (
            <>
              <p>
                {say(
                  "هنا تجرّب تسجيل القرار قبل COANTO وبعدها. البيانات محفوظة على هذا الجهاز فقط؛ ليست نتائج Pilot حقيقي.",
                  "Rehearse recording a decision before and after COANTO. Data stays on this device; these are not real pilot results.",
                )}
              </p>
              <button
                className="nx-primary"
                onClick={() => {
                  setPilot(true);
                  setBaseline({});
                  setPanel(null);
                  setLive(false);
                }}
              >
                {say("ابدأ تمرين قبل / بعد", "Start before / after rehearsal")}
                <Arrow size={16} />
              </button>
              <p className="nx-small">
                {say(
                  "أنت شاهدت بعض الأمثلة مسبقًا؛ هذا تمرين للآلية، وليس قياسًا غير متحيّز.",
                  "You may have already seen the examples; this rehearses the process, not an unbiased measurement.",
                )}
              </p>
              {!records.length ? (
                <div className="nx-empty">
                  <FileText size={30} />
                  <p>
                    {say(
                      "ما في قرارات مسجّلة بعد.",
                      "No decisions recorded yet.",
                    )}
                  </p>
                </div>
              ) : (
                records
                  .slice()
                  .reverse()
                  .map((r, i) => (
                    <div className="nx-record" key={`${r.time}:${i}`}>
                      <div>
                        <b dir="ltr">
                          {r.eventId} · v{r.revision}
                        </b>
                        <span>{t(responses[r.choice] ?? responses.wait)}</span>
                      </div>
                      <p>{r.reason}</p>
                      {r.baseline && (
                        <p>
                          <b>Before: </b>
                          {r.baseline}
                        </p>
                      )}
                      {r.actualAction && (
                        <p>
                          <b>{say("الإجراء: ", "Action: ")}</b>
                          {r.actualAction}
                        </p>
                      )}
                      {r.outcome && (
                        <p>
                          <b>
                            {say("ملاحظة المستخدم: ", "User observation: ")}
                          </b>
                          {r.outcome}
                        </p>
                      )}
                      <small>{new Date(r.time).toLocaleString(lang)}</small>
                    </div>
                  ))
              )}
              <div className="nx-button-row">
                <button
                  className="nx-secondary"
                  disabled={!records.length}
                  onClick={() =>
                    download(
                      JSON.stringify(
                        { mode: "DEMO", notValidation: true, records },
                        null,
                        2,
                      ),
                      "COANTO-DEMO-notebook.json",
                      "application/json",
                    )
                  }
                >
                  <Download size={15} />
                  {say("تنزيل السجل", "Export notebook")}
                </button>
                <button
                  className="nx-link"
                  disabled={!records.length}
                  onClick={() => {
                    setRecords([]);
                    setBaseline({});
                  }}
                >
                  {say("مسح السجل التجريبي", "Clear demo notebook")}
                </button>
              </div>
            </>
          )}
          {panel === "about" && (
            <>
              <span className="nx-eyebrow">R1 → R60 · POINT 3 OPEN</span>
              <h3>
                {say(
                  "تجربة لتشوف الفكرة وتختبر وضوحها.",
                  "A product you can inspect, not a claim of validation.",
                )}
              </h3>
              <p>
                {say(
                  "البحث الكامل قادنا لحدث يجمع التغيير والسياق والدليل، ثم يقترح موقفًا قابلًا للنقاش. العميل والدفع والعودة ما زالوا قيد الاختبار.",
                  "The full research led to an event that combines change, context and evidence, then proposes a contestable response. Buyer fit, payment and return use remain unvalidated.",
                )}
              </p>
              <div className="nx-about-block">
                <b>{say("ما يعمل في المعاينة", "Working in this preview")}</b>
                <p>
                  {say(
                    "تبديل الأحداث، الأدلة والمعارضة، تطور WATCH، حساب قيد السعر، Ask تجريبي، نسخ الملخص، وتسجيل قرارك محليًا.",
                    "Event selection, supporting/opposing evidence, WATCH evolution, price-floor arithmetic, prototype Ask, brief copying and local decision recording.",
                  )}
                </p>
              </div>
              <div className="nx-about-block">
                <b>{say("البيانات الحقيقية", "Real data")}</b>
                <p>
                  {say(
                    "مسار منفصل يعيد استخدام تسجيل الدخول والتحليل وسجل الأدلة الحالي. لا يوجد ربط متجر جديد، مراقبة شروط آلية أو تعلم نتائج مُنفّذ هنا.",
                    "A separate view reuses existing authentication, analysis and evidence history. No new store integration, automatic tripwire monitoring or outcome learning is implemented here.",
                  )}
                </p>
              </div>
              <div className="nx-about-block">
                <b>{say("العميل الذي نختبره", "Who we are testing")}</b>
                <p>
                  {say(
                    "A: متجر بمنتجات قابلة للمقارنة. C: علامة مع قنوات وموزّعين. كلاهما فرضية؛ تعلم DTC والنمو من المراحل السابقة باقٍ دون اعتباره الخيار المحسوم.",
                    "A: comparable-SKU retailer. C: brand with retailer channels. Both remain hypotheses; earlier DTC and growth learning is retained without treating that segment as settled.",
                  )}
                </p>
              </div>
              <div className="nx-about-block">
                <b>{say("قبل التوسّع", "Before scaling")}</b>
                <p>
                  {say(
                    "Shadow → Concierge → Real Company Pilot. نحتاج قرارًا حقيقيًا قبل وبعد، استخدامًا متكررًا والتزامًا ماليًا. جمال الديمو لا يثبت القيمة التجارية.",
                    "Shadow → Concierge → Real Company Pilot. We need real before/after decisions, repeated use and financial commitment. A polished demo does not prove commercial value.",
                  )}
                </p>
              </div>
              <a
                className="nx-secondary"
                href="/demo"
                target="_blank"
                rel="noreferrer"
              >
                {say(
                  "قارن بالنسخة الحالية",
                  "Compare with the existing version",
                )}
                <ExternalLink size={16} />
              </a>
            </>
          )}
        </Drawer>
      )}
    </div>
  );
}

function State({ posture, lang }: { posture: Posture; lang: Lang }) {
  return (
    <span className={`nx-state nx-${posture.toLowerCase()}`}>
      <span />
      {posture !== "INSUFFICIENT" && <b dir="ltr">{posture}</b>}
      {postureLabel[posture][lang]}
    </span>
  );
}
function EvidenceRow({
  observation: o,
  lang,
}: {
  observation: DecisionEvent["observations"][number];
  lang: Lang;
}) {
  return (
    <details className="nx-source">
      <summary>
        <span className="nx-source-id" dir="ltr">
          {o.id}
        </span>
        <span>
          {o.title[lang]}
          <small>
            {lang === "ar"
              ? o.kind === "context"
                ? "تفسير تجريبي · افتح التفاصيل"
                : "ملاحظة تجريبية · افتح المصدر"
              : o.kind === "context"
                ? "Demo inference · inspect reasoning"
                : "Demo observation · inspect source"}
          </small>
        </span>
        <Plus size={14} />
      </summary>
      <p>{o.detail[lang]}</p>
      <div className="nx-source-meta" dir="ltr">
        {o.group}
        <br />
        {o.time}
      </div>
      <small>
        {lang === "ar"
          ? "لا رابط حي لهذا المصدر الخيالي. تعدد الصفحات من نفس المتجر ليس استقلالًا في الأدلة."
          : "No live URL for this fictional source. Multiple pages from one seller are not independent evidence."}
      </small>
    </details>
  );
}
function OfferVisual({ lang, advanced }: { lang: Lang; advanced: boolean }) {
  const ar = lang === "ar";
  return (
    <>
      <div className="nx-product-scene">
        <div className="nx-machine" aria-hidden="true">
          <div className="nx-machine-body" />
          <div className="nx-machine-top" />
          <div className="nx-machine-dial" />
          <div className="nx-machine-face">
            <i />
            <i />
          </div>
          <div className="nx-machine-spout" />
          <div className="nx-cup" />
          <div className="nx-machine-base" />
        </div>
        <div>
          <small>{ar ? "نفس الموديل · مثال" : "EXACT MODEL · DEMO"}</small>
          <h3 dir="ltr">Brew One</h3>
          <span>{ar ? "ماكينة قهوة منزلية" : "Home espresso machine"}</span>
        </div>
      </div>
      <div className="nx-price-move" dir="ltr">
        <div>
          <small>{ar ? "قبل" : "BEFORE"}</small>
          <span>$200</span>
        </div>
        <ArrowRight size={22} />
        <div>
          <small>{ar ? "بعد" : "AFTER"}</small>
          <strong>$180</strong>
        </div>
      </div>
      <div className="nx-seller-lines">
        <div>
          <span>{ar ? "مدار" : "Madar"}</span>
          <b dir="ltr">$180</b>
          <span className={advanced ? "nx-stock-yes" : "nx-stock-no"}>
            {advanced
              ? ar
                ? "رجع للمخزون"
                : "Restocked"
              : ar
                ? "غير متوفر"
                : "Out of stock"}
          </span>
        </div>
        <div>
          <span>{ar ? "نواة" : "Nawa"}</span>
          <b dir="ltr">${advanced ? "180" : "200"}</b>
          <span>
            {advanced
              ? ar
                ? "لحق العرض"
                : "Followed"
              : ar
                ? "لم يتغيّر"
                : "Unchanged"}
          </span>
        </div>
      </div>
    </>
  );
}
function Scenario({ context, lang }: { context: Context; lang: Lang }) {
  const s = floorScenario(context.floor);
  return (
    <div className="nx-scenario">
      <b>
        {lang === "ar"
          ? "فحص قيد، مش توقع ربح"
          : "A constraint check, not a profit forecast"}
      </b>
      {s ? (
        <>
          <div dir="ltr">
            $180 {s.allowed ? "≥" : "<"} ${s.floor}
          </div>
          <p>
            {lang === "ar"
              ? s.allowed
                ? "السعر التجريبي يمرّ بحدّك الأدنى. هذا لا يعني أن التخفيض هو القرار الأفضل."
                : "السعر التجريبي أقل من الحد الذي أدخلته. لا تطابقه ضمن هذا القيد."
              : s.allowed
                ? "The illustrative price clears your floor. That does not make a discount the best decision."
                : "The illustrative price is below your floor. Do not match it under this constraint."}
          </p>
          <small>
            {lang === "ar"
              ? "الحساب: 180 ناقص الحد الذي أدخلته. السعر 180 تجريبي؛ الحد من إدخالك ولم يُتحقق منه."
              : "Calculation: 180 minus your entered floor. $180 is fictional; the floor is user-supplied and unverified."}
          </small>
        </>
      ) : (
        <p>
          {lang === "ar"
            ? "أدخل حدًا موجبًا من 1 إلى 10,000 لتفحص السيناريو. عدم إدخاله يبقي الأثر المالي مجهولًا."
            : "Enter a positive floor from 1 to 10,000 to inspect the scenario. Without it, the financial constraint remains unknown."}
        </p>
      )}
    </div>
  );
}
function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]',
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div className="nx-overlay" onClick={onClose}>
      <div
        ref={ref}
        className="nx-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nx-drawer-head">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close / إغلاق">
            <X size={22} />
          </button>
        </div>
        <div className="nx-drawer-content">{children}</div>
      </div>
    </div>
  );
}
function download(text: string, name: string, type: string) {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  URL.revokeObjectURL(u);
}
