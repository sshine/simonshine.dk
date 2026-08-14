{ pkgs ? import <nixpkgs> {}
, theme ? null
}:

let
  themeName = (builtins.fromTOML (builtins.readFile ./hugo.toml)).theme;
in
pkgs.mkShellNoCC {
  packages = [
    pkgs.hugo
    pkgs.just
  ];

  shellHook = ''
    [ -f hugo.toml ] || hugo new site . --force

    ${pkgs.lib.optionalString (theme != null) ''
      mkdir -p themes
      ln -snf "${theme}" themes/${themeName}
    ''}
  '';
}
