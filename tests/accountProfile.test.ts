import { describe, expect, it, vi } from "vitest";
import { AccountProfileController, profileDraftKey, type ProfileService } from "../src/account-profile";
import { accountPreferencesKey, defaultAccountPreferences, readAccountPreferences, saveAccountPreferences, validateAccountPreferences } from "../src/account-preferences";
import type { PortalProfile } from "../src/types";

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: key => values.get(key) ?? null, key: index => Array.from(values.keys())[index] ?? null, removeItem: key => { values.delete(key); }, setItem: (key, value) => { values.set(key, value); } };
}
const saved: PortalProfile = { id: "profile-1", objectId: "test-subject", displayName: "Test person", phone: "123", location: "Cape Town", bio: "Original", portalRole: "Staff", email: "test@example.invalid", cvFileName: "", updatedAt: "2026-11-05" };
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const service = (overrides: Partial<ProfileService> = {}): ProfileService => ({ load: vi.fn(async () => saved), save: vi.fn(async input => ({ ...saved, ...input })), ...overrides });

describe("own Academy profile persistence", () => {
  it("loads without writing and saves only editable fields with the stored role", async () => {
    const api = service(); const drafts = storage();
    const controller = new AccountProfileController("account-A", "Identity name", "Student", api, drafts);
    controller.start(); await tick();
    expect(api.save).not.toHaveBeenCalled();
    expect(controller.getSnapshot().fields.displayName).toBe("Test person");
    controller.edit("displayName", "New Academy name");
    controller.edit("bio", "New bio");
    await controller.save();
    expect(api.save).toHaveBeenCalledWith({ displayName: "New Academy name", phone: "123", location: "Cape Town", bio: "New bio", portalRole: "Staff" });
    expect(controller.getSnapshot().notice).toContain("saved to your Academy account");
    expect(controller.getSnapshot().dirty).toBe(false);
    expect(drafts.getItem(profileDraftKey("account-A"))).toBeNull();
  });

  it("retains a failed-save draft across remounts without claiming success", async () => {
    const drafts = storage(); const api = service({ save: vi.fn(async () => { throw new Error("SharePoint unavailable"); }) });
    const controller = new AccountProfileController("account-A", "Name", "Staff", api, drafts);
    controller.start(); await tick(); controller.edit("bio", "Do not lose these edits"); await controller.save();
    expect(controller.getSnapshot().error).toContain("could not be confirmed");
    expect(controller.getSnapshot().notice).toBe("");
    controller.dispose();
    const restored = new AccountProfileController("account-A", "Name", "Staff", service(), drafts);
    restored.start(); await tick();
    expect(restored.getSnapshot().fields.bio).toBe("Do not lose these edits");
    expect(restored.getSnapshot().dirty).toBe(true);
  });

  it("blocks writes after a failed load and preserves edits when retrying", async () => {
    const api = service({ load: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(saved) });
    const controller = new AccountProfileController("A", "Name", "Instructor", api, storage());
    controller.start(); await tick(); controller.edit("phone", "555"); await controller.save();
    expect(api.save).not.toHaveBeenCalled(); expect(controller.getSnapshot().ready).toBe(false);
    expect(controller.getSnapshot().error).toContain("could not be loaded");
    await controller.load();
    expect(controller.getSnapshot().fields.phone).toBe("555");
    expect(controller.getSnapshot().fields.bio).toBe(saved.bio);
    expect(controller.getSnapshot().fields.location).toBe(saved.location);
    expect(controller.getSnapshot().ready).toBe(true);
  });

  it("does not overwrite newer edits with a late profile load", async () => {
    let resolve!: (profile: PortalProfile) => void;
    const api = service({ load: () => new Promise(done => { resolve = done; }) });
    const controller = new AccountProfileController("A", "Name", "Staff", api, storage());
    controller.start(); controller.edit("location", "New location"); resolve(saved); await tick();
    expect(controller.getSnapshot().fields.location).toBe("New location");
    expect(controller.getSnapshot().fields.phone).toBe(saved.phone);
    expect(controller.getSnapshot().fields.bio).toBe(saved.bio);
    await controller.save();
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ location: "New location", phone: saved.phone, bio: saved.bio }));
  });

  it("keeps accounts isolated and ignores a previous account's late save", async () => {
    const drafts = storage(); let resolve!: (profile: PortalProfile) => void;
    const first = new AccountProfileController("A", "Name", "Staff", service({ save: () => new Promise(done => { resolve = done; }) }), drafts);
    first.start(); await tick(); first.edit("bio", "Account A draft"); const pending = first.save(); first.dispose();
    const second = new AccountProfileController("B", "Name B", "Student", service(), drafts);
    second.start(); await tick();
    resolve({ ...saved, bio: "Account A draft" }); await pending;
    expect(second.getSnapshot().fields.bio).toBe("Original");
    expect(second.getSnapshot().notice).toBe("");
    expect(drafts.getItem(profileDraftKey("A"))).toContain("Account A draft");
    expect(drafts.getItem(profileDraftKey("B"))).toBeNull();
  });

  it("does not report an empty/non-confirming response as a successful save", async () => {
    const controller = new AccountProfileController("A", "Name", "Staff", service({ save: vi.fn(async () => undefined as unknown as PortalProfile) }), storage());
    controller.start(); await tick(); controller.edit("bio", "Changes"); await controller.save();
    expect(controller.getSnapshot().dirty).toBe(true);
    expect(controller.getSnapshot().notice).toBe("");
    expect(controller.getSnapshot().error).toContain("could not be confirmed");
  });

  it("remains editable when draft storage is blocked and reports its actual scope", async () => {
    const blocked = storage(); blocked.setItem = () => { throw new Error("blocked"); };
    const controller = new AccountProfileController("A", "Name", "Staff", service(), blocked);
    controller.start(); await tick(); controller.edit("bio", "Still here");
    expect(controller.getSnapshot().fields.bio).toBe("Still here");
    expect(controller.getSnapshot().draftStored).toBe(false);
  });
});

describe("account-scoped browser preferences", () => {
  it("persists in the chosen storage, restores it and keeps accounts separate", () => {
    const session = storage(), local = storage();
    saveAccountPreferences("A", { version: 1, motion: "reduce" }, true, session, local);
    expect(readAccountPreferences("A", session, local)).toEqual({ preferences: { version: 1, motion: "reduce" }, remember: true });
    expect(readAccountPreferences("B", session, local)).toEqual({ preferences: defaultAccountPreferences, remember: false });
    saveAccountPreferences("A", { version: 1, motion: "system" }, false, session, local);
    expect(local.getItem(accountPreferencesKey("A"))).toBeNull();
    expect(readAccountPreferences("A", session, local)).toEqual({ preferences: defaultAccountPreferences, remember: false });
    expect(readAccountPreferences("A", storage(), local).preferences).toEqual(defaultAccountPreferences);
  });

  it("rejects arbitrary values and reports storage failures instead of a save result", () => {
    expect(validateAccountPreferences({ version: 1, motion: "<script>" })).toBeNull();
    const blocked = storage(); blocked.setItem = () => { throw new Error("blocked"); };
    expect(() => saveAccountPreferences("A", { version: 1, motion: "reduce" }, true, storage(), blocked)).toThrow("blocked");
    expect(() => saveAccountPreferences("A", defaultAccountPreferences, true, undefined, undefined)).toThrow("unavailable");
  });
});
