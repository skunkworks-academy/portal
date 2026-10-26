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


      <section className="landing-hero">
        <p className="landing-eyebrow"><span /> THE SKUNKWORKS ACADEMY PORTAL</p>
        <h1>One Academy.<br /><em>Every workspace.</em></h1>
        <p className="landing-intro">A secure, unified home for learners, instructors and Academy operations. Access courses, cohorts, teaching opportunities, Microsoft Teams and SharePoint through your Microsoft account.</p>
        <div className="landing-actions">
          <button type="button" className="landing-primary" onClick={onSignIn}>Continue with Microsoft <span aria-hidden="true">→</span></button>
          <a href="https://skunkworksacademy.com/self-paced/" className="landing-secondary">Browse the catalogue</a>
        </div>
        <p className="landing-trust">Microsoft Entra ID single sign-on · Role-based access · Secure sessions</p>
      </section>

      <section className="landing-constellation" aria-label="Portal capabilities">
        <article className="landing-float-card card-course"><span>01</span><strong>Learn</strong><p>Courses built for practical progress.</p></article>
        <article className="landing-float-card card-lab"><span>02</span><strong>Practise</strong><p>Hands-on labs that make skills stick.</p></article>
        <article className="landing-float-card card-companion"><span className="landing-skunkie">S</span><strong>Skunkie</strong><p>Your AI learning companion.</p></article>
        <article className="landing-float-card card-class"><span>04</span><strong>Connect</strong><p>Live classes, study groups and support.</p></article>
      </section>

      <footer className="landing-footer">
        <span>One identity. Connected learning.</span>
        <span>South Africa · Built for momentum</span>
        <a href="mailto:training@skunkworks.africa">Get support</a>
      </footer>
    </main>
  );
}
