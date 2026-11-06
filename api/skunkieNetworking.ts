import type { KnowledgeQuestion, LearningActivity, NetworkSkill } from "../src/skunkie/contracts.js";

export const networkSkills: NetworkSkill[] = ["addressing", "switching", "troubleshooting"];
// Original Academy practice, aligned to the existing Networking Basics catalogue.
// Answer keys remain in the API bundle, never the frontend.
const diagnostic = [
  { id: "net-address-v1", skill: "addressing", prompt: "Which host is on the same /24 subnet as 192.168.10.20?", options: ["192.168.11.20", "192.168.10.40", "192.168.20.10"], answer: 1 },
  { id: "net-switch-v1", skill: "switching", prompt: "What does an Ethernet switch normally use to forward a frame within a LAN?", options: ["Destination MAC address", "DNS name", "Website URL"], answer: 0 },
  { id: "net-trouble-v1", skill: "troubleshooting", prompt: "A host can reach a server by IP address but not by name. Which service should you investigate first?", options: ["Display settings", "Keyboard layout", "DNS"], answer: 2 }
] satisfies Array<KnowledgeQuestion & { answer: number }>;
const followups = {
  addressing: { id: "net-address-check-v1", skill: "addressing", prompt: "A host is 10.2.3.15/24. Which destination needs its default gateway?", options: ["10.2.3.16", "10.2.4.16", "10.2.3.20"], answer: 1 },
  switching: { id: "net-switch-check-v1", skill: "switching", prompt: "A switch has learned the destination MAC on port 4. Where does it forward a known unicast frame?", options: ["Only port 4", "All ports including the source", "Only the router port"], answer: 0 },
  troubleshooting: { id: "net-trouble-check-v1", skill: "troubleshooting", prompt: "An application works by IP but fails by hostname. Which is the most useful next check?", options: ["Replace the monitor", "Reinstall the keyboard", "Query the hostname with nslookup"], answer: 2 }
} satisfies Record<NetworkSkill, KnowledgeQuestion & { answer: number }>;
const publicQuestion = ({ answer: _answer, ...question }: KnowledgeQuestion & { answer: number }): KnowledgeQuestion => question;
export const networkingQuestions = () => diagnostic.map(publicQuestion);

export function gradeNetworking(answers: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw Error("Answer every diagnostic question.");
  const entries = Object.entries(answers);
  if (entries.length !== diagnostic.length || entries.some(([id, value]) => {
    const question = diagnostic.find(q => q.id === id);
    return !question || !Number.isInteger(value) || Number(value) < 0 || Number(value) >= question.options.length;
  })) throw Error("Answer every diagnostic question with a valid option.");
  const skillResults = Object.fromEntries(diagnostic.map(q => [q.skill, (answers as Record<string, number>)[q.id] === q.answer])) as Record<NetworkSkill, boolean>;
  return { skillResults, percent: Math.round(Object.values(skillResults).filter(Boolean).length / diagnostic.length * 100) };
}
export function gradeActivity(skill: NetworkSkill, answer: unknown) {
  if (!Number.isInteger(answer) || Number(answer) < 0 || Number(answer) >= followups[skill].options.length) throw Error("Choose a valid activity answer.");
  return answer === followups[skill].answer;
}
export function networkingActivity(skill: NetworkSkill, lessonId: string, minutes: number, approach: string): LearningActivity {
  const content = {
    addressing: { title: "Decide when a packet needs a gateway", explanation: "With a /24 mask, the first three octets identify the subnet. A host sends traffic for another subnet through a router, usually its default gateway.", steps: ["Write down 192.168.10.20/24 and 192.168.10.40/24. Compare their network portions.", "Now compare 192.168.10.20/24 with 192.168.11.40/24. Identify which journey needs a gateway.", "Sketch both journeys and label the host, switch and gateway."] },
    switching: { title: "Trace a frame through a LAN", explanation: "An Ethernet switch learns source MAC addresses and their ports. It forwards a known unicast frame toward the destination MAC's learned port. An unknown destination is flooded within the VLAN, excluding the incoming port.", steps: ["Sketch three hosts on switch ports 1, 2 and 4.", "Build a small table linking each host's MAC address to its switch port.", "Trace a known unicast frame from port 1 to the host on port 4, then consider an unknown destination."] },
    troubleshooting: { title: "Separate connectivity from name resolution", explanation: "A working connection by IP with a failing hostname points toward name resolution. Check the configured DNS server and query the hostname before changing unrelated settings. A failed ping alone does not prove a host is down; ICMP may be filtered.", steps: ["Use a fictional server at 192.0.2.10 with hostname training.example.", "Write down what successful IP access tells you and what it does not tell you.", "Describe how nslookup could distinguish a DNS problem from an application problem. Use only an approved lab for commands."] }
  }[skill];
  return { skill, ...content, steps: approach === "hands_on" ? content.steps : ["Read the explanation and work through the example slowly.", ...content.steps], lessonId, minutes, check: publicQuestion(followups[skill]) };
}
