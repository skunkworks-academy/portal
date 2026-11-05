export type SkunkiePreferences = { showAvatar: boolean; readReplies: boolean };
export const defaultSkunkiePreferences: SkunkiePreferences = { showAvatar: true, readReplies: false };
export function skunkiePreferenceKey(accountId: string) { return `academy:skunkie-ui:v1:${encodeURIComponent(accountId)}`; }
export function readSkunkiePreferences(accountId: string): SkunkiePreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(skunkiePreferenceKey(accountId)) || "null");
    if (value && typeof value === "object") {
      const p = value as Partial<SkunkiePreferences>;
      return { showAvatar: p.showAvatar !== false, readReplies: p.readReplies === true };
    }
  } catch { /* Storage can be disabled. The current session remains usable. */ }
  return { ...defaultSkunkiePreferences };
}
export function saveSkunkiePreferences(accountId: string, value: SkunkiePreferences) {
  try { localStorage.setItem(skunkiePreferenceKey(accountId), JSON.stringify(value)); return true; } catch { return false; }
}
