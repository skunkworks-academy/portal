// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalLanding } from "../src/landing-page";

describe("public Academy portal entry", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("offers a single branded home link and Microsoft sign-in before authentication", () => {
    act(() => root.render(<PortalLanding onSignIn={vi.fn()} />));

    const homeLinks = host.querySelectorAll<HTMLAnchorElement>("header a[href]");
    const home = Array.from(homeLinks).filter(link =>
      ["https://www.skunkworksacademy.com/", "https://skunkworksacademy.com/"].includes(link.href)
    );
    expect(home).toHaveLength(1);
    for (const colour of ["black", "white"]) {
      const url = `/images/academy-mark-${colour}.png`;
      expect(home[0].querySelector(`img[src="${url}"], source[srcset="${url}"]`)).not.toBeNull();
    }
    expect(host.querySelectorAll("h1")).toHaveLength(1);
    expect(host.querySelector("h1")?.textContent).toBe("Academy portal");
    expect(host.querySelector("button")?.textContent).toContain("Sign in with Microsoft");
    expect(host.querySelector('[aria-label="Primary portal navigation"]')).toBeNull();
  });

  it("announces redirect errors and allows one new sign-in attempt after a failure", async () => {
    const signIn = vi.fn()
      .mockRejectedValueOnce(new Error("Redirect unavailable"))
      .mockImplementationOnce(() => new Promise<void>(() => {}));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const notice = "Microsoft sign-in could not finish in this browser.";
    act(() => root.render(<PortalLanding onSignIn={signIn} startupNotice={notice} />));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(notice);

    const button = host.querySelector("button")!;
    await act(async () => { button.click(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Microsoft sign-in could not start");
    expect(button.disabled).toBe(false);

    act(() => button.click());
    expect(button.disabled).toBe(true);
    act(() => button.click());
    expect(signIn).toHaveBeenCalledTimes(2);
  });
});
