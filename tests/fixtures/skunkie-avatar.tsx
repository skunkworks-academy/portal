import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SkunkieAvatar, type SkunkieActivity } from "../../src/SkunkieAvatar";
import "../../src/skunkie-companion.css";

function Preview() {
  const [activity, setActivity] = useState<SkunkieActivity>("idle");
  const [reduced, setReduced] = useState(false);
  return <main>
    <style>{`body{margin:0;background:#eef2f6;color:#172333;font:16px/1.5 system-ui}main{max-width:900px;margin:auto;padding:24px}h1{font-size:28px;margin-bottom:0}.controls{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}button{padding:10px 16px;border:1px solid #63768a;border-radius:8px;cursor:pointer;background:white;color:#172333}button[aria-pressed=true]{background:#03033a;color:white}.stages{display:grid;grid-template-columns:1fr 1fr;gap:16px}.stage{display:grid;justify-items:center;padding:20px;border-radius:20px;background:white}.stage.dark{background:#03033a;color:white}.stage>.skunkie-avatar{width:min(100%,230px)}.small{width:88px}label{display:flex;align-items:center;gap:8px}button:focus-visible,input:focus-visible{outline:3px solid #1e6bd0;outline-offset:3px}@media(max-width:500px){main{padding:16px}.stages{gap:8px}.stage{padding:12px}h1{font-size:24px}}`}</style>
    <h1>Skunkie avatar review</h1><p>48 illustrated frames · 21 additional frames · light and dark surfaces</p>
    <div className="controls">{(["idle","wave","listening","thinking","speaking"] as const).map(value => <button key={value} aria-pressed={activity === value} onClick={() => setActivity(value)}>{value}</button>)}</div>
    <label><input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)} /> Reduce motion</label>
    <div className="stages">{[false,true].map(dark => <section key={String(dark)} className={`stage ${dark ? "dark" : ""}`}><h2>{dark ? "Dark" : "Light"}</h2><SkunkieAvatar activity={activity} reduceMotion={reduced}/><div className="small"><SkunkieAvatar activity={activity} reduceMotion={reduced}/></div></section>)}</div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
