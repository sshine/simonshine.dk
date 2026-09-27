# Playwright cut down to the headless Chromium shell.
#
# nixpkgs' playwright-test bakes the full browser set into its wrapper, so it
# keeps a runtime reference to Chromium, Firefox and WebKit no matter what
# PLAYWRIGHT_BROWSERS_PATH says at runtime. Retargeting it here keeps the
# closure to roughly a quarter of that.
#
# This exists for screenshots, not for testing: the site is static and has no
# behaviour worth asserting, but small CSS changes need looking at.
{ pkgs, withChromium ? false }:

let
  browsers = pkgs.playwright-driver.browsers.override {
    inherit withChromium;
    withFirefox = false;
    withWebkit = false;
  };
in
{
  inherit browsers;

  playwright-test = pkgs.playwright-test.overrideAttrs (old: {
    installPhase =
      builtins.replaceStrings [ "${pkgs.playwright-driver.browsers}" ] [ "${browsers}" ]
        old.installPhase;
  });
}
