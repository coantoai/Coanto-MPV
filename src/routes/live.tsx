import { createFileRoute } from "@tanstack/react-router";
import { LiveProductExperience } from "@/components/decision-experience/LiveProductExperience";
import experienceCss from "@/components/decision-experience/experience.css?url";
import liveProductCss from "@/components/decision-experience/live-product.css?url";

function CoantoLiveE2E() {
  return (
    <main className="nx-shell" dir="rtl">
      <header className="nx-topbar">
        <a className="nx-brand" href="/live" aria-label="COANTO Live">
          COANTO
        </a>
        <div className="nx-mode-switch" aria-label="Live environment">
          <span className="nx-chip nx-chip-active">LIVE E2E</span>
          <a className="nx-chip" href="/next">R1–R60 Preview</a>
        </div>
      </header>
      <section className="nx-stage">
        <LiveProductExperience />
      </section>
    </main>
  );
}

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "COANTO — Live Decision Intelligence" },
      {
        name: "description",
        content: "COANTO live E2E: company, competitors, signals, evidence and a bounded decision in one visual flow.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      { rel: "stylesheet", href: experienceCss },
      { rel: "stylesheet", href: liveProductCss },
    ],
  }),
  component: CoantoLiveE2E,
});