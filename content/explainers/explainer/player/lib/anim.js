// lib/anim.js — the animation vocabulary, on top of lib/clock.js.
// Everything is a pure function of window.T; call these from an idempotent
// window.render() that may run repeatedly and in any seek order.
/* global T, seg, clamp, lerp */

const $id = (x) => (typeof x === "string" ? document.getElementById(x) : x);

function sty(el, obj) { Object.assign($id(el).style, obj); }

// Entrance: fade in + rise. Elements start with class hidden0 (opacity 0).
function enter(el, t0, dur = 600, dy = 26) {
  const u = seg(t0, t0 + dur);
  sty(el, { opacity: u, transform: `translateY(${(1 - u) * dy}px)` });
}

// Entrance with a slight scale pop.
function pop(el, t0, dur = 550) {
  const u = seg(t0, t0 + dur);
  sty(el, { opacity: u, transform: `scale(${0.86 + 0.14 * u})` });
}

function fadeIn(el, t0, dur = 500)  { sty(el, { opacity: seg(t0, t0 + dur) }); }
function fadeOut(el, t0, dur = 500) { sty(el, { opacity: 1 - seg(t0, t0 + dur) }); }
// visible only inside [t0,t1]
function showWin(el, t0, t1, fade = 350) {
  sty(el, { opacity: clamp(Math.min((T - t0) / fade, (t1 - T) / fade), 0, 1) });
}

// One-shot emphasis pulse (glow ring) at t0. Clears the shadow when inactive so
// it is idempotent under load-once seeking (a persistent DOM would otherwise
// keep the last faint ring forever); harmless under fresh navigate.
function pulse(el, t0, dur = 900, color = "var(--accent)") {
  const u = clamp((T - t0) / dur, 0, 1);
  if (u <= 0 || u >= 1) { sty(el, { boxShadow: "" }); return; }
  const a = Math.sin(u * Math.PI);
  const ring = `color-mix(in srgb, ${color} ${35 * a}%, transparent)`;
  const glow = `color-mix(in srgb, ${color} ${30 * a}%, transparent)`;
  sty(el, { boxShadow: `0 0 0 ${6 * a}px ${ring}, 0 0 ${40 * a}px ${glow}` });
}

// Deterministic caret blink (2 Hz), driven by T only.
function caretOn() { return Math.floor(T / 400) % 2 === 0; }

// SVG path draw-on between t0 and t0+dur.
function draw(el, t0, dur = 700) {
  el = $id(el);
  const L = el.getTotalLength();
  el.style.strokeDasharray = L;
  const u = seg(t0, t0 + dur);
  el.style.strokeDashoffset = L * (1 - u);
  // A marker can otherwise reveal an arrowhead while the path itself is still
  // fully dashed off-screen. Hide the whole path until drawing has begun.
  el.style.visibility = u > 0 ? "visible" : "hidden";
}

// --- typewriter terminal -----------------------------------------------------
// Type `cmd` (array of {t,c} spans or plain string) into el starting at t0.
// Returns the ms timestamp at which typing completes.
const CPS = 26; // chars per second
function typeCmd(el, cmd, t0, cps = CPS) {
  el = $id(el);
  const spans = typeof cmd === "string" ? [{ t: cmd, c: "" }] : cmd;
  const total = spans.reduce((n, s) => n + s.t.length, 0);
  const tEnd = t0 + (total * 1000) / cps;
  const shown = Math.floor(clamp(((T - t0) * cps) / 1000, 0, total));
  let left = shown, html = "";
  for (const s of spans) {
    if (left <= 0) break;
    const take = Math.min(left, s.t.length);
    const txt = s.t.slice(0, take).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html += s.c ? `<span class="${s.c}">${txt}</span>` : txt;
    left -= take;
  }
  const typing = T >= t0 && shown < total;
  const done = shown >= total;
  if ((typing || (done && el.dataset.holdCaret)) && caretOn()) html += '<span class="caret"></span>';
  el.innerHTML = html;
  return tEnd;
}

// Reveal pre-authored output lines (children of el) staggered after t0.
function revealLines(el, t0, step = 130, fade = 220) {
  const kids = $id(el).children;
  for (let i = 0; i < kids.length; i++)
    kids[i].style.opacity = seg(t0 + i * step, t0 + i * step + fade, false);
}
