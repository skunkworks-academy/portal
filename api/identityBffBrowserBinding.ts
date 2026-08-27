import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const cookieName = "__Host-swa_auth_tx";
const bindingContext = "swa-identity-bff-browser-binding-v1:";

function keyFromBase64(encodedKey: string) {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("Identity browser-binding key must decode to exactly 32 bytes.");
  return key;
}

function constantTimeEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left, "utf8").digest();
  const rightHash = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function browserBindingForState(state: string, encodedKey: string) {
  return createHmac("sha256", keyFromBase64(encodedKey))
    .update(`${bindingContext}${state}`, "utf8")
    .digest("base64url");
}

export function verifyBrowserBinding(state: string, binding: string | undefined, encodedKey: string) {
  if (!binding) return false;
  return constantTimeEqual(binding, browserBindingForState(state, encodedKey));
}

export function serializeBrowserBindingCookie(binding: string, maxAgeSeconds: number) {
  return `${cookieName}=${binding}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; Secure; HttpOnly; SameSite=Lax`;
}

export function clearBrowserBindingCookie() {
  return `${cookieName}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}

export function readBrowserBindingCookie(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === cookieName) return rest.join("=") || undefined;
  }
  return undefined;
}
