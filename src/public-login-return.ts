/**
 * Only first-party Academy pages are eligible for a post-sign-in return.
 * This is UI navigation, never an authorization or account-linking decision.
 */
const permittedHosts = new Set([
  "skunkworksacademy.com", "www.skunkworksacademy.com",
  "microsoft.skunkworksacademy.com", "ibm.skunkworksacademy.com",
  "cisco.skunkworksacademy.com", "comptia.skunkworksacademy.com",
  "security.skunkworksacademy.com", "labs.skunkworksacademy.com",
  "docs.skunkworksacademy.com", "jobs.skunkworksacademy.com",
  "catalog.skunkworksacademy.com", "badging.skunkworksacademy.com",
  "forms.skunkworksacademy.com", "publish.skunkworksacademy.com",
  "blog.skunkworksacademy.com", "careers.skunkworksacademy.com",
  "portal.skunkworksacademy.com"
]);

export function publicReturnDestination(queryString: string): string | null {
  const requested = new URLSearchParams(queryString).get("returnTo");
  if (!requested || requested.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(requested)) return null;
  try {
    const target = new URL(requested);
    if (target.protocol !== "https:" || target.username || target.password || target.port) return null;
    if (!permittedHosts.has(target.hostname.toLowerCase())) return null;
    return target.href;
  } catch {
    return null;
  }
}
