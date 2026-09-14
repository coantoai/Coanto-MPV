import { createFileRoute } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { LiveWorkspace } from "@/components/decision-experience/LiveWorkspace";
import experienceCss from "@/components/decision-experience/experience.css?url";

function CoantoLiveE2E() {
  function preserveLiveReturn(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest('a[href="/auth"]') as HTMLAnchorElement | null;
    if (!anchor) return;
    anchor.href = "/auth?next=/live";
  }

  return (
    <main className="nx-shell" dir="rtl" onClickCapture={preserveLiveReturn}>
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
        <div className="nx-kicker">EVIDENCE → INTELLIGENCE → DECISION</div>
        <LiveWorkspace lang="ar" />
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
        content: "Authenticated COANTO live E2E: real business context, real analysis and linked evidence.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "stylesheet", href: experienceCss }],
  }),
  component: CoantoLiveE2E,
});
