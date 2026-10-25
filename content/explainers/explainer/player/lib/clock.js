// lib/clock.js — the virtual clock every scene page is written against.
//
// Load this first. It reads ?t=<ms>&fps=&w=&h=&cw=&ch=&theme=&css= and exposes window.T plus
// a few easing helpers. A scene renders itself as a pure function of window.T:
// never Date.now(), setInterval or requestAnimationFrame for animation STATE,
// or the capture desyncs and the render stops being reproducible.
//
// The capturer loads the page once and calls window.hfSeek(ms) per frame, so a
// page must assign window.render: build its DOM once at load, outside render,
// and have render SET (never append or latch) every time-dependent property
// from the current T. Re-running render at any T, in any order, must give the
// same frame.
(function () {
  const q = new URLSearchParams(location.search);
  window.T = parseInt(q.get("t") || "0", 10); // current time, milliseconds
  window.FPS = parseInt(q.get("fps") || "30", 10);
  window.CW = parseInt(q.get("w") || "1920", 10);
  window.CH = parseInt(q.get("h") || "1080", 10);

  // Scenes are authored on one fixed canvas and scaled uniformly to the output
  // resolution, so a smaller preview render crops nothing. The canvas defaults
  // to 1920x1080 and is set per video by .meta.canvas, which is how a portrait
  // video authors against 1080x1920 coordinates instead.
  window.AW = parseInt(q.get("cw") || "1920", 10);
  window.AH = parseInt(q.get("ch") || "1080", 10);
  const root = document.documentElement.style;
  root.setProperty("--canvas-w", window.AW + "px");
  root.setProperty("--canvas-h", window.AH + "px");
  root.setProperty("--canvas-scale", window.CW / window.AW);
  document.documentElement.dataset.theme = q.get("theme") || "light";

  // A stylesheet laid over lib/scene.css, from .meta.stylesheet or from the site
  // a page export is embedded in. Written by the parser rather than appended, so
  // it applies before first paint and before the scene's own <style>.
  const css = q.get("css");
  if (css) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = css;
    document.write(link.outerHTML);
  }

  window.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  window.lerp = (a, b, u) => a + (b - a) * u;
  window.easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

  // Eased progress through [t0,t1] at the current T, clamped to [0,1].
  window.seg = (t0, t1, ease = true) => {
    const u = window.clamp((window.T - t0) / (t1 - t0), 0, 1);
    return ease ? window.easeInOut(u) : u;
  };
  // 0 before t0, 1 within [t0+fade, t1-fade], 0 after t1.
  window.fadeWin = (t0, t1, fade = 300) =>
    window.clamp(Math.min((window.T - t0) / fade, (t1 - window.T) / fade), 0, 1);

  window.hfSeek = (ms) => {
    window.T = ms;
    if (typeof window.render === "function") window.render();
  };
})();
