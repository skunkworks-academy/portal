import { useEffect, useRef, useState, type ReactNode } from "react";
import "./portal-sidebar.css";

type AcademyLink = { label: string; url: string; description?: string };
type AcademyGroup = { label: string; description?: string; items: AcademyLink[] };

function canonicalGroups(): AcademyGroup[] {
  if (typeof window === "undefined") return [];
  const shell = (window as typeof window & { SKUNKWORKS_ACADEMY_SHELL?: { menuGroups?: unknown } }).SKUNKWORKS_ACADEMY_SHELL;
  if (!Array.isArray(shell?.menuGroups)) return [];
  return shell.menuGroups.flatMap((group: unknown) => {
    if (!group || typeof group !== "object") return [];
    const candidate = group as AcademyGroup;
    if (typeof candidate.label !== "string" || !Array.isArray(candidate.items)) return [];
    const items = candidate.items.filter(item => {
      if (!item || typeof item.label !== "string" || typeof item.url !== "string") return false;
      try { return ["https:", "http:"].includes(new URL(item.url, window.location.origin).protocol); } catch { return false; }
    });
    return items.length ? [{ ...candidate, items }] : [];
  });
}

/** Read the canonical shell catalogue; never maintain a second set of destinations. */
export function PortalSidebarNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const [groups, setGroups] = useState(canonicalGroups);
  useEffect(() => {
    const sync = () => setGroups(canonicalGroups());
    sync();
    window.addEventListener("skunkworksacademy:navigation-ready", sync);
    return () => window.removeEventListener("skunkworksacademy:navigation-ready", sync);
  }, []);
  return <nav className="portal-canonical-navigation" aria-label="Academy destinations">
    <p>ACADEMY DESTINATIONS</p>
    {groups.length ? groups.map(group => <details key={group.label}>
      <summary>{group.label}</summary>
      <ul>{group.items.map(item => <li key={item.url + item.label}><a href={item.url} onClick={onNavigate}>{item.label}</a></li>)}</ul>
    </details>) : <a href="https://skunkworksacademy.com/">Browse the Academy website</a>}
  </nav>;
}

/** The canonical top hamburger controls the currently mounted workspace sidebar. */
export function usePortalSidebar() {
  const [open, setOpen] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 921px)").matches);
  const trigger = useRef<HTMLElement | null>(null);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    const media = window.matchMedia("(min-width: 921px)");
    const resize = () => setOpen(media.matches);
    const toggle = () => {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(current => !current);
    };
    window.addEventListener("skunkworksacademy:portal-menu-toggle", toggle);
    media.addEventListener("change", resize);
    return () => { window.removeEventListener("skunkworksacademy:portal-menu-toggle", toggle); media.removeEventListener("change", resize); };
  }, []);
  useEffect(() => {
    const body = document.body;
    body.dataset.portalWorkspace = "true";
    body.dataset.portalSidebarOpen = String(open);
    const notify = () => window.dispatchEvent(new CustomEvent("skunkworksacademy:portal-menu-state", { detail: { open } }));
    notify();
    window.addEventListener("skunkworksacademy:navigation-ready", notify);
    const escape = (event: KeyboardEvent) => {
      if (open && event.key === "Escape" && !event.defaultPrevented && !window.matchMedia("(min-width: 921px)").matches) { event.preventDefault(); close(); }
    };
    window.addEventListener("keydown", escape);
    if (open && !window.matchMedia("(min-width: 921px)").matches) {
      document.querySelector<HTMLElement>("#academy-portal-sidebar a, #academy-portal-sidebar button, #academy-portal-sidebar summary")?.focus({ preventScroll: true });
    }
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("skunkworksacademy:navigation-ready", notify);
      delete body.dataset.portalWorkspace;
      delete body.dataset.portalSidebarOpen;
    };
  }, [open]);
  return { open, close, toggle: () => setOpen(value => !value) };
}

export function PortalAccountLayout({ children }: { children: ReactNode }) {
  const sidebar = usePortalSidebar();
  return <div className="portal-account-layout">
    <button className="portal-sidebar-fallback-toggle" type="button" onClick={sidebar.toggle} aria-controls="academy-portal-sidebar" aria-expanded={sidebar.open}>Account navigation</button>
    {sidebar.open && <button className="portal-sidebar-overlay" type="button" onClick={sidebar.close} aria-label="Close account navigation" />}
    <aside id="academy-portal-sidebar" className={sidebar.open ? "portal-account-sidebar is-open" : "portal-account-sidebar"} aria-label="Portal account navigation">
      <a href="/">Back to workspace</a>
      <a href="/?account=profile">Profile</a>
      <a href="/?account=settings">Settings</a>
      <PortalSidebarNavigation onNavigate={sidebar.close} />
    </aside>
    {children}
  </div>;
}
