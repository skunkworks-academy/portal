export type AccountUiPreferences = { version: 1; motion: "system" | "reduce" };
export const defaultAccountPreferences: AccountUiPreferences = { version: 1, motion: "system" };
export const accountPreferencesEvent = "skunkworksacademy:portal-preferences-change";
export const accountPreferencesKey = (accountId: string) => "academy:account-ui:v1:" + encodeURIComponent(accountId);

export function validateAccountPreferences(input: unknown): AccountUiPreferences | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  return value.version === 1 && (value.motion === "system" || value.motion === "reduce")
    ? { version: 1, motion: value.motion } : null;
}

export function readAccountPreferences(accountId: string, session?: Storage, local?: Storage) {
  try {
    const key = accountPreferencesKey(accountId);
    const temporary = session?.getItem(key);
    const durable = local?.getItem(key);
    const raw = temporary ?? durable;
    const preferences = raw ? validateAccountPreferences(JSON.parse(raw)) : null;
    return { preferences: preferences ?? defaultAccountPreferences, remember: Boolean(!temporary && durable) };
  } catch { return { preferences: defaultAccountPreferences, remember: false }; }
}

export function saveAccountPreferences(accountId: string, preferences: AccountUiPreferences, remember: boolean, session?: Storage, local?: Storage) {
  const valid = validateAccountPreferences(preferences);
  if (!valid) throw new Error("Unsupported motion preference");
  const target = remember ? local : session;
  const other = remember ? session : local;
  if (!target || !other) throw new Error("Browser storage is unavailable");
  const key = accountPreferencesKey(accountId);
  target.setItem(key, JSON.stringify(valid));
  other.removeItem(key);
  if (target.getItem(key) !== JSON.stringify(valid)) throw new Error("Browser did not retain the preference");
}

export function browserStorage(kind: "sessionStorage" | "localStorage"): Storage | undefined {
  try { return window[kind]; } catch { return undefined; }
}
