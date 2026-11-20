import { validatePublicReturnUrl } from "../../src/public-return";

// Academy brand owns the colour/type system. Corporate theme supplies shell,
// radius, target-size and reduced-motion conventions, not a second logo system.
document.body.classList.add("swa-connections");
document.body.dataset.swaThemeScope = "isolated";
const main = document.getElementById("main");
if (main) main.dataset.swaContrast = "preserve";

function decorateSignIn(link) {
  if (!(link instanceof HTMLAnchorElement) || !/^sign[\s-]?in(?:\s+to\s+(?:the\s+)?(?:portal|skunkworks academy.*))?$/i.test(link.textContent.trim())) return;
  const target = new URL(link.href);
  if (target.origin !== "https://portal.skunkworksacademy.com" || target.pathname !== "/") return;
  const returnTo = validatePublicReturnUrl(window.location.href);
  if (!returnTo) return;
  target.searchParams.set("returnTo", returnTo);
  link.href = target.href;
  link.dataset.academySignIn = "true";
}
document.querySelectorAll('a[href]').forEach(decorateSignIn);
["click", "pointerdown", "focusin", "contextmenu"].forEach((type) => {
  document.addEventListener(type, (event) => {
    if (event.target instanceof Element) decorateSignIn(event.target.closest("a[href]"));
  }, true);
});

// The canonical runtime replaces the functional no-JavaScript fallback header.
// Hide/remove it only after the shared header actually exists, never on request.
const fallback = document.querySelector('header[data-fallback-header="true"]');
const observer = new MutationObserver(() => {
  if (!document.querySelector(".swa-global-nav")) return;
  fallback?.remove();
  document.body.classList.remove("menu-open");
  observer.disconnect();
});
observer.observe(document.body, { childList: true, subtree: true });
window.setTimeout(() => observer.disconnect(), 30000);

if (!document.querySelector('script[data-skunkworks-global-nav]')) {
  const script = document.createElement("script");
  script.src = "https://www.skunkworksacademy.com/assets/academy-navigation.js?v=2026.11.10.1";
  script.defer = true;
  script.dataset.skunkworksGlobalNav = "v9";
  script.referrerPolicy = "strict-origin-when-cross-origin";
  document.head.append(script);
}
