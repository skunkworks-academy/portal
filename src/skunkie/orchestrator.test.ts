import { describe, expect, it } from "vitest";
import { companionRegistry, routeLearningGoal } from "./orchestrator";

describe("Skunkie advisory routing", () => {
  it("routes a subnetting request to networking", () => {
    expect(routeLearningGoal("I need help with VLAN and subnet routing").companionId).toBe("networking");
  });
  it("routes a specific IBM system request", () => {
    expect(routeLearningGoal("I want to learn IBM Storage Scale").companionId).toBe("ibm");
  });
  it("does not mistake a substring for a skill", () => {
    expect(routeLearningGoal("cloudless").companionId).toBeNull();
  });
  it("falls back to assessment for unknown or conflicting requests", () => {
    expect(routeLearningGoal("").nextAction).toBe("assess");
    expect(routeLearningGoal("help with cloud and security").companionId).toBeNull();
  });
  it("registers unique specialist ids", () => {
    expect(new Set(companionRegistry.map((item) => item.id)).size).toBe(companionRegistry.length);
  });
});
