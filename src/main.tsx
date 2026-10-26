import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider, useMsal } from "@azure/msal-react";
import { App } from "./App";
import { SkunkieCompanion } from "./SkunkieCompanion";
import { msalConfig } from "./authConfig";
import "./styles.css";
import "./academy-brand-theme.css";
import "./instructor-account-navigation";
import "./staff-account-navigation";
import "./workspace-card-navigation";
import "./form-field-metadata";

// Keep Academy-wide application navigation off the unauthenticated sign-in screen.
export const academyGlobalNavigationUrl = "https://skunkworksacademy.com/assets/academy-navigation.js?v=2026.08.14.2";

function AuthenticatedPortalExtras() {
  const { accounts } = useMsal();
  const isAuthenticated = accounts.length > 0;

  useEffect(() => {
    if (!isAuthenticated || document.querySelector("script[data-skunkworks-global-nav]")) return;
    const script = document.createElement("script");
    script.src = academyGlobalNavigationUrl;
    script.defer = true;
    script.dataset.skunkworksGlobalNav = "v9";
    script.onerror = () => console.warn("Academy global navigation could not load.");
    document.head.appendChild(script);
  }, [isAuthenticated]);

  return isAuthenticated ? <SkunkieCompanion /> : null;
}

const msalInstance = new PublicClientApplication(msalConfig);
const rootElement = document.getElementById("root");

function renderStartupError() {
  if (!rootElement) return;
  rootElement.innerHTML = `
    <main class="portal-main startup-error" id="main" tabindex="-1">
      <section class="alert error" role="alert">
        <h1>Portal startup failed</h1>
        <p>Refresh the page. If the problem continues, contact Skunkworks Academy support.</p>
        <div class="startup-actions">
          <button type="button" data-reload-page>Reload portal</button>
          <a href="mailto:training@skunkworks.africa">Contact support</a>
        </div>
      </section>
    </main>`;
  rootElement.querySelector<HTMLButtonElement>("[data-reload-page]")?.addEventListener("click", () => window.location.reload());
  rootElement.querySelector<HTMLElement>("#main")?.focus();
}

async function bootstrapPortal() {
  await msalInstance.initialize();
  const redirectResult = await msalInstance.handleRedirectPromise();
  const activeAccount = redirectResult?.account ?? msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (activeAccount) msalInstance.setActiveAccount(activeAccount);

  if (!rootElement) throw new Error("Portal root element is missing.");

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
        <AuthenticatedPortalExtras />
      </MsalProvider>
    </React.StrictMode>
  );
}

void bootstrapPortal().catch((error) => {
  console.error("Portal startup failed", error);
  renderStartupError();
});
