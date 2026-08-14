import { useState, type CSSProperties } from "react";
import "./landing-page.css";

type PortalLandingProps = {
  onSignIn: () => void;
};

export function PortalLanding({ onSignIn }: PortalLandingProps) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  function move(event: React.PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: ((event.clientX - rect.left) / rect.width - .5) * 2,
      y: ((event.clientY - rect.top) / rect.height - .5) * 2
    });
  }

  const motion = {
    "--pointer-x": pointer.x.toFixed(3),
    "--pointer-y": pointer.y.toFixed(3)
  } as CSSProperties;

  return (
    <main className="portal-landing" onPointerMove={move} onPointerLeave={() => setPointer({ x: 0, y: 0 })} style={motion}>
      <div className="landing-noise" aria-hidden="true" />
      <div className="landing-field" aria-hidden="true">
        <span className="landing-orb orb-violet" />
        <span className="landing-orb orb-cyan" />
        <span className="landing-grid" />
        <span className="landing-ring ring-one" />
        <span className="landing-ring ring-two" />
      </div>

      <header className="landing-nav">
        <a href="https://skunkworksacademy.com/" className="landing-brand" aria-label="Skunkworks Academy home">
          <span className="landing-brand-mark" aria-hidden="true">
            <img className="academy-menu-icon academy-menu-icon--dark" src="https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-white.png" alt="" />
            <img className="academy-menu-icon academy-menu-icon--light" src="https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-black.png" alt="" />
          </span>
          <span>Skunkworks <small>Academy</small></span>
        </a>
        <nav aria-label="Portal links">
          <a href="https://skunkworksacademy.com/self-paced/">Explore learning</a>
          <a href="https://labs.skunkworksacademy.com/">Labs</a>
          <button type="button" className="landing-nav-signin" onClick={onSignIn}>Student sign in <span aria-hidden="true">↗</span></button>
        </nav>
      </header>

      <section className="landing-hero">
        <p className="landing-eyebrow"><span /> The Skunkworks Academy learning portal</p>
        <h1>Build skills<br /><em>that move you.</em></h1>
        <p className="landing-intro">A focused learning space for self-paced courses, practical labs, live classes and guided growth—built around the work you want to do next.</p>
        <div className="landing-actions">
          <button type="button" className="landing-primary" onClick={onSignIn}>Enter your learning space <span aria-hidden="true">→</span></button>
          <a href="https://skunkworksacademy.com/self-paced/" className="landing-secondary">Browse the catalogue</a>
        </div>
        <p className="landing-trust">Secured by Microsoft Entra · Your progress stays yours</p>
      </section>

      <section className="landing-constellation" aria-label="Portal capabilities">
        <article className="landing-float-card card-course"><span>01</span><strong>Learn</strong><p>Courses built for practical progress.</p></article>
        <article className="landing-float-card card-lab"><span>02</span><strong>Practise</strong><p>Hands-on labs that make skills stick.</p></article>
        <article className="landing-float-card card-companion"><span className="landing-skunkie">S</span><strong>Skunkie</strong><p>Your AI learning companion.</p></article>
        <article className="landing-float-card card-class"><span>04</span><strong>Connect</strong><p>Live classes, study groups and support.</p></article>
      </section>

      <footer className="landing-footer">
        <span>Learning that compounds.</span>
        <span>South Africa · Built for momentum</span>
        <a href="mailto:training@skunkworks.africa">Get support</a>
      </footer>
    </main>
  );
}
