/** Configuration presence only; this does not claim database connectivity. */
export function isLmsConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.LMS_COSMOS_ENDPOINT?.startsWith("https://")
    && env.LMS_COSMOS_DATABASE?.trim() && env.LMS_COSMOS_CONTAINER?.trim()
    && /^[a-zA-Z0-9_-]{1,100}$/.test(env.LMS_HOME_ORGANIZATION_ID ?? ""));
}
