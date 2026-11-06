/**
 * Deterministic, advisory-only first stage of Skunkie's orchestration pipeline.
 * It never grants course access or invokes an AI/tool endpoint.
 */
export const companionRegistry = [
  { id: "networking", name: "Networking", keywords: ["network", "subnet", "routing", "router", "switch", "vlan", "cisco", "tcp", "ip address"] },
  { id: "cybersecurity", name: "Cybersecurity", keywords: ["security", "cyber", "soc", "siem", "incident", "forensic", "comptia", "pentest"] },
  { id: "artificial-intelligence", name: "AI & Data", keywords: ["machine learning", "artificial intelligence", "generative ai", "prompt", "data science", "neural", "llm"] },
  { id: "cloud", name: "Cloud", keywords: ["cloud", "azure", "aws", "gcp", "kubernetes", "container", "devops"] },
  { id: "ibm", name: "IBM Technologies", keywords: ["ibm", "aix", "power systems", "storage scale", "filenet", "maximo", "datapower"] },
  { id: "microsoft", name: "Microsoft Technologies", keywords: ["microsoft", "m365", "office 365", "entra", "power bi", "sharepoint"] }
] as const;

export type CompanionId = (typeof companionRegistry)[number]["id"];
export type RoutingDecision = {
  companionId: CompanionId | null;
  companionName: string | null;
  intent: "diagnostic" | "learning";
  nextAction: "assess" | "view-course-catalogue";
  explanation: string;
};

export function routeLearningGoal(goal: string): RoutingDecision {
  const input = goal.trim().toLowerCase();
  if (!input || input.length > 1000) {
    return { companionId: null, companionName: null, intent: "diagnostic", nextAction: "assess", explanation: "Start with a learner assessment to establish your goals and experience." };
  }
  const matches = companionRegistry.map((companion) => ({
    companion,
    score: companion.keywords.filter((keyword) => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(input);
    }).length
  })).sort((a, b) => b.score - a.score);
  const winner = matches[0];
  if (!winner || winner.score === 0 || (matches[1] && matches[1].score === winner.score)) {
    return { companionId: null, companionName: null, intent: "diagnostic", nextAction: "assess", explanation: "Let's assess your current skills before choosing a specialist." };
  }
  return {
    companionId: winner.companion.id,
    companionName: winner.companion.name,
    intent: "learning",
    nextAction: "view-course-catalogue",
    explanation: `Your goal aligns with ${winner.companion.name}. Explore approved Academy courses; enrolment still controls access to restricted content.`
  };
}
