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
    <main className="academy-login" id="main">
      <header className="academy-login-header">
        <a href="https://www.skunkworksacademy.com/" className="academy-login-brand" aria-label="Skunkworks Academy main website">
          <img src="https://www.skunkworksacademy.com/images/favicon-white.png" width="44" height="44" alt="" />
          <span><strong>SKUNKWORKS</strong><small>ACADEMY</small></span>
        </a>
        <span className="academy-login-header-label">Secure portal</span>
      </header>

      <div className="academy-login-stage">
        <div className="academy-login-intro">
          <span className="academy-login-kicker"><span aria-hidden="true" /> SKUNKWORKS ACADEMY</span>
          <h1>Everything begins<br /><em>with your sign-in.</em></h1>
          <p>One secure identity for your Academy experience. Use any personal Microsoft account or Microsoft Entra work or school account to sign in or register as a learner.</p>
          <div className="academy-login-trust">
            <span className="academy-login-check" aria-hidden="true">✓</span>
            <span>Personal Microsoft and Entra ID accounts supported</span>
          </div>
        </div>

        <section className="academy-login-card" aria-labelledby="academy-login-title">
          <div className="academy-login-card-top">
            <span className="academy-login-mark" aria-hidden="true">
              <span /><span /><span /><span />
            </span>
            <span className="academy-login-card-tag">MICROSOFT ACCOUNT</span>
          </div>
          <h2 id="academy-login-title">Welcome to the portal</h2>
          <p>Sign in with an Outlook, Hotmail, Live or Microsoft Entra work or school account. First-time users can create an Academy learner profile automatically.</p>
          {(signInError || startupNotice) && <p className="academy-login-auth-error" role="alert">{signInError || startupNotice}</p>}
          <button type="button" className="academy-login-button" disabled={redirecting} onClick={() => void beginSignIn()}>
            <span>{redirecting ? "Opening Microsoft sign-in…" : "Sign in with Microsoft"}</span><span aria-hidden="true">→</span>
          </button>
          <p className="academy-login-mobile-help">Having trouble inside an app? Open this website in Safari or Chrome to sign in.</p>
          <div className="academy-login-security">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            <span>Protected by Microsoft Entra ID and your organisation's access policies.</span>
          </div>
        </section>
      </div>

      <footer className="academy-login-footer">
        <span>© {new Date().getFullYear()} Skunkworks Academy · Learn. Build. Deploy.</span>
        <div><a href="https://www.skunkworksacademy.com/">Academy website</a><a href="mailto:training@skunkworks.africa">Support</a></div>
      </footer>
    </main>
  );
}
