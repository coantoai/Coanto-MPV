import { createFileRoute } from "@tanstack/react-router";
import { LiveProductExperience } from "@/components/decision-experience/LiveProductExperience";
import experienceCss from "@/components/decision-experience/experience.css?url";
import liveProductCss from "@/components/decision-experience/live-product.css?url";

function CoantoLive() {
  return (
    <main className="nx-shell" dir="rtl">
      <header className="nx-topbar">
        <a className="nx-brand" href="/live" aria-label="COANTO">
          COANTO
        </a>
        <div className="nx-mode-switch" aria-label="COANTO product area">
          <span className="nx-chip nx-chip-active">تحليل المنافسة والقرار</span>
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
      { title: "COANTO — Competitive Decision Intelligence" },
      {
        name: "description",
        content: "COANTO turns company and competitor evidence into a clear, reviewable business decision.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      { rel: "stylesheet", href: experienceCss },
      { rel: "stylesheet", href: liveProductCss },
    ],
  }),
  component: CoantoLive,
});