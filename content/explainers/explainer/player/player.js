// player.js — plays an exported explainer live in the browser.
//
// The scene pages are the same ones the video is captured from, one iframe each.
// Instead of a capturer stepping the virtual clock frame by frame, the narration
// is the clock: every animation frame reads audio.currentTime and hands the
// owning scene its local time through window.hfSeek, exactly as capture.mjs does.
//
// Mounts on every <div class="explainer" data-manifest="…/manifest.json">. A
// transcript already in the document, either inside that element or marked
// .explainer-transcript[data-manifest] with the same manifest URL, is wired up
// rather than rebuilt, so a site can render it server-side in its own markup.
(function () {
  "use strict";

  const SEEK_STEP = 5000;
  // Within this much of a scene's start, "previous" goes to the scene before.
  const RESTART_GRACE = 1500;

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h2.5v14H5zM19 5v14L8.5 12z" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 5H19v14h-2.5zM5 5v14l10.5-7z" fill="currentColor"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  };

  const clock = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  function h(tag, cls, attrs = {}) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v);
    }
    return el;
  }

  function button(cls, label, icon) {
    return h("button", `explainer-btn ${cls}`, { type: "button", "aria-label": label, title: label, html: icon });
  }

  function buildTranscript(m) {
    const root = h("div", "explainer-transcript");
    for (const s of m.scenes) {
      const sec = h("section", "explainer-chapter", { "data-scene": s.id });
      const head = h("h3", "explainer-chapter-title");
      head.append(h("a", "", { href: `#t=${s.start}`, "data-at": s.start, text: s.title }));
      const p = h("p");
      s.cues.forEach((c, i) => {
        if (i) p.append(" ");
        p.append(h("span", "explainer-cue", { "data-at": c.at, text: c.text }));
      });
      sec.append(head, p);
      root.append(sec);
    }
    return root;
  }

  async function mount(root) {
    const manifestUrl = new URL(root.dataset.manifest, document.baseURI);
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error(`${manifestUrl}: ${res.status}`);
    const m = await res.json();
    const rel = (p) => new URL(p, manifestUrl).href;
    const [CW, CH] = m.canvas;
    const total = m.duration;

    // ------------------------------------------------------------- structure --
    const player = h("div", "explainer-player", { tabindex: "-1" });
    const stage = h("div", "explainer-stage");
    stage.style.aspectRatio = `${CW} / ${CH}`;
    player.style.setProperty("--explainer-aspect", `${CW} / ${CH}`);
    const overlay = h("button", "explainer-start", {
      type: "button",
      "aria-label": `Play ${m.title}`,
      html: `${ICONS.play}<span>${clock(total)}</span>`,
    });

    const frames = m.scenes.map((s) => {
      const q = new URLSearchParams({ t: "0", w: CW, h: CH, cw: CW, ch: CH, theme: m.theme || "light" });
      if (m.stylesheet) q.set("css", m.stylesheet);
      return h("iframe", "explainer-scene", {
        src: `${rel(s.page)}?${q}`,
        title: s.title,
        tabindex: "-1",
        "aria-hidden": "true",
      });
    });
    stage.append(...frames, overlay);

    const controls = h("div", "explainer-controls");
    const playBtn = button("explainer-play", "Play", ICONS.play);
    const prevBtn = button("explainer-prev", "Previous chapter", ICONS.prev);
    const nextBtn = button("explainer-next", "Next chapter", ICONS.next);
    const fullBtn = button("explainer-full", "Full screen", ICONS.full);
    const time = h("span", "explainer-time", { "aria-live": "off" });
    const chapter = h("span", "explainer-now");
    const bar = h("div", "explainer-bar", {
      role: "slider",
      tabindex: "0",
      "aria-label": "Seek",
      "aria-valuemin": "0",
      "aria-valuemax": String(Math.round(total / 1000)),
    });
    const fill = h("div", "explainer-fill");
    bar.append(fill);
    for (const s of m.scenes.slice(1)) {
      const tick = h("div", "explainer-tick");
      tick.style.left = `${(100 * s.start) / total}%`;
      bar.append(tick);
    }
    const row = h("div", "explainer-row");
    row.append(prevBtn, playBtn, nextBtn, time, chapter, fullBtn);
    controls.append(bar, row);
    player.append(stage, controls);

    const audio = h("audio", "", { preload: "metadata" });
    audio.src = rel(m.audio);
    player.append(audio);

    let transcript =
      root.querySelector(".explainer-transcript") ||
      [...document.querySelectorAll(".explainer-transcript[data-manifest]")].find(
        (t) => new URL(t.dataset.manifest, document.baseURI).href === manifestUrl.href,
      );
    root.prepend(player);
    if (!transcript && root.dataset.transcript !== "none") {
      transcript = buildTranscript(m);
      root.append(transcript);
    }
    const chapters = transcript ? [...transcript.querySelectorAll(".explainer-chapter")] : [];
    const cues = transcript
      ? [...transcript.querySelectorAll(".explainer-cue")].map((el) => ({ el, at: +el.dataset.at }))
      : [];
    root.classList.add("explainer-ready");

    // ----------------------------------------------------------------- clock --
    // The audio element is the clock while it works. If it cannot play, the
    // scenes still run, silently, from the wall clock.
    let now = 0;
    let playing = false;
    let started = false;
    let silent = false;
    let wallStart = 0;
    let current = -1;
    let currentCue = null;
    let raf = 0;

    const sceneAt = (g) => {
      let i = 0;
      while (i + 1 < m.scenes.length && g >= m.scenes[i + 1].start) i++;
      return i;
    };

    function scale(frame) {
      const doc = frame.contentDocument;
      if (doc && doc.documentElement) {
        doc.documentElement.style.setProperty("--canvas-scale", stage.clientWidth / CW);
      }
    }

    function show(g) {
      now = Math.max(0, Math.min(total, g));
      const i = sceneAt(now);
      if (i !== current) {
        if (current >= 0) frames[current].classList.remove("is-current");
        frames[i].classList.add("is-current");
        chapters.forEach((c, k) => c.classList.toggle("is-current", k === i));
        chapter.textContent = m.scenes[i].title;
        current = i;
      }
      const win = frames[i].contentWindow;
      // A scene that has not loaded yet catches up from its load handler.
      if (win && typeof win.hfSeek === "function") win.hfSeek(Math.round(now - m.scenes[i].start));

      fill.style.width = `${(100 * now) / total}%`;
      time.textContent = `${clock(now)} / ${clock(total)}`;
      bar.setAttribute("aria-valuenow", String(Math.round(now / 1000)));
      bar.setAttribute("aria-valuetext", `${clock(now)}, ${m.scenes[i].title}`);

      let cue = null;
      for (const c of cues) if (c.at <= now) cue = c;
      if (!started) cue = null;
      if (cue !== currentCue) {
        if (currentCue) currentCue.el.classList.remove("is-current");
        if (cue) cue.el.classList.add("is-current");
        currentCue = cue;
      }
    }

    // One animation-frame loop at most, however many ways playback was started.
    const loop = () => { if (!raf) raf = requestAnimationFrame(tick); };

    function tick() {
      raf = 0;
      if (!playing) return;
      const g = silent ? performance.now() - wallStart : audio.currentTime * 1000;
      if (g >= total) {
        pause();
        show(total);
        return;
      }
      show(g);
      loop();
    }

    function setPlaying(on) {
      playing = on;
      root.classList.toggle("is-playing", on);
      playBtn.innerHTML = on ? ICONS.pause : ICONS.play;
      playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
      playBtn.title = on ? "Pause" : "Play";
    }

    function play() {
      if (!started) {
        started = true;
        root.classList.add("is-started");
        if (now >= total || overlay.isConnected) now = 0;
        overlay.remove();
      }
      if (now >= total) now = 0;
      setPlaying(true);
      if (silent) {
        wallStart = performance.now() - now;
        loop();
        return;
      }
      audio.currentTime = now / 1000;
      audio.play().then(loop, (err) => {
        // Swapping in the seekable blob aborts a pending play; that one retries.
        if (err.name === "AbortError") return;
        silent = true;
        wallStart = performance.now() - now;
        loop();
      });
    }

    function pause() {
      setPlaying(false);
      if (!silent) audio.pause();
    }

    function seek(g) {
      g = Math.max(0, Math.min(total, g));
      if (!started) {
        started = true;
        root.classList.add("is-started");
        overlay.remove();
      }
      if (silent) wallStart = performance.now() - g;
      else audio.currentTime = g / 1000;
      show(g);
    }

    audio.addEventListener("error", () => { silent = true; });
    // A server that ignores range requests leaves the audio unseekable, and every
    // seek snaps back to zero. The whole file as a blob is always seekable.
    audio.addEventListener("loadedmetadata", async () => {
      const s = audio.seekable;
      if (audio.src.startsWith("blob:") || (s.length && s.end(s.length - 1) >= audio.duration - 0.5)) return;
      const blob = await (await fetch(audio.src)).blob();
      audio.src = URL.createObjectURL(blob);
      audio.currentTime = now / 1000;
      if (playing && !silent) audio.play().catch(() => {});
    });
    // Media keys and the browser's own media controls drive the audio directly.
    audio.addEventListener("play", () => { if (!playing) { setPlaying(true); loop(); } });
    audio.addEventListener("pause", () => { if (playing && !silent) setPlaying(false); });
    audio.addEventListener("ended", () => {
      if (!silent) { pause(); show(total); }
    });

    // ---------------------------------------------------------------- frames --
    frames.forEach((frame, i) => {
      frame.addEventListener("load", () => {
        scale(frame);
        if (i === current) show(now);
      });
    });
    new ResizeObserver(() => frames.forEach(scale)).observe(stage);

    // -------------------------------------------------------------- controls --
    const toggle = () => (playing ? pause() : play());
    const chapterStart = (k) => m.scenes[Math.max(0, Math.min(m.scenes.length - 1, k))].start;
    const prev = () =>
      seek(now - m.scenes[current].start > RESTART_GRACE ? chapterStart(current) : chapterStart(current - 1));
    const next = () => { if (current + 1 < m.scenes.length) seek(chapterStart(current + 1)); };

    overlay.addEventListener("click", play);
    stage.addEventListener("click", (e) => { if (e.target !== overlay && !overlay.contains(e.target)) toggle(); });
    playBtn.addEventListener("click", toggle);
    prevBtn.addEventListener("click", prev);
    nextBtn.addEventListener("click", next);
    fullBtn.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (player.requestFullscreen) player.requestFullscreen();
    });
    document.addEventListener("fullscreenchange", () => {
      root.classList.toggle("is-fullscreen", document.fullscreenElement === player);
    });

    const seekTo = (e) => {
      const r = bar.getBoundingClientRect();
      seek(((e.clientX - r.left) / r.width) * total);
    };
    bar.addEventListener("pointerdown", (e) => {
      bar.setPointerCapture(e.pointerId);
      seekTo(e);
      const move = (ev) => seekTo(ev);
      const up = () => {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
    });

    player.addEventListener("keydown", (e) => {
      const onButton = e.target instanceof HTMLButtonElement;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      switch (e.key) {
        case " ":
        case "k":
          if (onButton && e.key === " ") return;
          toggle();
          break;
        case "ArrowLeft": seek(now - SEEK_STEP); break;
        case "ArrowRight": seek(now + SEEK_STEP); break;
        case "PageUp": prev(); break;
        case "PageDown": next(); break;
        case "Home": seek(0); break;
        case "End": seek(total); break;
        default: return;
      }
      e.preventDefault();
    });

    if (transcript) {
      transcript.addEventListener("click", (e) => {
        const target = e.target.closest("[data-at]");
        if (!target) return;
        e.preventDefault();
        seek(+target.dataset.at);
        if (!playing) play();
      });
    }

    // A link to #t=<ms> opens the explainer at that instant, paused.
    const hash = /^#t=(\d+)$/.exec(location.hash);
    // The poster is the end of the first scene: by then its title has arrived.
    show(hash ? +hash[1] : m.scenes[0].start + m.scenes[0].duration - 1);
    if (hash) seek(+hash[1]);
  }

  function start() {
    document.querySelectorAll(".explainer[data-manifest]").forEach((root) => {
      mount(root).catch((err) => {
        console.error("explainer:", err);
        root.classList.add("explainer-failed");
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
