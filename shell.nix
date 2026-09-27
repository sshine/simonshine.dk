{ pkgs ? import <nixpkgs> {}
, theme ? null
}:

let
  themeName = (builtins.fromTOML (builtins.readFile ./hugo.toml)).theme;
  playwright = pkgs.callPackage ./playwright.nix { };
in
pkgs.mkShellNoCC {
  packages = [
    pkgs.hugo
    pkgs.just
    playwright.playwright-test
  ];

  PLAYWRIGHT_BROWSERS_PATH = "${playwright.browsers}";
  PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";

  shellHook = ''
    [ -f hugo.toml ] || hugo new site . --force

    ${pkgs.lib.optionalString (theme != null) ''
      mkdir -p themes
      ln -snf "${theme}" themes/${themeName}
    ''}
  '';
}
