import { createFileRoute } from "@tanstack/react-router";
import { CompanyIntelligenceExperience } from "@/components/decision-experience/CompanyIntelligenceExperience";
import experienceCss from "@/components/decision-experience/experience.css?url";
import intelligenceCss from "@/components/decision-experience/company-intelligence.css?url";

export const Route = createFileRoute("/intelligence")({
  head: () => ({
    meta: [
      { title: "COANTO — Company Intelligence" },
      { name: "description", content: "Real company competitive intelligence: commercial observations, decision events, battlecards, gaps, and executive briefs." },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      { rel: "stylesheet", href: experienceCss },
      { rel: "stylesheet", href: intelligenceCss },
    ],
  }),
  component: CompanyIntelligenceExperience,
});
