{ lib, pkgs ? import <nixpkgs> {} }:

pkgs.stdenv.mkDerivation {
  pname = "hugo-theme-m10c";
  version = "8295ee8";

  src = pkgs.fetchFromGitHub {
    owner = "sshine";
    repo = "hugo-theme-m10c";
    rev = "forked-dev";
    sha256 = "sha256-V8M3mD+wOFm5pnp6ALLBI4Ank8HSSdvr6Cut3jXdZPQ=";
  };

  installPhase = ''
    mkdir -p $out
    cp -r * $out/
  '';
}
