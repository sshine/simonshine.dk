{ pkgs ? import <nixpkgs> {}
, theme ? pkgs.callPackage ./theme.nix {}
}:

pkgs.stdenv.mkDerivation {
  pname = "simonshine-dk";
  version = "0.1.0";

  src = pkgs.lib.cleanSource ./.;

  nativeBuildInputs = [ pkgs.hugo ];

  buildPhase = ''
    mkdir -p themes
    ln -s ${theme} themes/default
    hugo --minify
  '';

  installPhase = ''
    cp -r public $out
  '';

  meta = with pkgs.lib; {
    description = "The blog for https://simonshine.dk";
    homepage = "https://simonshine.dk";
    platforms = platforms.all;
  };
}
