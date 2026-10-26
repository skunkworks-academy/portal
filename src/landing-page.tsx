import "./landing-page.css";

type PortalLandingProps = {
  onSignIn: () => void;
};

const capabilities = [
  { title: "Training delivery", detail: "Course catalogues, cohorts and instructor-led sessions", icon: "▦" },
  { title: "People & recruitment", detail: "Instructor opportunities, applications and profiles", icon: "◉" },
  { title: "Microsoft 365", detail: "SharePoint resources, Teams and collaboration", icon: "▧" },
  { title: "Operations", detail: "Controlled administration and role-based reporting", icon: "▤" }
];

export function PortalLanding({ onSignIn }: PortalLandingProps) {
  return (
    <main className="academy-login" id="main">
      <aside className="academy-login-sidebar" aria-label="Portal preview">
        <a href="https://www.skunkworksacademy.com/" className="academy-login-brand" aria-label="Skunkworks Academy home">
          <img src="https://www.skunkworksacademy.com/images/favicon-white.png" width="42" height="42" alt="" />
          <span><strong>SKUNKWORKS</strong><small>ACADEMY / PORTAL</small></span>
        </a>
        <div className="academy-login-tenant"><span /> Microsoft-secured workspace</div>
        <div className="academy-login-side-menu">
          <p>YOUR WORKSPACE</p>
          <span className="academy-login-side-active"><span aria-hidden="true">▦</span> Dashboard</span>
          <span><span aria-hidden="true">▤</span> Courses & catalogues</span>
          <span><span aria-hidden="true">▧</span> Cohorts & scheduling</span>
          <p>PEOPLE & OPERATIONS</p>
          <span><span aria-hidden="true">◉</span> Instructor applications</span>
          <span><span aria-hidden="true">▣</span> Microsoft 365</span>
          <span><span aria-hidden="true">⚙</span> Account & access</span>
        </div>
        <div className="academy-login-side-footer"><span className="academy-login-lock" aria-hidden="true">◇</span><div><strong>Secure by design</strong><small>Microsoft Entra ID · Role-based access</small></div></div>
      </aside>
      <div className="academy-login-content">
        <header className="academy-login-topbar">
          <div><span className="academy-login-eyebrow">ACADEMY</span><strong>Operations portal</strong></div>
          <a href="https://www.skunkworksacademy.com/">Academy website <span aria-hidden="true">↗</span></a>
        </header>
        <section className="academy-login-center" aria-labelledby="academy-login-title">
          <div className="academy-login-intro">
            <span className="academy-login-pill"><span aria-hidden="true" /> ONE IDENTITY. ONE ACADEMY.</span>
            <h1 id="academy-login-title">The Academy.<br /><em>All in one place.</em></h1>
            <p>Training delivery, talent, operations and Microsoft 365 in a unified workspace. Sign in with your authorised Microsoft account to see the tools and records available to your role.</p>
            <div className="academy-login-signin-card">
              <div className="academy-login-signin-heading"><span className="academy-login-microsoft" aria-hidden="true"><i /><i /><i /><i /></span><div><strong>Continue with Microsoft</strong><small>Secure organisational sign-in</small></div></div>
              <button type="button" className="academy-login-sso" onClick={onSignIn}>Sign in with Microsoft <span aria-hidden="true">→</span></button>
              <p>Protected by Microsoft Entra ID. Multi-factor authentication and access policies are managed by your organisation.</p>
            </div>
          </div>
          <div className="academy-login-modules" aria-label="Portal capabilities">
            <div className="academy-login-modules-header"><span>YOUR WORKSPACE</span><span>Available after sign-in</span></div>
            <div className="academy-login-module-grid">
              {capabilities.map((item) => <article key={item.title} className="academy-login-module"><span className="academy-login-module-icon" aria-hidden="true">{item.icon}</span><h2>{item.title}</h2><p>{item.detail}</p><span className="academy-login-module-arrow" aria-hidden="true">↗</span></article>)}
            </div>
            <p className="academy-login-modules-note">Module visibility and data access depend on your assigned Microsoft Entra permissions.</p>
          </div>
        </section>
        <footer className="academy-login-footer"><span>© Skunkworks Academy · Learn · Build · Deploy</span><div><a href="mailto:training@skunkworks.africa">Support</a><a href="https://www.skunkworksacademy.com/">Academy</a></div></footer>
      </div>
    </main>
  );
}
