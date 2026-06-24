export const config = {
  entraTenantId: setting("ENTRA_TENANT_ID", "972e8de4-e365-43a3-99ec-c86a0cc249e8"),
  // Default to the Skunkworks API app registration if no environment override is supplied
  apiClientId: setting("API_CLIENT_ID", "8b1e77b3-3017-4c54-8ab3-0e4864511b55"),
  apiClientSecret: setting("API_CLIENT_SECRET"),
  // Default to the Skunkworks SPA app registration if no environment override is supplied
  spaClientId: setting("SPA_CLIENT_ID", "21f093b0-e91a-4f62-ad71-2dee1e0cbc20"),
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
