import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readText = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const readJson = <T>(path: string) => JSON.parse(readText(path)) as T;

interface EntraContract {
  tenantId: string;
  application: {
    appId: string;
    applicationIdUri: string;
    delegatedScope: string;
    spaRedirectUris: string[];
    appRoles: string[];
  };
}

interface EntraManifest {
  appId: string;
  identifierUris?: string[];
  spa: { redirectUris: string[] };
  web: {
    implicitGrantSettings: {
      enableAccessTokenIssuance: boolean;
      enableIdTokenIssuance: boolean;
    };
  };
  appRoles?: Array<{ value: string; allowedMemberTypes: string[] }>;
  requiredResourceAccess?: Array<{
    resourceAppId: string;
    resourceAccess: Array<{ id: string; type: string }>;
  }>;
}

describe("Microsoft Entra identity contract", () => {
  const contract = readJson<EntraContract>("azure/portal-entra-contract.json");
  const apiManifest = readJson<EntraManifest>("azure/portal-api-app-manifest.json");
  const spaManifest = readJson<EntraManifest>("azure/portal-spa-app-manifest.json");

  it("keeps both checked-in manifests on the production application", () => {
    expect(apiManifest.appId).toBe(contract.application.appId);
    expect(spaManifest.appId).toBe(contract.application.appId);
    expect(apiManifest.identifierUris).toEqual([contract.application.applicationIdUri]);
    expect(new Set(apiManifest.spa.redirectUris)).toEqual(new Set(contract.application.spaRedirectUris));
    expect(new Set(spaManifest.spa.redirectUris)).toEqual(new Set(contract.application.spaRedirectUris));
  });

  it("uses authorization code with PKCE instead of implicit grant", () => {
    for (const manifest of [apiManifest, spaManifest]) {
      expect(manifest.web.implicitGrantSettings.enableAccessTokenIssuance).toBe(false);
      expect(manifest.web.implicitGrantSettings.enableIdTokenIssuance).toBe(false);
    }
  });

  it("defines the complete portal role model with least-privilege member types", () => {
    const roles = apiManifest.appRoles ?? [];
    expect(new Set(roles.map((role) => role.value))).toEqual(new Set(contract.application.appRoles));

    for (const role of roles) {
      const expectedMemberType = role.value === "Portal.Automation" ? "Application" : "User";
      expect(role.allowedMemberTypes).toEqual([expectedMemberType]);
    }
  });

  it("requests User.Read and Sites.Selected from Microsoft Graph", () => {
    const graph = apiManifest.requiredResourceAccess?.find(
      (resource) => resource.resourceAppId === "00000003-0000-0000-c000-000000000000"
    );
    expect(graph?.resourceAccess).toContainEqual({
      id: "e1fe6dd8-ba31-4d61-89e7-88639da4683d",
      type: "Scope"
    });
    expect(graph?.resourceAccess).toContainEqual({
      id: "883ea226-0bf2-4a8f-9f9d-92c9162a727d",
      type: "Role"
    });
  });

  it("keeps runtime defaults aligned with the production tenant and app", () => {
    const runtimeFiles = [
      ".env.example",
      "src/authConfig.ts",
      "api/config.ts",
      "infra/main.bicep",
      ".github/workflows/pages.yml",
      ".github/workflows/deploy-azure-function.yml"
    ];

    for (const path of runtimeFiles) {
      const content = readText(path);
      expect(content, path).toContain(contract.tenantId);
      expect(content, path).toContain(contract.application.appId);
    }
  });
});
