import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { events } from "../src/lib/decision-experience/fixtures";
import {
  answerQuestion,
  briefText,
  effectivePosture,
  floorScenario,
  revisedEvent,
  safeSourceUrl,
} from "../src/lib/decision-experience/model";
import {
  answerLiveDecisionQuestion,
  deriveLiveDecision,
  liveProjection,
} from "../src/lib/decision-experience/live-model";

const event = events.find((e) => e.id === "price-window")!;
const empty = { floor: null, stock: "unknown" as const };
assert.equal(effectivePosture(event, false), "WATCH");
assert.equal(effectivePosture(event, true), "ACT");
const revision = revisedEvent(event, true);
assert.ok(revision.observations.some((e) => e.id === "A5"));
assert.ok(!revision.observations.some((e) => e.id === "A1"));
assert.ok(revision.observations.some((e) => e.stance === "against"));
assert.notEqual(revision.trigger.en, event.trigger.en);
assert.notEqual(revision.unknowns[0].en, event.unknowns[0].en);
const exported = briefText(event, "en", true, empty);
assert.ok(exported.includes("DEMO"));
assert.ok(exported.includes("A5"));
assert.ok(!exported.includes("When will the rival restock?"));
assert.ok(!exported.includes("Hold your price for now"));
assert.ok(answerQuestion(event, "why", "en", true, empty).includes("not automatically cut"));
assert.ok(answerQuestion(event, "other", "en", false, empty).includes("does not contain evidence"));
assert.ok(answerQuestion(event, "margin", "en", false, empty).includes("cannot infer your profit"));
for (const value of [null, NaN, Infinity, -2, 0, 0.5, 10001]) assert.equal(floorScenario(value), null);
assert.equal(floorScenario(180)?.allowed, true);
assert.equal(floorScenario(190)?.allowed, false);
assert.equal(floorScenario(190)?.difference, -10);
for (const value of ["javascript:alert(1)", "data:text/html,test", "https://user:pass@example.com", "not a url"]) assert.equal(safeSourceUrl(value), null);
assert.equal(safeSourceUrl("https://example.com"), "https://example.com/");
for (const e of events) {
  assert.ok(e.against.en && e.unknowns.length && e.trigger.en && e.review.en);
  assert.ok(briefText(e, "ar", false, empty).includes("DEMO"));
}
assert.deepEqual(new Set(events.map((e) => e.posture)), new Set(["WATCH", "TEST", "IGNORE", "ACT", "INSUFFICIENT"]));

assert.deepEqual(
  liveProjection({
    signals: [{ title: "Observation", description: "Interpretation", sourceUrls: ["javascript:alert(1)", "https://example.com"] }],
  }).signals[0].sources,
  ["https://example.com/"],
);
assert.deepEqual(liveProjection(null).signals, []);
assert.equal(liveProjection({ metadata: { evidenceLedgerPersisted: "true" } }).saved, false);

const promoted = deriveLiveDecision({
  metadata: { decisionSourceLinkageChecked: true },
  priorityMatrix: [{
    zone: "do-now",
    title: "Protect the current offer",
    reason: "A verified competitor changed the offer while your public position stayed unchanged.",
    sourceUrls: ["https://example.com/offer"],
    decisionEvidenceStatus: "linked",
    evidenceFor: ["Offer changed on the cited public page."],
    counterEvidence: ["Duration of the change is not yet known."],
    trigger: "Recheck when the competitor offer expires or your inventory constraint changes.",
    nextAction: "Review the offer before changing price.",
  }],
  unknowns: ["Competitor inventory is unknown."],
});
assert.equal(promoted.posture, "ACT");
assert.equal(promoted.candidatePosture, "ACT");
assert.equal(promoted.complete, true);
assert.deepEqual(promoted.sourceUrls, ["https://example.com/offer"]);
assert.ok(answerLiveDecisionQuestion(promoted, "ليش؟").includes("verified competitor"));
assert.ok(answerLiveDecisionQuestion(promoted, "شو ضد القرار؟").includes("Duration"));
assert.ok(answerLiveDecisionQuestion(promoted, "سؤال غير موجود").includes("لن أملأ الفراغ"));

