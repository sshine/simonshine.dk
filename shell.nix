{ pkgs ? import <nixpkgs> {}
, theme ? pkgs.callPackage ./theme.nix {}
}:

pkgs.mkShellNoCC {
  packages = [
    pkgs.hugo
    pkgs.just
  ];

  shellHook = ''
    [ -f hugo.toml ] || hugo new site . --force

    mkdir -p themes
    ln -snf "${theme}" themes/default
  '';
}
