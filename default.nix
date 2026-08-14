{ pkgs ? import <nixpkgs> {}
, theme ? null
}:

let
  inherit (pkgs) lib;

  # hugo.toml decides the theme. A theme vendored from another repo is symlinked
  # into themes/ under that name; an in-repo theme is already there.
  themeName = (builtins.fromTOML (builtins.readFile ./hugo.toml)).theme;
in
pkgs.stdenv.mkDerivation {
  pname = "simonshine-dk";
  version = "0.1.0";

  # The devshell symlinks a vendored theme into themes/, and the build makes its
  # own, so worktree symlinks there must not become part of the source.
  src = lib.cleanSourceWith {
    src = lib.cleanSource ./.;
    filter = path: type: !(type == "symlink" && baseNameOf (dirOf path) == "themes");
  };

  nativeBuildInputs = [ pkgs.hugo ];

  buildPhase = ''
    ${lib.optionalString (theme != null) ''
      mkdir -p themes
      ln -s ${theme} themes/${themeName}
    ''}
    hugo --minify
  '';

  installPhase = ''
    cp -r public $out
  '';

  meta = with lib; {
    description = "The blog for https://simonshine.dk";
    homepage = "https://simonshine.dk";
    platforms = platforms.all;
  };
}