const historicUngated = deriveLiveDecision({
  priorityMatrix: [{
    zone: "act",
    title: "Old recommendation",
    why: "Old model output contains a reason.",
    sourceUrls: ["https://example.com/offer"],
    evidenceFor: ["Old observation"],
    counterEvidence: ["Old counter case"],
    trigger: "Old trigger",
  }],
});
assert.equal(historicUngated.posture, "INSUFFICIENT");
assert.ok(historicUngated.promotionBlockedBy.includes("decision-source linkage gate"));

const blocked = deriveLiveDecision({
  metadata: { decisionSourceLinkageChecked: true },
  priority_matrix: [{
    zone: "test",
    title: "Try a reversible response",
    rationale: "The model sees a potentially material change.",
    sourceUrls: ["javascript:alert(1)"],
    decisionEvidenceStatus: "unlinked",
  }],
});
assert.equal(blocked.posture, "INSUFFICIENT");
assert.equal(blocked.candidatePosture, "TEST");
assert.ok(blocked.promotionBlockedBy.includes("verified decision-source linkage"));
assert.ok(blocked.promotionBlockedBy.includes("decision-linked source URLs"));

const reader = readFileSync("src/lib/decision-experience/live.functions.ts", "utf8");
assert.ok(reader.indexOf('.from("analyses")') < reader.indexOf('.from("coanto_evidence")'));
assert.ok(reader.match(/\.eq\("user_id", context\.userId\)/g)!.length === 2);
assert.ok(reader.includes("if (owned.error || !owned.data)"));
assert.ok(reader.includes('.in("id", ids)'));

// /live must use the customer-first visual experience while /next remains preserved.
const liveRoute = readFileSync("src/routes/live.tsx", "utf8");
const nextRoute = readFileSync("src/routes/next.tsx", "utf8");
const liveProduct = readFileSync("src/components/decision-experience/LiveProductExperience.tsx", "utf8");
const liveCss = readFileSync("src/components/decision-experience/live-product.css", "utf8");
assert.ok(liveRoute.includes('createFileRoute("/live")'));
assert.ok(liveRoute.includes("<LiveProductExperience />"));
assert.ok(liveRoute.includes("live-product.css?url"));
assert.ok(!liveRoute.includes("<LiveWorkspace"));
assert.ok(nextRoute.includes('createFileRoute("/next")'));
assert.ok(nextRoute.includes("DecisionExperience"));
assert.ok(!nextRoute.includes("LiveProductExperience"));
assert.ok(liveProduct.includes("من موقع الشركة إلى قرار واضح"));
assert.ok(liveProduct.includes("المشهد التنافسي"));
assert.ok(liveProduct.includes("الإشارات الأهم"));
assert.ok(liveProduct.includes("الدليل، الاعتراض، وما لا نعرفه"));
assert.ok(liveProduct.includes("answerLiveDecisionQuestion"));
assert.ok(liveProduct.includes("localStorage.setItem"));
assert.ok(liveProduct.includes("افتح تحليلًا سابقًا بدل استهلاك API جديد"));
assert.ok(liveCss.includes(".lp-competitor-grid"));
assert.ok(liveCss.includes(".lp-evidence-grid"));
assert.ok(liveCss.includes("@media (max-width: 680px)"));

const authRoute = readFileSync("src/routes/auth.tsx", "utf8");
const onboardingRoute = readFileSync("src/routes/onboarding.tsx", "utf8");
assert.ok(authRoute.includes("const RETURN_TO_KEY = 'coanto:return-to'"));
assert.ok(authRoute.includes("candidate.startsWith('/')"));
assert.ok(authRoute.includes("candidate.startsWith('//')"));
assert.ok(authRoute.includes("new URLSearchParams(window.location.search).get('next')"));
assert.ok(authRoute.includes("authCallbackUrl()"));
assert.ok(onboardingRoute.includes("consumeReturnTo()"));
assert.ok(onboardingRoute.includes("window.location.assign(destination)"));

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };
assert.equal(pkg.scripts?.typecheck, "vite build --mode development && tsc --noEmit");

console.log("PASS: preserved R1-R60 preview, customer-first visual live E2E, server-gated decisions, evidence/counter-evidence, safe links, tenant ownership and auth-return contract.");
