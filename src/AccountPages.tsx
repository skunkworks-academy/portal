import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { portalApi } from "./api";
import { AccountProfileController } from "./account-profile";
import { accountPreferencesEvent, browserStorage, readAccountPreferences, saveAccountPreferences, validateAccountPreferences, type AccountUiPreferences } from "./account-preferences";
import type { PortalRole, UserProfile } from "./types";
import "./account-pages.css";

export type AccountPagesProps = {
  page: "profile" | "settings";
  auth: { instance: IPublicClientApplication; account: AccountInfo };
  profile: UserProfile;
  activeRole: PortalRole;
};

/** Mount once for the active account, including on workspace views. */
export function AccountPreferences({ accountId }: { accountId: string | null }) {
  useEffect(() => {
    const root = document.documentElement;
    root.removeAttribute("data-portal-motion");
    if (!accountId) return;
    const apply = (preferences: AccountUiPreferences) => root.setAttribute("data-portal-motion", preferences.motion);
    const stored = () => apply(readAccountPreferences(accountId, browserStorage("sessionStorage"), browserStorage("localStorage")).preferences);
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const preferences = validateAccountPreferences(detail?.preferences);
      if (detail?.accountId === accountId && preferences) apply(preferences);
    };
    stored();
    window.addEventListener(accountPreferencesEvent, changed);
    window.addEventListener("storage", stored);
    return () => {
      root.removeAttribute("data-portal-motion");
      window.removeEventListener(accountPreferencesEvent, changed);
      window.removeEventListener("storage", stored);
    };
  }, [accountId]);
  return null;
}

export function AccountPages(props: AccountPagesProps) {
  return <main className="account-page" id="main">
    <a className="account-back" href="/">← Back to workspace</a>
    <header className="account-heading"><p>YOUR ACADEMY ACCOUNT</p><h1>{props.page === "profile" ? "Profile" : "Settings"}</h1><p>{props.profile.username}</p></header>
    <nav className="account-tabs" aria-label="Account pages">
      <a href="/?account=profile" aria-current={props.page === "profile" ? "page" : undefined}>Profile</a>
      <a href="/?account=settings" aria-current={props.page === "settings" ? "page" : undefined}>Settings</a>
    </nav>
    {props.page === "profile" ? <ProfileForm key={props.auth.account.homeAccountId} {...props} /> : <SettingsForm key={props.auth.account.homeAccountId} accountId={props.auth.account.homeAccountId} />}
  </main>;
}

function ProfileForm({ auth, profile, activeRole }: AccountPagesProps) {
  const controller = useMemo(() => new AccountProfileController(auth.account.homeAccountId, profile.name, activeRole, {
    load: () => portalApi.myProfile(auth),
    save: input => portalApi.updateProfile(input, auth)
  }, browserStorage("sessionStorage")), [auth.account.homeAccountId, auth.instance]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.start(); return () => controller.dispose(); }, [controller]);
  return <section className="account-panel" aria-labelledby="profile-details-title">
    <h2 id="profile-details-title">Academy profile</h2>
    <p>Your display name, contact details and bio are saved to your Academy profile. Your Microsoft identity and permissions are unchanged.</p>
    <p className="account-note">Microsoft sign-in: <strong>{profile.username}</strong> · Current workspace: <strong>{activeRole === "Student" ? "Learner" : activeRole}</strong></p>
    {state.error && <div className="account-error" role="alert"><p>{state.error}</p>{!state.ready && <button type="button" disabled={state.loading} onClick={() => void controller.load()}>{state.loading ? "Loading profile…" : "Retry loading profile"}</button>}</div>}
    <form onSubmit={event => { event.preventDefault(); void controller.save(); }} aria-busy={state.saving || state.loading}>
      <fieldset className="account-fields" disabled={state.saving}>
        <legend className="account-sr-only">Editable Academy profile details</legend>
        <label>Display name<input autoComplete="nickname" value={state.fields.displayName} required maxLength={200} onChange={event => controller.edit("displayName", event.target.value)} /></label>
        <label>Phone<input type="tel" autoComplete="tel" value={state.fields.phone} maxLength={80} onChange={event => controller.edit("phone", event.target.value)} /></label>
        <label>Location<input autoComplete="address-level2" value={state.fields.location} maxLength={200} onChange={event => controller.edit("location", event.target.value)} /></label>
        <label className="account-full">Bio<textarea rows={5} maxLength={4000} value={state.fields.bio} onChange={event => controller.edit("bio", event.target.value)} /></label>
      </fieldset>
      <p className="account-note">{state.dirty ? state.draftStored
        ? "Unsaved draft retained for this account in this browser tab. It survives a refresh and is not yet saved to your Academy account."
        : "Unsaved changes are on this page only. Browser draft storage is unavailable; keep this page open until you can save."
        : "Only Save profile sends these details to your Academy account."}</p>
      <button className="account-primary" type="submit" disabled={!state.ready || state.loading || state.saving || !state.dirty}>{state.saving ? "Saving profile…" : state.loading ? "Loading profile…" : "Save profile"}</button>
      <p className="account-status" role="status">{state.notice}</p>
    </form>
  </section>;
}

function SettingsForm({ accountId }: { accountId: string }) {
  const initial = useMemo(() => readAccountPreferences(accountId, browserStorage("sessionStorage"), browserStorage("localStorage")), [accountId]);
  const [motion, setMotion] = useState(initial.preferences.motion);
  const [remember, setRemember] = useState(initial.remember);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  function save() {
    const preferences: AccountUiPreferences = { version: 1, motion };
    setError(""); setNotice("");
    window.dispatchEvent(new CustomEvent(accountPreferencesEvent, { detail: { accountId, preferences } }));
    try {
      saveAccountPreferences(accountId, preferences, remember, browserStorage("sessionStorage"), browserStorage("localStorage"));
      setNotice(remember ? "Settings saved for this account on this browser. They are not synced to other devices." : "Settings saved for this account in this browser tab, including after a refresh. They expire when the tab session ends.");
    } catch {
      setError("The motion choice applies to this page, but browser storage could not confirm the save. Your selections remain here; try again before leaving.");
    }
  }
  return <section className="account-panel" aria-labelledby="account-settings-title">
    <h2 id="account-settings-title">Browser preferences</h2>
    <p>These preferences are kept separately for each signed-in account in this browser. They do not change your account permissions or your learning profile.</p>
    <form onSubmit={event => { event.preventDefault(); save(); }}>
      <label>Motion<select value={motion} onChange={event => { setMotion(event.target.value as AccountUiPreferences["motion"]); setNotice(""); }}><option value="system">Follow device preference</option><option value="reduce">Reduce portal animation</option></select></label>
      <p className="account-note">Your device's reduced-motion setting is always respected. Reduce portal animation also disables decorative animations such as Skunkie's floating button.</p>
      <label className="account-check"><input type="checkbox" checked={remember} onChange={event => { setRemember(event.target.checked); setNotice(""); }} />Remember on this browser after this tab closes</label>
      <p className="account-note">Leave this unchecked on a shared computer. Profile drafts are stored only in the tab session; this choice applies to motion preferences.</p>
      <button className="account-primary" type="submit">Save settings</button>
      {error && <p className="account-error" role="alert">{error}</p>}
      <p className="account-status" role="status">{notice}</p>
    </form>
    <aside className="account-note">Colour theme is managed by the existing <strong>Theme</strong> control in the Academy footer. It is a separate browser-wide choice.</aside>
  </section>;
}
