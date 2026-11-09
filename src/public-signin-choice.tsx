import "./public-signin-choice.css";

type PublicSignInChoiceProps = {
  returnUrl: string;
  accountName: string;
};

/** A deliberate destination choice after returning from Microsoft sign-in. */
export function PublicSignInChoice({ returnUrl, accountName }: PublicSignInChoiceProps) {
  return (
    <main className="swa-postlogin" id="main">
      <section className="swa-postlogin__card" aria-labelledby="postlogin-title">
        <p className="swa-postlogin__eyebrow">Skunkworks Academy · Secure sign-in</p>
        <span className="swa-postlogin__success" role="status">
          <span aria-hidden="true">✓</span> Microsoft sign-in complete
        </span>
        <h1 id="postlogin-title">Where would you like to continue?</h1>
        <p className="swa-postlogin__lead">
          {accountName ? "Welcome, " + accountName + ". " : ""}
          Continue on the Academy page you were viewing, or enter your learner portal.
        </p>
        <nav className="swa-postlogin__choices" aria-label="Choose your destination">
          <a className="swa-postlogin__choice" href={returnUrl}>
            <span className="swa-postlogin__icon" aria-hidden="true">↩</span>
            <strong>Return to my page</strong>
            <span>Continue browsing where you started.</span>
            <span className="swa-postlogin__action">Return to page →</span>
          </a>
          <a className="swa-postlogin__choice swa-postlogin__choice--primary" href="/">
            <span className="swa-postlogin__icon" aria-hidden="true">▦</span>
            <strong>Open my portal</strong>
            <span>Go to your courses, progress and Academy account.</span>
            <span className="swa-postlogin__action">Go to portal →</span>
          </a>
        </nav>
        <p className="swa-postlogin__note">
          Your Microsoft session is established for the Portal. Other Academy properties
          may establish their own session when you visit them.
        </p>
      </section>
    </main>
  );
}
