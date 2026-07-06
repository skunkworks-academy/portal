import React from "react";
import ReactDOM from "react-dom/client";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { App } from "./App";
import { msalConfig } from "./authConfig";
import "./styles.css";
import "./global-nav-toggle";
import "./student-account-navigation";
import "./instructor-account-navigation";
import "./staff-account-navigation";
import "./workspace-card-navigation";

const msalInstance = new PublicClientApplication(msalConfig);
const rootElement = document.getElementById("root");

async function bootstrapPortal() {
  await msalInstance.initialize();

  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </React.StrictMode>
    );
  }
}

void bootstrapPortal().catch((error) => {
  console.error("Portal startup failed", error);
  if (rootElement) {
    rootElement.innerHTML = `<main class="portal-main"><div class="alert error">Portal startup failed. Please refresh the page or contact Skunkworks Academy support.</div></main>`;
  }
});
