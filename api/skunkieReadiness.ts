/**
 * Provider readiness reports only whether required production settings exist.
 * It does not claim the remote model is reachable or that account billing/RBAC works.
 * Never return API keys, endpoints, or deployment identifiers to the browser.
 */
export function isSkunkieConfigured(settings: Readonly<Record<string, string | undefined>>) {
  return Boolean(
    settings.AZURE_OPENAI_ENDPOINT?.trim().startsWith("https://") &&
    settings.AZURE_OPENAI_API_KEY?.trim() &&
    settings.AZURE_OPENAI_DEPLOYMENT?.trim()
  );
}
