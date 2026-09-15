import { createFileRoute } from "@tanstack/react-router";
import { SingleCompanyExperience } from "@/components/decision-experience/SingleCompanyExperience";
import experienceCss from "@/components/decision-experience/experience.css?url";
import singleCompanyCss from "@/components/decision-experience/single-company.css?url";

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
      { rel: "stylesheet", href: singleCompanyCss },
    ],
  }),
  component: SingleCompanyExperience,
});