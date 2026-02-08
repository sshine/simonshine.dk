{ pkgs ? import <nixpkgs> {} }:

pkgs.stdenv.mkDerivation {
  pname = "hugo-theme-m10c";
  version = "8295ee8";

  src = pkgs.fetchFromGitHub {
    owner = "vaga";
    repo = "hugo-theme-m10c";
    rev = "8295ee808a8166a7302b781895f018d9cba20157";
    sha256 = "12jvbikznzqjj9vjd1hiisb5lhw4hra6f0gkq1q84s0yq7axjgaw";
  };

  installPhase = ''
    mkdir -p $out
    cp -r * $out/
  '';
}
