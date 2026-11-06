import { describe, expect, it } from "vitest";
import { isLmsConfigured } from "../api/lmsReadiness.js";

describe("LMS configuration presence", () => {
  const complete = { LMS_COSMOS_ENDPOINT: "https://academy.documents.azure.com", LMS_COSMOS_DATABASE: "academy", LMS_COSMOS_CONTAINER: "lms", LMS_HOME_ORGANIZATION_ID: "skunkworks-academy" };
  it("requires every setting and a valid organization partition", () => {
    expect(isLmsConfigured(complete)).toBe(true);
    for (const key of Object.keys(complete)) expect(isLmsConfigured({ ...complete, [key]: "" })).toBe(false);
    expect(isLmsConfigured({ ...complete, LMS_HOME_ORGANIZATION_ID: "invalid:partition" })).toBe(false);
    expect(isLmsConfigured({ ...complete, LMS_COSMOS_ENDPOINT: "http://insecure" })).toBe(false);
  });
});
