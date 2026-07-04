(function () {
  "use strict";

  var canonicalUrl = "https://skunkworksacademy.com/assets/academy-navigation.js?v=2026.07.04";
  var selector = 'script[data-skunkworks-global-nav="v3"]';
  var pages = [
    {
        "label":  "Jobs",
        "domain":  "jobs.skunkworksacademy.com",
        "url":  "https://jobs.skunkworksacademy.com/",
        "verified":  true
    },
    {
        "label":  "Security",
        "domain":  "security.skunkworksacademy.com",
        "url":  "https://security.skunkworksacademy.com/",
        "verified":  true
    },
    {
        "label":  "Home",
        "domain":  "skunkworksacademy.com",
        "url":  "https://skunkworksacademy.com/",
        "verified":  true
    },
    {
        "label":  "IBM",
        "domain":  "ibm.skunkworksacademy.com",
        "url":  "https://ibm.skunkworksacademy.com/",
        "verified":  true
    },
    {
        "label":  "Portal",
        "domain":  "portal.skunkworksacademy.com",
        "url":  "https://portal.skunkworksacademy.com/",
        "verified":  true
    },
    {
        "label":  "Labs",
        "domain":  "labs.skunkworksacademy.com",
        "url":  "https://labs.skunkworksacademy.com/",
        "verified":  true
    },
    {
        "label":  "Badging",
        "domain":  "badging.skunkworksacademy.com",
        "url":  "https://badging.skunkworksacademy.com/",
        "verified":  true
    },
    {
        "label":  "Media",
        "domain":  "media.skunkworksacademy.com",
        "url":  "https://media.skunkworksacademy.com/",
        "verified":  true
    },
    {
        "label":  "App",
        "domain":  "app.skunkworksacademy.com",
        "url":  "https://app.skunkworksacademy.com/",
        "verified":  true
    },
    {
        "label":  "Learn",
        "domain":  "learn.skunkworksacademy.com",
        "url":  "https://learn.skunkworksacademy.com/",
        "verified":  true
    },
    {
        "label":  "Prompt",
        "domain":  "prompt.skunkworksacademy.com",
        "url":  "https://prompt.skunkworksacademy.com/",
        "verified":  true
    }
];

  if (typeof window !== "undefined") {
    window.SKUNKWORKS_ACADEMY_NAVIGATION = {
      title: "Pages",
      statusLabel: "Verified domains",
      pages: pages
    };
  }

  if (typeof document === "undefined") return;
  if (document.querySelector(selector)) return;

  var script = document.createElement("script");
  script.defer = true;
  script.src = canonicalUrl;
  script.setAttribute("data-skunkworks-global-nav", "v3");

  (document.head || document.documentElement).appendChild(script);
})();