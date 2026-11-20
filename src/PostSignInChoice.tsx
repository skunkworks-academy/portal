import { useEffect, useRef } from "react";
import { validatePublicReturnUrl } from "./public-return";
import "./post-sign-in-choice.css";

type Props = {
  returnTo: string;
  onReturn: () => void;
  onPortal: () => void;
};

/** Rendered only by bootstrap after MSAL has resolved an authenticated account. */
export function PostSignInChoice({ returnTo, onReturn, onPortal }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const destination = validatePublicReturnUrl(returnTo);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <main className="post-sign-in" id="main">
      <section className="post-sign-in__card" aria-labelledby="post-sign-in-title">
        <p className="post-sign-in__eyebrow">SKUNKWORKS ACADEMY</p>
        <h1 id="post-sign-in-title" ref={heading} tabIndex={-1}>You're signed in to Skunkworks Academy</h1>
        <p>Choose where you'd like to continue.</p>
        <div className="post-sign-in__actions">
          {destination && <a className="post-sign-in__return" href={destination} onClick={onReturn}>
            <strong>Return to page</strong>
            <span>Continue browsing where you signed in.</span>
          </a>}
          <button type="button" className="post-sign-in__portal" onClick={onPortal}>
            <strong>Open my portal</strong>
            <span>Access courses, progress and account tools.</span>
          </button>
        </div>
        {destination && <p className="post-sign-in__destination">Return destination: <span>{destination}</span></p>}
        <p className="post-sign-in__note">Your choice does not change your account permissions.</p>
      </section>
    </main>
  );
}
