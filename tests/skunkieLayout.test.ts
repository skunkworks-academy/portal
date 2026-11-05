// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const globalStyles = readFileSync(resolve("src/styles.css"), "utf8");
const componentStyles = ["learner-onboarding.css", "skunkie-companion.css"]
  .map(name => readFileSync(resolve("src", name), "utf8")).join("\n");
let style: HTMLStyleElement;
let host: HTMLDivElement;
afterEach(() => { style?.remove(); host?.remove(); });

describe("learner setup and companion styles with the shared portal form rules", () => {
  it.each([false, true])("keeps choice controls compact when shared styles load last: %s", sharedLast => {
    style = document.createElement("style");
    style.textContent = sharedLast ? componentStyles + globalStyles : globalStyles + componentStyles;
    document.head.append(style);
    host = document.createElement("div");
    host.innerHTML = '<section class="learner-onboarding"><label class="learner-onboarding__choice"><input type="radio" />Choice</label><label class="learner-onboarding__choice"><input type="checkbox" />Consent</label></section><aside class="skunkie"><div class="skunkie__voice-controls"><label><input type="checkbox" />Read replies aloud</label></div></aside>';
    document.body.append(host);
    for (const input of host.querySelectorAll(".learner-onboarding__choice input")) {
      const computed = getComputedStyle(input);
      expect(computed.width).toBe("18px"); expect(computed.height).toBe("18px");
      expect(computed.minHeight).toBe("18px"); expect(computed.padding).toBe("0px");
    }
    const voice = getComputedStyle(host.querySelector(".skunkie input")!);
    expect(voice.width).toBe("16px"); expect(voice.height).toBe("16px");
    expect(voice.minHeight).toBe("16px"); expect(voice.padding).toBe("0px");
  });

  it("keeps the accessible composer label out of the two-column grid flow", () => {
    style = document.createElement("style"); style.textContent = globalStyles + componentStyles; document.head.append(style);
    host = document.createElement("div");
    host.innerHTML = '<aside class="skunkie"><form class="skunkie__form"><label class="sr-only" for="layout-message">Ask Skunkie</label><textarea id="layout-message"></textarea><button>Send</button></form></aside>';
    document.body.append(host);
    const label = host.querySelector("label")!; const computed = getComputedStyle(label);
    expect(computed.position).toBe("absolute"); expect(computed.width).toBe("1px");
    expect(computed.height).toBe("1px"); expect(computed.overflow).toBe("hidden");
    expect(computed.display).not.toBe("none"); expect(computed.visibility).not.toBe("hidden");
    expect(host.querySelector("textarea")?.labels?.[0]).toBe(label);
  });
});
