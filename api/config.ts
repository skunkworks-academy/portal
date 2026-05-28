export const config = {
  entraTenantId: required("ENTRA_TENANT_ID", "972e8de4-e365-43a3-99ec-c86a0cc249e8"),
  apiClientId: required("API_CLIENT_ID"),
  apiClientSecret: required("API_CLIENT_SECRET"),
  spaClientId: required("SPA_CLIENT_ID"),
  graphTenantId: required("GRAPH_TENANT_ID", "972e8de4-e365-43a3-99ec-c86a0cc249e8"),
  sharePointHostname: required("SHAREPOINT_HOSTNAME"),
  sharePointSitePath: required("SHAREPOINT_SITE_PATH", "/sites/InstructorPortal"),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,https://portal.skunkworksacademy.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
};

function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required setting ${name}`);
  }
  return value;
}
