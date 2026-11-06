export const SKUNKIE_BUDGET_POLICY = "student-usd1-gpt41mini-2025-04-14-v1";
export const SKUNKIE_MODEL_VERSION = "2025-04-14";
// Rounded UP from Azure's documented 1,047,576-token context. Reserving the
// entire context avoids relying on estimates of hidden chat framing tokens.
export const SKUNKIE_MAX_INPUT_TOKENS = 1_048_576;
export const SKUNKIE_MAX_OUTPUT_TOKENS = 900;

export function isSkunkieBudgetStorageConfigured(settings: Readonly<Record<string, string | undefined>>) {
  return Boolean(settings.LMS_COSMOS_ENDPOINT && settings.LMS_COSMOS_DATABASE && settings.LMS_COSMOS_CONTAINER && settings.LMS_HOME_ORGANIZATION_ID);
}

/** Configuration presence only; authenticated status also checks durable storage.
 * A provider credential alone must never activate an unmetered request path.
 */
export function isSkunkieConfigured(settings: Readonly<Record<string, string | undefined>>) {
  let validEndpoint = false;
  try {
    const endpoint = new URL(settings.AZURE_OPENAI_ENDPOINT || "");
    validEndpoint = endpoint.protocol === "https:" && endpoint.hostname.endsWith(".openai.azure.com") &&
      !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && endpoint.pathname === "/";
  } catch { /* Unconfigured provider. */ }
  return Boolean(validEndpoint && settings.AZURE_OPENAI_API_KEY?.trim() &&
    settings.AZURE_OPENAI_DEPLOYMENT?.trim() && settings.SKUNKIE_BUDGET_POLICY === SKUNKIE_BUDGET_POLICY &&
    isSkunkieBudgetStorageConfigured(settings));
}
