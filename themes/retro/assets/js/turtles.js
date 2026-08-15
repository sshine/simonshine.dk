/* Turtles drawing the NixOS snowflake in the margins around the sheet.
   The turtle program is transcribed from content/articles/nixos-logo.md. */
(function () {
  "use strict";

  var MAX_TURTLES = 3;
  var WORKERS_MAX = 3; // arms of one flake drawn at once; must divide 6
  var SPEED = 220; // px of path per second
  var SPEED_JITTER = 0.35; // per worker, so a crew finishes raggedly
  var PEN_UP_MULT = 3; // pen-up travel is faster, so the turtle visibly hops
  var MIN_RADIUS = 30; // px, enclosing circle of a flake
  var MAX_RADIUS = 190;
  var SIZE_BIAS = 2; // >1 favours small flakes, so a big one is an event
  var GAP_MIN = 0.1; // gap/long; below ~0.09 the lambdas run into each other
  var GAP_MAX = 0.18;
  var MARGIN = 10; // px clearance from the sheet and the window edge
  var SPAWN_TRIES = 12;
  var SPAWN_DELAY = 900; // ms before a finished flake is replaced
  var HOLD_MS = 4000;
  var FADE_MS = 2500;
  var HEAD_DOT = true;
  var HEAD_R = 1.8;

  var SVG_NS = "http://www.w3.org/2000/svg";
  var DEG = Math.PI / 180;

  var sheet = document.querySelector(".sheet");
  if (!sheet || document.body.hasAttribute("data-no-turtles")) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* --- the turtle program ------------------------------------------------
     Ops are built at unit scale (long = 1) and multiplied by `long` as they
     are consumed, so one flake definition serves every size. Angles are
     clockwise-positive because the y axis points down. */

  function F(d) {
    return { t: "F", d: d };
  }
  function R(a) {
    return { t: "T", a: a };
  }
  function L(a) {
    return { t: "T", a: -a };
  }
  function P(down) {
    return { t: "P", down: down };
  }

  function lambdaOps(out, long, short) {
    out.push(
      P(true),
      F(long), R(120),
      F(short), R(60),
      F(short), L(120),
      F(short), R(60),
      F(short / 2), R(60),
      F(short / 2), R(60),
      F(short * 1.5), L(60),
      F(short), R(60),
      F(short), R(120),
      P(false)
    );
  }

  /* `arms` indexes where each of the 6 arms begins, plus a closing sentinel,
     so the loop can be handed out to several workers in one piece. */
  function flakeOps(gap, mirror) {
    var ops = [];
    var arms = [];
    var long = 1;
    var short = long / 4;
    for (var i = 0; i < 6; i++) {
      arms.push(ops.length);
      lambdaOps(ops, long, short);
      ops.push(F(short * 1.5), L(60), F(gap));
    }
    arms.push(ops.length);
    if (mirror) {
      for (var j = 0; j < ops.length; j++) {
        if (ops[j].t === "T") ops[j] = { t: "T", a: -ops[j].a };
      }
    }
    return { ops: ops, arms: arms };
  }

  /* Walk the ops once to find where the shape sits relative to the turtle's
     start, which is not its centre. The path closes on itself and has 6-fold
     symmetry, so the enclosing circle about that centre is the tightest
     rotation-independent bound there is -- radius 1 + gap at unit scale. */
  function measure(flake) {
    var ops = flake.ops;
    var x = 0, y = 0, a = 0;
    var minx = 0, maxx = 0, miny = 0, maxy = 0;
    var pts = [[0, 0]];
    var states = [];
    var arm = 0;
    for (var i = 0; i < ops.length; i++) {
      if (arm < 6 && flake.arms[arm] === i) {
        states.push({ x: x, y: y, th: a });
        arm++;
      }
      var op = ops[i];
      if (op.t === "T") { a += op.a; continue; }
      if (op.t !== "F") continue;
      x += op.d * Math.cos(a * DEG);
      y += op.d * Math.sin(a * DEG);
      pts.push([x, y]);
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
    var cx = (minx + maxx) / 2;
    var cy = (miny + maxy) / 2;
    var r = 0;
    for (var j = 0; j < pts.length; j++) {
      var d = Math.hypot(pts[j][0] - cx, pts[j][1] - cy);
      if (d > r) r = d;
    }
    return { cx: cx, cy: cy, r: r, states: states };
  }

  /* --- placement ---------------------------------------------------------
     Only the left and right gutters are candidates. .page is a stretch flex
     container with min-height:100vh, so the sheet always spans the full
     viewport height and there is never a strip above or below it. */
  function gutters() {
    var box = sheet.getBoundingClientRect();
    var w = document.documentElement.clientWidth;
    var h = document.documentElement.clientHeight;
    var span = 2 * (MIN_RADIUS + MARGIN);
    return [
      { x: 0, y: 0, w: box.left, h: h },
      { x: box.right, y: 0, w: w - box.right, h: h }
    ].filter(function (g) {
      return g.w >= span && g.h >= span;
    });
  }

  function pickRegion(regions) {
    var total = 0;
    var i;
    for (i = 0; i < regions.length; i++) total += regions[i].w * regions[i].h;
    var pick = Math.random() * total;
    for (i = 0; i < regions.length; i++) {
      pick -= regions[i].w * regions[i].h;
      if (pick <= 0) return regions[i];
    }
    return regions[regions.length - 1];
  }

  /* --- turtles ----------------------------------------------------------- */

  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "turtles");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("role", "presentation");
  svg.setAttribute("focusable", "false");
  document.body.appendChild(svg);

  var live = [];
  var nextSpawn = 0;
  var raf = null;
  var last = 0;

  function spawn() {
    var regions = gutters();
    if (!regions.length) return null;

    for (var attempt = 0; attempt < SPAWN_TRIES; attempt++) {
      var reg = pickRegion(regions);
      var fit = Math.min(reg.w, reg.h) / 2 - MARGIN;
      if (fit < MIN_RADIUS) continue;

      var hi = Math.min(fit, MAX_RADIUS);
      var rad = MIN_RADIUS + (hi - MIN_RADIUS) * Math.pow(Math.random(), SIZE_BIAS);
      var cx = reg.x + rad + MARGIN + Math.random() * (reg.w - 2 * (rad + MARGIN));
      var cy = reg.y + rad + MARGIN + Math.random() * (reg.h - 2 * (rad + MARGIN));

      var clash = live.some(function (o) {
        return Math.hypot(o.cx - cx, o.cy - cy) < o.rad + rad;
      });
      if (clash) continue;

      var gap = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
      var flake = flakeOps(gap, Math.random() < 0.5);
      var unit = measure(flake);
      var scale = rad / unit.r;

      /* The shape rotates about the turtle's start point, so to land its
         centre on (cx, cy) we walk the centre offset back out again. */
      var th = Math.random() * 60; // 6-fold symmetry: 60 degrees is the full period
      var c = Math.cos(th * DEG);
      var s = Math.sin(th * DEG);
      var sx = cx - scale * (unit.cx * c - unit.cy * s);
      var sy = cy - scale * (unit.cx * s + unit.cy * c);

      var g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "flake");
      svg.appendChild(g);

      /* Arms are handed out in contiguous blocks, so each worker walks an
         unbroken run of the loop. Round-robin would make them teleport. */
      var crew = 1 + Math.floor(Math.random() * WORKERS_MAX);
      var per = 6 / crew;
      var workers = [];
      for (var k = 0; k < crew; k++) {
        var seed = unit.states[k * per];
        var path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("class", "trail");
        g.appendChild(path);
        var head = null;
        if (HEAD_DOT && !reduce.matches) {
          head = document.createElementNS(SVG_NS, "circle");
          head.setAttribute("class", "head");
          head.setAttribute("r", HEAD_R);
          g.appendChild(head);
        }
        workers.push({
          path: path, head: head,
          i: flake.arms[k * per], end: flake.arms[(k + 1) * per],
          rem: null, pen: false, d: "", scale: scale,
          x: sx + scale * (seed.x * c - seed.y * s),
          y: sy + scale * (seed.x * s + seed.y * c),
          th: th + seed.th,
          speed: SPEED * (1 + (Math.random() * 2 - 1) * SPEED_JITTER),
          done: false
        });
      }

      var t = {
        ops: flake.ops, g: g, workers: workers,
        cx: cx, cy: cy, rad: rad, done: 0
      };
      live.push(t);
      return t;
    }
    return null;
  }

  function r1(v) {
    return Math.round(v * 10) / 10;
  }

  function step(ops, t, budget) {
    while (t.i < t.end && budget > 1e-6) {
      var op = ops[t.i];
      if (op.t === "T") { t.th += op.a; t.i++; continue; }
      if (op.t === "P") {
        t.pen = op.down;
        if (op.down) t.d += " M" + r1(t.x) + " " + r1(t.y);
        t.i++;
        continue;
      }
      if (t.rem === null) t.rem = op.d * t.scale;
      if (t.rem <= 1e-9) { t.i++; t.rem = null; continue; }

      var move = Math.min(t.rem, budget * (t.pen ? 1 : PEN_UP_MULT));
      var rad = t.th * DEG;
      t.x += move * Math.cos(rad);
      t.y += move * Math.sin(rad);
      t.rem -= move;
      budget -= move / (t.pen ? 1 : PEN_UP_MULT);
      if (t.rem <= 1e-9) {
        t.i++;
        t.rem = null;
        if (t.pen) t.d += " L" + r1(t.x) + " " + r1(t.y);
      }
    }

    t.path.setAttribute("d", t.pen ? t.d + " L" + r1(t.x) + " " + r1(t.y) : t.d);
    if (t.head) {
      t.head.setAttribute("cx", r1(t.x));
      t.head.setAttribute("cy", r1(t.y));
    }
    return t.i >= t.end;
  }

  function drop(t) {
    var i = live.indexOf(t);
    if (i >= 0) live.splice(i, 1);
    if (t.g.parentNode) svg.removeChild(t.g);
  }

  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    var drawing = 0;
    for (var i = live.length - 1; i >= 0; i--) {
      var t = live[i];
      if (!t.done) {
        drawing++;
        var idle = true;
        for (var k = 0; k < t.workers.length; k++) {
          var w = t.workers[k];
          if (w.done) continue;
          if (step(t.ops, w, dt * w.speed)) {
            w.done = true;
            if (w.head) { t.g.removeChild(w.head); w.head = null; }
          } else idle = false;
        }
        if (idle) t.done = now;
      } else if (now - t.done > HOLD_MS + FADE_MS) {
        drop(t);
      } else if (now - t.done > HOLD_MS && t.g.style.opacity !== "0") {
        t.g.style.transition = "opacity " + FADE_MS + "ms linear";
        t.g.style.opacity = "0";
      }
    }

    if (drawing < MAX_TURTLES && now >= nextSpawn) {
      if (spawn()) nextSpawn = now + SPAWN_DELAY * (0.5 + Math.random());
      else nextSpawn = now + SPAWN_DELAY;
    }

    raf = window.requestAnimationFrame(frame);
  }

  function start() {
    if (raf !== null) return;
    last = window.performance.now();
    raf = window.requestAnimationFrame(frame);
  }

  function stop() {
    if (raf === null) return;
    window.cancelAnimationFrame(raf);
    raf = null;
  }

  function clear() {
    live.length = 0;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  /* Without motion, draw a still set once and leave it there. */
  function still() {
    clear();
    for (var i = 0; i < MAX_TURTLES; i++) {
      var t = spawn();
      if (!t) continue;
      for (var k = 0; k < t.workers.length; k++) step(t.ops, t.workers[k], Infinity);
      t.done = 1;
    }
  }

  function reset() {
    stop();
    clear();
    if (reduce.matches) still();
    else start();
  }

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(reset, 150);
  });

  /* A flake half-covered by the sheet after a resize looks broken, and rAF
     timestamps stall while hidden, so both cases restart from scratch. */
  document.addEventListener("visibilitychange", function () {
    if (reduce.matches) return;
    if (document.hidden) stop();
    else start();
  });

  if (reduce.addEventListener) reduce.addEventListener("change", reset);

  reset();
})();
