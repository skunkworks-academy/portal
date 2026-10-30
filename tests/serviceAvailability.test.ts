import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { availableServices, loadingServices, PortalServiceNotice, resolveAvailability } from "../src/service-availability";
import type { PortalHealth } from "../src/types";

const healthy: PortalHealth = { ok: true, service: "Academy", missingSettings: [], allowedOrigins: [] };
const success = <T,>(value: T): PromiseFulfilledResult<T> => ({ status: "fulfilled", value });
const failed = (): PromiseRejectedResult => ({ status: "rejected", reason: new Error("Network unavailable") });

describe("Portal service loading and outage reporting", () => {
  it("counts an empty but successful catalogue as available, not unavailable", () => {
    expect(resolveAvailability([success(healthy), success([]), success([]), success([])])).toEqual(availableServices);
  });

  it("detects API health=false and independent downstream failures", () => {
    const result = resolveAvailability([success({ ...healthy, ok: false }), success([]), failed(), success([])]);
    expect(result.api).toBe("unavailable");
    expect(result.courses).toBe("unavailable");
    expect(result.classes).toBe("available");
  });

  it("renders actionable outage information without revealing exception details", () => {
    const html = renderToStaticMarkup(createElement(PortalServiceNotice, {
      services: { ...availableServices, courses: "unavailable" },
      onRetry: () => undefined
    }));
    expect(html).toContain("Course catalogue");
    expect(html).toContain("Retry services");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("Network unavailable");
  });

  it("has a separate loading state and no alert for healthy services", () => {
    const loading = renderToStaticMarkup(createElement(PortalServiceNotice, {
      services: loadingServices, onRetry: () => undefined
    }));
    expect(loading).toContain("Connecting to Academy services");
    expect(loading).toContain("disabled");
    const healthyHtml = renderToStaticMarkup(createElement(PortalServiceNotice, {
      services: availableServices, onRetry: () => undefined
    }));
    expect(healthyHtml).toBe("");
  });
});
