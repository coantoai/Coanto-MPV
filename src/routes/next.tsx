import { createFileRoute } from "@tanstack/react-router";
import { DecisionExperience } from "@/components/decision-experience/DecisionExperience";
import experienceCss from "@/components/decision-experience/experience.css?url";

export const Route = createFileRoute("/next")({
  head: () => ({
    meta: [
      { title: "COANTO — Decision Experience · R1–R60 Preview" },
      {
        name: "description",
        content:
          "A separate interactive preview: evidence, context and your next decision.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "stylesheet", href: experienceCss }],
  }),
  component: DecisionExperience,
});
