import React from "react";
import ReactDOM from "react-dom/client";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { App } from "./App";
import { msalConfig } from "./authConfig";
import "./styles.css";
import "./global-nav-toggle";
import "./instructor-account-navigation";
import "./staff-account-navigation";
import "./workspace-card-navigation";
import "./form-field-metadata";

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
      </MsalProvider>
    </React.StrictMode>
  );
}

void bootstrapPortal().catch((error) => {
  console.error("Portal startup failed", error);
  renderStartupError();
});
