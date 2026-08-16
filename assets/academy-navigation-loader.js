/* Compatibility loader for legacy Skunkworks Academy navigation includes. */
(function () {
  "use strict";

  var VERSION = "2026.08.15.1";
  var canonicalUrl = "https://skunkworksacademy.com/assets/academy-navigation.js?v=" + VERSION;

  if (typeof document === "undefined") return;
  if (document.querySelector('script[data-skunkworks-global-nav="v10"]')) return;

  var script = document.createElement("script");
  script.defer = true;
  script.src = canonicalUrl;
  script.setAttribute("data-skunkworks-global-nav", "v10");
  (document.head || document.documentElement).appendChild(script);
})();
