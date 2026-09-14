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
import { liveProjection } from "../src/lib/decision-experience/live-model";
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
assert.ok(
  answerQuestion(event, "why", "en", true, empty).includes(
    "not automatically cut",
  ),
);
assert.ok(
  answerQuestion(event, "other", "en", false, empty).includes(
    "does not contain evidence",
  ),
);
assert.ok(
  answerQuestion(event, "margin", "en", false, empty).includes(
    "cannot infer your profit",
  ),
);
for (const value of [null, NaN, Infinity, -2, 0, 0.5, 10001])
  assert.equal(floorScenario(value), null);
assert.equal(floorScenario(180)?.allowed, true);
assert.equal(floorScenario(190)?.allowed, false);
assert.equal(floorScenario(190)?.difference, -10);
for (const value of [
  "javascript:alert(1)",
  "data:text/html,test",
  "https://user:pass@example.com",
  "not a url",
])
  assert.equal(safeSourceUrl(value), null);
assert.equal(safeSourceUrl("https://example.com"), "https://example.com/");
for (const e of events) {
  assert.ok(e.against.en && e.unknowns.length && e.trigger.en && e.review.en);
  assert.ok(briefText(e, "ar", false, empty).includes("DEMO"));
}
assert.deepEqual(
  new Set(events.map((e) => e.posture)),
  new Set(["WATCH", "TEST", "IGNORE", "ACT", "INSUFFICIENT"]),
);
assert.deepEqual(
  liveProjection({
    signals: [
      {
        title: "Observation",
        description: "Interpretation",
        sourceUrls: ["javascript:alert(1)", "https://example.com"],
      },
    ],
  }).signals[0].sources,
  ["https://example.com/"],
);
assert.deepEqual(liveProjection(null).signals, []);
assert.equal(
  liveProjection({ metadata: { evidenceLedgerPersisted: "true" } }).saved,
  false,
);
// Regression boundary: new evidence reads must scope ownership BEFORE reading shared records.
const reader = readFileSync(
  "src/lib/decision-experience/live.functions.ts",
  "utf8",
);
assert.ok(
  reader.indexOf('.from("analyses")') <
    reader.indexOf('.from("coanto_evidence")'),
);
assert.ok(reader.match(/\.eq\("user_id", context\.userId\)/g)!.length === 2);
assert.ok(reader.includes("if (owned.error || !owned.data)"));
assert.ok(reader.includes('.in("id", ids)'));
console.log(
  "PASS: decision revisions, counter-evidence, abstention, price constraints, safe links, fixture provenance, live projection and tenant-read boundary.",
);
