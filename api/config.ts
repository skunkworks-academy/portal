export const config = {
  entraTenantId: setting("ENTRA_TENANT_ID", "972e8de4-e365-43a3-99ec-c86a0cc249e8"),
  apiClientId: setting("API_CLIENT_ID"),
  apiClientSecret: setting("API_CLIENT_SECRET"),
  spaClientId: setting("SPA_CLIENT_ID"),
  graphTenantId: setting("GRAPH_TENANT_ID", "972e8de4-e365-43a3-99ec-c86a0cc249e8"),
  sharePointHostname: setting("SHAREPOINT_HOSTNAME"),
  sharePointSitePath: setting("SHAREPOINT_SITE_PATH", "/sites/InstructorPortal"),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,https://portal.skunkworksacademy.com")
    .split(",")
    .map((origin) => origin.trim())
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
