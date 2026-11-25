import { useState } from "react";
import "./landing-page.css";

type PortalLandingProps = {
  onSignIn: () => Promise<void> | void;
  startupNotice?: string;
};

/**
 * The anonymous portal entry deliberately renders no workspace navigation,
 * dashboards, module previews, record counts or authenticated UI.
 */
export function PortalLanding({ onSignIn, startupNotice = "" }: PortalLandingProps) {
  const [signInError, setSignInError] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  async function beginSignIn() {
    if (redirecting) return;
    setRedirecting(true);
    setSignInError("");
    try {
      await onSignIn();
    } catch (error) {
      console.error("Could not start Microsoft sign-in", error);
      setSignInError("Microsoft sign-in could not start in this browser. Try again or open the portal directly in Safari or Chrome.");
      setRedirecting(false);
    }
  }

  return (
    <div className="academy-login">
      <a className="skip-link" href="#main">Skip to sign-in</a>
      <header className="academy-login-header">
        <div className="academy-login-bar">
          <a href="https://www.skunkworksacademy.com/" className="academy-login-brand" aria-label="Skunkworks Academy home">
            <img className="academy-entry-logo-light" src="/images/academy-mark-black.png" width="60" height="60" alt="" />
            <img className="academy-entry-logo-dark" src="/images/academy-mark-white.png" width="60" height="60" alt="" />
            <span>Skunkworks Academy</span>
          </a>
          <a className="academy-login-support" href="mailto:training@skunkworks.africa">Support</a>
        </div>
      </header>

      <main className="academy-login-main" id="main" tabIndex={-1}>
        <div className="academy-login-stage">
          <div className="academy-login-intro">
            <h1>Academy portal</h1>
            <p>Access your courses, learning records and Academy profile.</p>
          </div>

          <section className="academy-login-card" aria-labelledby="academy-login-title">
            <h2 id="academy-login-title">Sign in</h2>
            <p>Use a personal Microsoft account or a work or school account through Microsoft Entra ID.</p>
            {(signInError || startupNotice) && <p className="academy-login-auth-error" role="alert">{signInError || startupNotice}</p>}
            <button type="button" className="academy-login-button" disabled={redirecting} onClick={() => void beginSignIn()}>
              <span>{redirecting ? "Opening Microsoft sign-in…" : "Sign in with Microsoft"}</span>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M4 12h15m-6-6 6 6-6 6" />
              </svg>
            </button>
            <p className="academy-login-first-visit">On your first sign-in, we’ll set up your Academy learner profile.</p>
            <details className="academy-login-help">
              <summary>Having trouble signing in?</summary>
              <p>If you opened the portal inside another app, open it directly in Safari or Chrome and try again.</p>
            </details>
          </section>
        </div>
      </main>

      <footer className="academy-login-footer">
        <div className="academy-login-bar">
          <span>© {new Date().getFullYear()} Skunkworks Academy</span>
          <nav aria-label="Legal">
            <a href="/privacystatement/">Privacy</a>
            <a href="/termsofservice/">Terms of service</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
