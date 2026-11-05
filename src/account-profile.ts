import type { PortalProfile, PortalProfileInput, PortalRole } from "./types";

export type EditableProfile = Pick<PortalProfileInput, "displayName" | "phone" | "location" | "bio">;
export type ProfileService = {
  load: () => Promise<PortalProfile | null>;
  save: (input: PortalProfileInput) => Promise<PortalProfile>;
};
export type ProfileState = {
  fields: EditableProfile;
  loading: boolean;
  saving: boolean;
  ready: boolean;
  dirty: boolean;
  error: string;
  notice: string;
  draftStored: boolean;
};

export const profileDraftKey = (accountId: string) => "academy:profile-draft:v1:" + encodeURIComponent(accountId);
const roles: PortalRole[] = ["Student", "Instructor", "Staff"];

function fieldsFrom(value: unknown): EditableProfile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!["displayName", "phone", "location", "bio"].every(key => typeof record[key] === "string")) return null;
  return { displayName: record.displayName as string, phone: record.phone as string, location: record.location as string, bio: record.bio as string };
}

function confirmedProfile(value: unknown): value is PortalProfile {
  const profile = value as PortalProfile | null;
  return Boolean(fieldsFrom(value) && profile && typeof profile.id === "string" && profile.id && roles.includes(profile.portalRole));
}

/** Own-profile requests are injected so tests never contact the real account service. */
export class AccountProfileController {
  private state: ProfileState;
  private listeners = new Set<() => void>();
  private active = false;
  private generation = 0;
  private revision = 0;
  private serverRole: PortalRole;

  constructor(private accountId: string, name: string, role: PortalRole, private service: ProfileService, private storage?: Storage) {
    this.serverRole = role;
    let draft: EditableProfile | null = null;
    try {
      const raw = storage?.getItem(profileDraftKey(accountId));
      draft = raw ? fieldsFrom(JSON.parse(raw)) : null;
    } catch { /* An unavailable draft store must not block account access. */ }
    this.state = {
      fields: draft ?? { displayName: name, phone: "", location: "", bio: "" },
      loading: false, saving: false, ready: false, dirty: Boolean(draft), error: "",
      notice: draft ? "An unsaved draft was restored from this browser tab." : "",
      draftStored: Boolean(draft)
    };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<ProfileState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private rememberDraft(fields: EditableProfile): boolean {
    try {
      if (!this.storage) return false;
      this.storage.setItem(profileDraftKey(this.accountId), JSON.stringify(fields));
      return true;
    } catch { return false; }
  }
  start() { this.active = true; void this.load(); }
  dispose() { this.active = false; this.generation++; }

  edit(field: keyof EditableProfile, value: string) {
    const fields = { ...this.state.fields, [field]: value };
    this.revision++;
    this.update({ fields, dirty: true, error: "", notice: "", draftStored: this.rememberDraft(fields) });
  }

  async load() {
    const generation = ++this.generation;
    this.update({ loading: true, error: "" });
    try {
      const saved = await this.service.load();
      if (!this.active || generation !== this.generation) return;
      if (saved !== null && !confirmedProfile(saved)) throw new Error("Invalid profile response");
      if (saved) this.serverRole = saved.portalRole;
      this.update({ ready: true, fields: this.state.dirty ? this.state.fields : saved ? fieldsFrom(saved)! : this.state.fields });
    } catch {
      if (!this.active || generation !== this.generation) return;
      this.update({ ready: false, error: "Your saved profile could not be loaded. You can keep editing a draft; retry loading before saving to your Academy account." });
    } finally {
      if (this.active && generation === this.generation) this.update({ loading: false });
    }
  }

  async save() {
    if (!this.active || !this.state.ready || this.state.saving || this.state.loading) return;
    const fields = { ...this.state.fields, displayName: this.state.fields.displayName.trim() };
    if (!fields.displayName) { this.update({ error: "Enter a display name." }); return; }
    const generation = this.generation;
    const revision = this.revision;
    this.update({ saving: true, error: "", notice: "", draftStored: this.rememberDraft(fields) });
    try {
      const saved = await this.service.save({ ...fields, portalRole: this.serverRole });
      if (!this.active || generation !== this.generation) return;
      if (!confirmedProfile(saved) || Object.keys(fields).some(key => saved[key as keyof EditableProfile] !== fields[key as keyof EditableProfile])) {
        throw new Error("Profile service did not confirm the submitted fields");
      }
      this.serverRole = saved.portalRole;
      if (revision !== this.revision) {
        this.update({ notice: "Your earlier changes were saved. Newer edits are still an unsaved draft." });
        return;
      }
      let draftStored = false;
      try { this.storage?.removeItem(profileDraftKey(this.accountId)); } catch { draftStored = true; }
      this.update({ fields: fieldsFrom(saved)!, dirty: false, draftStored, notice: draftStored
        ? "Your profile was saved to your Academy account. This browser could not remove the older local draft."
        : "Your profile was saved to your Academy account." });
    } catch {
      if (!this.active || generation !== this.generation) return;
      this.update({ error: "Your profile save could not be confirmed. Your edits are still here; retry when the profile service is available." });
    } finally {
      if (this.active && generation === this.generation) this.update({ saving: false });
    }
  }
}
