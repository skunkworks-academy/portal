// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { NotificationBell } from "../src/NotificationBell";

const api = vi.hoisted(() => ({ classes: vi.fn(), myClasses: vi.fn(), contactEnquiries: vi.fn() }));
vi.mock("../src/api", () => ({ portalApi: api }));

it("loads registered events independently on account pages without requesting staff enquiries", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '<header><a class="swa-global-nav__brand">Academy</a></header><div id="root"></div>';
  api.classes.mockResolvedValue([{ id: "registered", title: "Azure class", schedule: "Tomorrow" }, { id: "other", title: "Other class" }, { id: "waitlist", title: "Waitlisted class" }, { id: "cancelled", title: "Cancelled class", status: "Cancelled" }, { id: "completed", title: "Completed class", status: "Complete" }]);
  api.myClasses.mockResolvedValue([{ classId: "registered", status: "Registered" }, { classId: "waitlist", status: "Waitlisted" }, { classId: "cancelled", status: "Registered" }, { classId: "completed", status: "Registered" }]);
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<NotificationBell auth={{ account: { homeAccountId: "learner" } } as any} isStaff={false} classes={[]} registrations={[]} loadEvents />));
    const bell = document.querySelector('button[aria-label="Notifications, 1 items"]') as HTMLButtonElement;
    expect(bell).not.toBeNull();
    await act(async () => bell.click());
    expect(document.body.textContent).toContain("Azure class");
    expect(document.body.textContent).not.toContain("Other class");
    expect(document.body.textContent).not.toContain("Cancelled class");
    expect(document.body.textContent).not.toContain("Completed class");
    expect(document.body.textContent).not.toContain("Waitlisted class");
    expect(api.contactEnquiries).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    document.body.innerHTML = "";
  }
});
