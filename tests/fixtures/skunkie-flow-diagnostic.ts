import { createSkunkieRenderer, SKUNKIE_FLOW_SRC, SKUNKIE_MOTION_SRC } from "../../src/skunkie-motion-renderer";
const load = (source: string) => new Promise<HTMLImageElement>((resolve,reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });
const [atlas, flow] = await Promise.all([load(SKUNKIE_MOTION_SRC),load(SKUNKIE_FLOW_SRC)]);
const canvas = document.createElement("canvas"); canvas.width=288; canvas.height=384;
const renderer = createSkunkieRenderer(canvas,atlas,flow); if (!renderer) throw Error("Renderer unavailable");
const added = new URLSearchParams(location.search).has("new");
if (added) {
  document.querySelector("h1")!.textContent = "48 additional Skunkie poses — 96 total";
  document.body.dataset.new = "true";
}
const pairs = added ? Array.from({length:48},(_,i)=>[48+i,48+i]) : [[12,13],[13,14],[14,15],[15,16],[17,18],[18,19],[18,21],[23,12],[24,25]];
for (const [from,to] of pairs) {
  const section = document.createElement("section"); const title = document.createElement("h2"); title.textContent = added ? `Pose ${from + 1}` : `${from} → ${to} at 50%`;
  renderer.draw({from,to,progress:.5});
  const image = document.createElement("img"); image.src=canvas.toDataURL(); image.width=288; image.height=384;
  section.append(title,image); document.getElementById("frames")!.append(section);
}
renderer.dispose();
