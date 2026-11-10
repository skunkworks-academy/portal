/** Public-page navigation only. Never pass these URLs to the OIDC/BFF callback. */
export const PUBLIC_RETURN_KEY = "swa.public-return.v1";
export const PUBLIC_RETURN_TTL = 30 * 60 * 1000;
const publicHosts = new Set([
  "skunkworksacademy.com", "www.skunkworksacademy.com",
  "microsoft.skunkworksacademy.com", "ibm.skunkworksacademy.com",
  "cisco.skunkworksacademy.com", "comptia.skunkworksacademy.com",
  "security.skunkworksacademy.com", "catalog.skunkworksacademy.com",
  "labs.skunkworksacademy.com", "docs.skunkworksacademy.com",
  "jobs.skunkworksacademy.com", "badging.skunkworksacademy.com",
  "blog.skunkworksacademy.com", "brand.skunkworksacademy.com"
]);
const sensitiveParameter = /^(?:code|state|access_token|id_token|refresh_token|token|session_state|client_info|error|error_description|returnto|redirect|redirect_uri|redirecturl|next|continue)$/i;
type ReturnStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function validatePublicReturnUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096 || !/^https:\/\//i.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const publicConnection = url.hostname === "portal.skunkworksacademy.com" && /^\/connections(?:\/|$)/.test(url.pathname);
    if (!publicHosts.has(url.hostname) && !publicConnection) return null;
    const path = decodeURIComponent(url.pathname);
    if (/[\\\u0000-\u001f\u007f]/u.test(path) || /^\/(?:auth|oauth|login|logout|signin|sign-in|signout|sign-out|callback|api|\.auth)(?:\/|$)/i.test(path)) return null;
    for (const key of url.searchParams.keys()) if (sensitiveParameter.test(key)) return null;
    // Preserve ordinary page anchors, never OAuth fragments or nested redirects.
    const fragment = decodeURIComponent(url.hash.slice(1));
    if (/[\u0000-\u001f\u007f]/u.test(fragment)) return null;
    for (const key of new URLSearchParams(fragment.replace(/^\?/, "")).keys()) if (sensitiveParameter.test(key)) return null;
    if (/(?:^|[?&#])(?:code|state|access_token|id_token|refresh_token|token|returnto|redirect|redirect_uri|next)=/i.test(fragment)) return null;
    return url.href;
  } catch { return null; }
}

export function clearPublicReturn(storage: ReturnStorage | null): void {
  try { storage?.removeItem(PUBLIC_RETURN_KEY); } catch { /* Storage can be disabled. */ }
}

export function savePublicReturn(value: unknown, storage: ReturnStorage | null, now = Date.now()): string | null {
  clearPublicReturn(storage);
  const url = validatePublicReturnUrl(value);
  if (url) {
    try { storage?.setItem(PUBLIC_RETURN_KEY, JSON.stringify({ url, createdAt: now })); } catch { /* Current-page in-memory fallback remains usable. */ }
  }
  return url;
}

export function readPublicReturn(storage: ReturnStorage | null, now = Date.now()): string | null {
  try {
    const saved = JSON.parse(storage?.getItem(PUBLIC_RETURN_KEY) || "null");
    if (saved && typeof saved.createdAt === "number" && Number.isFinite(saved.createdAt) && saved.createdAt <= now && now - saved.createdAt < PUBLIC_RETURN_TTL) {
      const url = validatePublicReturnUrl(saved.url);
      if (url) return url;
    }
  } catch { /* Malformed or inaccessible storage is not an authentication failure. */ }
  clearPublicReturn(storage);
  return null;
}

/** Remove the navigation hint before MSAL records the login-request URL. */
export function capturePublicReturn(href: string, storage: ReturnStorage | null, now = Date.now()): { destination: string | null; cleanHref: string } {
  const entry = new URL(href);
  const values = entry.searchParams.getAll("returnTo");
  if (!values.length) return { destination: readPublicReturn(storage, now), cleanHref: href };
  const destination = savePublicReturn(values.length === 1 ? values[0] : null, storage, now);
  entry.searchParams.delete("returnTo");
  return { destination, cleanHref: entry.href };
}
