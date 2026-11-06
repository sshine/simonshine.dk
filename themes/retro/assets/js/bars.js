// Replace each article's plain <hr> with one of the hand-drawn bar images.
// Shuffle a deck so a single article does not repeat a bar until it has used
// every one of them, then deal from the top.
const bars = [
  "bar-tentacles",
  "bar-stairs",
  "bar-zodiac",
  "bar-cosmic-foam",
  "bar-melting-eyes",
  "bar-cobwebs",
  "bar-cosmic-waves",
  "bar-coral-shells",
  "bar-spider",
  "bar-mushrooms",
  "bar-ocean-waves",
  "bar-starfield",
  "bar-skull-gears",
  "bar-scrolls",
  "bar-scythes",
  "bar-equations",
];

for (let i = bars.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [bars[i], bars[j]] = [bars[j], bars[i]];
}

document.querySelectorAll(".prose hr, .prose h2").forEach((el, i) => {
  const name = bars[i % bars.length];
  el.style.setProperty("--bar-image", `url("/img/bars/${name}.webp")`);
});
