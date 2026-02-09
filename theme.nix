{ lib, pkgs ? import <nixpkgs> {} }:

pkgs.stdenv.mkDerivation {
  pname = "hugo-theme-m10c";
  version = "8295ee8";

  src = pkgs.fetchFromGitHub {
    owner = "sshine";
    repo = "hugo-theme-m10c";
    rev = "feat/hovering-heading-anchor-links";
    sha256 = "BFwCbYj9K2k6UwYzmnX4sfZ9NjzOdfjUMdesOwdlUn8=";
  };

  installPhase = ''
    mkdir -p $out
    cp -r * $out/
  '';
}
