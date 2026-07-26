export const config = {
  entraTenantId: setting("ENTRA_TENANT_ID", "338a8916-80d9-467c-a94a-7f61d04ef7d5"),
  apiClientId: setting("API_CLIENT_ID", "e22672ae-61a6-434e-b135-3360557819ec"),
  apiClientSecret: setting("API_CLIENT_SECRET"),
  spaClientId: setting("SPA_CLIENT_ID", "e22672ae-61a6-434e-b135-3360557819ec"),
  graphTenantId: setting("GRAPH_TENANT_ID", "338a8916-80d9-467c-a94a-7f61d04ef7d5"),
  sharePointHostname: setting("SHAREPOINT_HOSTNAME", "skunkworksacademy.sharepoint.com"),
  sharePointSitePath: setting("SHAREPOINT_SITE_PATH", "/sites/InstructorPortal"),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,https://portal.skunkworksacademy.com,https://skunkworks-academy.github.io")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean)
};

export type ConfigKey = Exclude<keyof typeof config, "allowedOrigins">;

export function missingSettings(keys: ConfigKey[]) {
  return keys.filter((key) => !config[key]);
}

export function requireSettings(keys: ConfigKey[]) {
  const missing = missingSettings(keys);
  if (missing.length > 0) {
    throw new Error(`Missing required setting(s): ${missing.join(", ")}`);
  }
}

function setting(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}
