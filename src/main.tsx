import React from "react";
import ReactDOM from "react-dom/client";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { App } from "./App";
import { SkunkieCompanion } from "./SkunkieCompanion";
import { msalConfig } from "./authConfig";
import "./styles.css";
import "./academy-brand-theme.css";
import "./startup-fallback.css";
import "./instructor-account-navigation";
import "./staff-account-navigation";
import "./workspace-card-navigation";
import "./form-field-metadata";

// Load the Academy-wide menu only after Microsoft Entra has returned a valid account.
// This prevents a pre-auth navigation leak or flash of workspace links.
const academyNavigationUrl = "https://skunkworksacademy.com/assets/academy-navigation.js?v=2026.08.14.2";
const msalInstance = new PublicClientApplication(msalConfig);
const rootElement = document.getElementById("root");

function renderStartupError(error?: unknown) {
  if (!rootElement) return;
  rootElement.innerHTML = `
    <main class="portal-startup-fallback" id="main" tabindex="-1">
      <section class="portal-startup-card" role="alert">
        <p class="portal-startup-eyebrow">SKUNKWORKS ACADEMY · SECURE SIGN-IN</p>
        <h1>Microsoft sign-in could not start</h1>
        <p>Your browser could not initialise the secure sign-in session. Your account has not been changed.</p>
        <p>If you opened this page inside another app, use its menu to open
        <strong>portal.skunkworksacademy.com</strong> directly in Safari or Chrome.</p>
        <div class="portal-startup-actions">
          <button type="button" data-reload-page>Try again</button>
          <a href="mailto:training@skunkworks.africa?subject=Academy%20portal%20sign-in%20startup">Contact support</a>
        </div>
      </section>
    </main>`;
  console.error("Microsoft sign-in startup could not initialise", error);
  rootElement.querySelector<HTMLButtonElement>("[data-reload-page]")?.addEventListener("click", () => window.location.reload());
  rootElement.querySelector<HTMLElement>("#main")?.focus();
}

async function bootstrapPortal() {
  await msalInstance.initialize();
  // Authentication response errors are recoverable. Render the public sign-in
  // page so users can retry or open the portal in a full mobile browser.
  let redirectResult: Awaited<ReturnType<typeof msalInstance.handleRedirectPromise>> = null;
  let startupNotice = "";
  try {
    redirectResult = await msalInstance.handleRedirectPromise();
  } catch (error) {
    console.error("Microsoft redirect sign-in could not finish", error);
    startupNotice = "Microsoft sign-in could not finish in this browser. Try again or open the portal directly in Safari or Chrome.";
  }
  const activeAccount = redirectResult?.account ?? msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (activeAccount) {
    msalInstance.setActiveAccount(activeAccount);
    const menu = document.createElement("script");
    menu.src = academyNavigationUrl;
    menu.defer = true;
    menu.dataset.skunkworksGlobalNav = "v9";
    menu.onerror = () => console.warn("Academy navigation script could not load.");
    document.head.append(menu);
  }

  if (!rootElement) throw new Error("Portal root element is missing.");

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App startupNotice={startupNotice} />
        <SkunkieCompanion />
      </MsalProvider>
    </React.StrictMode>
  );
}

void bootstrapPortal().catch((error) => {
  renderStartupError(error);
});
