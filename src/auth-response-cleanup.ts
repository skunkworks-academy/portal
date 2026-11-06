const responseKeys = ["code", "client_info", "state", "session_state", "id_token", "access_token", "token_type", "expires_in", "scope", "error", "error_description", "error_uri", "correlation_id"];

/** Call only after MSAL has consumed the response, never before token exchange. */
export function cleanAuthResponseUrl(href: string): string {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  for (const params of [url.searchParams, fragment]) {
    if (!["code", "id_token", "access_token", "error"].some(key => params.has(key))) continue;
    for (const key of responseKeys) params.delete(key);
    if (params === fragment) url.hash = params.toString();
  }
  return url.href;
}

export function clearAuthResponseFromAddressBar(): void {
  const clean = cleanAuthResponseUrl(window.location.href);
  if (clean !== window.location.href) window.history.replaceState(window.history.state, "", clean);
}
