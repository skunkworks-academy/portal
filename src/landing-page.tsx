import { useState } from "react";
import "./landing-page.css";

type PortalLandingProps = {
  onSignIn: () => Promise<void> | void;
};

export function PortalLanding({ onSignIn }: PortalLandingProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function beginSignIn() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onSignIn();
    } catch (caught) {
      console.error("Microsoft sign-in could not start", caught);
      setError("Unable to start Microsoft sign-in. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="academy-login" id="main">
      <a className="academy-login-skip" href="#academy-login-title">Skip to sign in</a>
      <header className="academy-login-header">
        <a className="academy-login-brand" href="https://www.skunkworksacademy.com/" aria-label="Skunkworks Academy homepage">
          <span className="academy-login-brand-mark">
            <img src="https://www.skunkworksacademy.com/images/favicon-white.png" width="34" height="34" alt="" />
          </span>
          <span><strong>SKUNKWORKS</strong><small>ACADEMY</small></span>
        </a>
        <div className="academy-login-header-caption"><span className="academy-login-status-dot" aria-hidden="true" /> SECURE PORTAL</div>
      </header>

      <section className="academy-login-body" aria-labelledby="academy-login-title">
        <div className="academy-login-message">
          <p className="academy-login-eyebrow"><span /> THE SKUNKWORKS ACADEMY PORTAL</p>
          <h1 id="academy-login-title">Your Academy.<br /><em>One secure sign-in.</em></h1>
          <p className="academy-login-intro">Access your Skunkworks Academy account using Microsoft. Your learning and operational workspace becomes available after authentication.</p>
          <div className="academy-login-security"><span aria-hidden="true">◇</span><p>Microsoft Entra ID authentication<br /><small>Protected by your organisation’s access policies.</small></p></div>
        </div>

        <div className="academy-login-panel">
          <div className="academy-login-panel-mark" aria-hidden="true">
            <img src="https://www.skunkworksacademy.com/images/favicon-black.png" width="44" height="44" alt="" />
          </div>
          <p className="academy-login-panel-overline">WELCOME TO SKUNKWORKS ACADEMY</p>
          <h2>Sign in to continue</h2>
          <p>Use your authorised Microsoft work, school or supported personal account.</p>
          <button type="button" className="academy-login-sso" disabled={submitting} onClick={() => void beginSignIn()}>
            <span className="academy-login-ms-mark" aria-hidden="true"><i /><i /><i /><i /></span>
            <span>{submitting ? "Opening Microsoft sign-in…" : "Continue with Microsoft"}</span>
            <span className="academy-login-arrow" aria-hidden="true">→</span>
          </button>
          {error && <p className="academy-login-error" role="alert">{error}</p>}
          <p className="academy-login-session-note">Your dashboard and navigation are private and appear only after successful sign-in.</p>
          <div className="academy-login-panel-footer"><span aria-hidden="true">◈</span><span>Microsoft Entra ID · Encrypted sign-in</span></div>
        </div>
      </section>

      <footer className="academy-login-footer">
        <div><strong>SKUNKWORKS ACADEMY</strong><span>Dream. Design. Deliver.</span></div>
        <nav aria-label="Help and legal"><a href="https://www.skunkworksacademy.com/privacy/">Privacy</a><a href="https://www.skunkworksacademy.com/contact/">Contact</a><a href="mailto:training@skunkworks.africa">Sign-in support</a></nav>
        <small>© {new Date().getFullYear()} Skunkworks Academy</small>
      </footer>
    </main>
  );
}
