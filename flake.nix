{
  description = "The blog for https://simonshine.dk";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs = inputs@{ self, nixpkgs, flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      perSystem = { config, self', inputs', pkgs, system, ... }:
        let
          # The theme hugo.toml names lives in themes/ in-repo. To vendor it from
          # another repo again, point theme.nix at it and pass `inherit theme`.
          theme = pkgs.callPackage ./theme.nix {};
          site = pkgs.callPackage ./default.nix { };
          shell = pkgs.callPackage ./shell.nix { };
        in {
          devShells.default = shell;
          packages = {
            theme = theme;
            site = site;
            default = site;
          }
          # dockerTools only builds on Linux; CI (runs-on: nixos) pushes this.
          // nixpkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
            image = pkgs.callPackage ./image.nix { inherit site; };
          };
        };
    };
}
