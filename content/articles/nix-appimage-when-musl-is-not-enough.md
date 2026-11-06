+++
date = '2026-11-05T15:03:58+01:00'
draft = false
title = 'nix-appimage: When musl is not enough'
tags = ['nix', 'rust']
+++

The static musl recipe from [GitHub Releases: A poor man's Nix binary cache][pmnbc] works because a
CLI's runtime is glibc plus a few libraries. Programs that depend on GTK or similar large,
complicated libraries don't compile well to static binaries.

[pmnbc]: /articles/poor-mans-nix-binary-cache/

[glimt][glimt] is such a program. Its binary is a thin wrapper around GTK and Wayland. The program
is tiny; the problem is everything the loader pulls in and everything GTK opens after it starts:

[glimt]: https://github.com/sshine/glimt

```console
$ readelf -d .glimt-wrapped | grep NEEDED
 0x0001 (NEEDED) Shared library: [libgtk4-layer-shell.so.0]
 0x0001 (NEEDED) Shared library: [libgtk-4.so.1]
 0x0001 (NEEDED) Shared library: [libgobject-2.0.so.0]
 0x0001 (NEEDED) Shared library: [libglib-2.0.so.0]
 0x0001 (NEEDED) Shared library: [libgcc_s.so.1]
 0x0001 (NEEDED) Shared library: [libm.so.6]
 0x0001 (NEEDED) Shared library: [libc.so.6]
 0x0001 (NEEDED) Shared library: [ld-linux-x86-64.so.2]
```

This list is even optimized by removing GStreamer, which pulls in `libgstplay-1.0.so.0`.

You can rebuild GTK, glib, pango, cairo, gdk-pixbuf and fontconfig with static linking, but it
wouldn't work out well. GTK opens gdk-pixbuf loaders and GIO modules with `dlopen` (where `dl` means
"dynamic linking"), reads GSettings schemas from `XDG_DATA_DIRS`, and asks fontconfig for fonts. A
static ELF contains none of those files, and the dynamic loader cannot `dlopen` a library that was
linked into the executable.

## tl;dr

- A GTK dashboard has a 897 MiB runtime closure, and most of the program is data and plugins that
  the loader and GTK open by path.
- An AppImage keeps the dynamic links and puts the whole closure in one file: 353 MiB for the first
  build, 110 MiB after removing GTK's GStreamer media backend, and 20 MiB after pruning the rest of
  the closure.
- The release still uses GitHub Releases, but this time the artifact is an AppImage rather than a
  static tarball.
- The AppImage needs unprivileged user namespaces. It runs on NixOS but fails on GitHub's Ubuntu
  runner until `kernel.apparmor_restrict_unprivileged_userns` is off, and the Nix cache will not
  save the expensive build if the smoke test fails.

## The bundle

An AppImage is an ELF runtime concatenated with a [squashfs][squashfs]. The runtime mounts the
squashfs and runs `AppRun`; the squashfs contains the program and the files it expects to find at
absolute paths. [`nix-appimage`][nai] builds one from a Nix package:

[squashfs]: https://www.kernel.org/doc/html/latest/filesystems/squashfs.html
[nai]: https://github.com/ralismark/nix-appimage

```console
$ nix bundle --bundler github:ralismark/nix-appimage .#glimt
$ ls -lhL glimt.AppImage
-r-xr-xr-x 1 root root 353M Jan  1  1970 glimt.AppImage
$ ./glimt.AppImage --version
glimt 0.2.1
```

`nix-appimage` uses user namespaces and a chroot to make the bundled closure appear at `/nix/store`.
That detail is what keeps the wrapper working: the wrapper sets `GDK_PIXBUF_MODULE_FILE`,
`GIO_EXTRA_MODULES` and `XDG_DATA_DIRS` to absolute store paths, and those paths have to resolve
inside the bundle. The executable itself stays dynamically linked.

The cost is that the bundle needs user namespaces on the host, and it cannot bundle a GPU driver.
OpenGL applications on a non-NixOS distribution may still need [nixGL][nixgl].

[nixgl]: https://github.com/nix-community/nixGL

![The dashboard rendered from the AppImage under a headless sway session](/img/glimt-dashboard.png)

## The sizes

The first AppImage was 353 MiB. `nix path-info -Sh` put the source build's runtime closure at
897 MiB, and GTK alone accounted for 874 MiB of it.

The largest branch was GStreamer. `gst-plugins-bad` has an 819 MiB closure, because GTK's media
backend pulls in the usual collection of codecs, PipeWire, OpenAL and ffmpeg. The dashboard plays no
media. Turning the backend off in GTK is one meson flag:

```nix
# nix/appimage.nix
gtk4 = prev.gtk4.overrideAttrs (old: {
  mesonFlags = (old.mesonFlags or [ ]) ++ [ "-Dmedia-gstreamer=disabled" ];
  buildInputs = builtins.filter (
    p: !(builtins.elem (p.pname or "") [ "gst-plugins-base" "gst-plugins-bad" ])
  ) old.buildInputs;
});
```

`gtk4-layer-shell` has to be rebuilt against that GTK, or its own reference drags the full GTK back
in next to the lean one. With that done, the `gtk4` closure dropped from 874 MiB to 271 MiB, and the
AppImage dropped to 110 MiB:

```console
$ ls -lh dist/glimt-v0.2.1-x86_64.AppImage
-r-xr-xr-x 1 sshine users 110M Nov  4 00:56 dist/glimt-v0.2.1-x86_64.AppImage
```

The remaining closure is dominated by other branches that a calendar does not need. `tinysparql`
(tracker) has a 167 MiB closure and feeds the file chooser's recent-file search. `cups` has a
119 MiB closure and exists for printing. Both can be disabled with `trackerSupport = false` and
`cupsSupport = false` if the application does not use them. The dashboard uses neither, so I
turned them off. That brought the image to 73 MiB.

## Let's get schwifty

I want to see how much smaller it can get.

After all, I could have just shipped an HTML page of a few kilobytes.

GTK's defaults assume a desktop. The dashboard is a Wayland layer-shell client: it never searches
recent files, prints, uses Vulkan, or serves a Broadway session. Turning those off is four flags
on the same override:

```nix
gtk4 = prev.gtk4.override {
  trackerSupport = false;
  cupsSupport = false;
  vulkanSupport = false;
  broadwaySupport = false;
};
```

Disabling Vulkan has one catch. nixpkgs adds `libdrm` to GTK's build inputs only when Vulkan is
enabled, but the Wayland DMA-BUF path checks for it regardless, so a plain `vulkanSupport = false`
fails in [meson]. Adding `libdrm` back to `buildInputs` in the `overrideAttrs` fixes it.

[meson]: https://mesonbuild.com/

I did not disable the X11 backend yet. nixpkgs builds `libepoxy` with EGL disabled when `x11Support
= false`, and GTK's Wayland code includes `epoxy/egl.h`; making that work means patching libepoxy as
well. The X11 libraries are a few megabytes, and the coupling looked worse than the size.

The wrapper was another source of GTK. `wrapGAppsHook4` is graphical by default, which adds
`librsvg` and `gtk3` so that SVG icons and the SVG gdk-pixbuf loader work. The dashboard draws its
own text. Overriding the hook with `isGraphical = false` removes both:

```nix
wrapGAppsHook4 = prev.wrapGAppsHook4.override { isGraphical = false; };
```

The biggest remaining item, then, is translations. A GNOME closure ships `.mo` catalogues for every
language for GLib, GTK, GSettings, iso-codes, XKB and gdk-pixbuf. The dashboard's own strings are
English and the calendar has no translated UI. Perhaps I should add translations. But then again,
I'm the only user of this piece of software. A small helper removes the catalogues from the release
copies:

```nix
withoutLocales = package: package.overrideAttrs (old: {
  postInstall = (old.postInstall or "") + ''
    rm -rf "$out/share/locale"
  '';
});
```

Applying that to a package makes nixpkgs rebuild its dependents against the trimmed copy, but only
if the override happens before GTK is evaluated. The release package set is therefore two
`extend`s: the first trims data, the second overrides GTK and takes `prev.gtk4`, which now already
points at the trimmed dependencies. `libxkbcommon` is rebuilt against the trimmed
`xkeyboard-config` in the first pass for the same reason.

GTK also carries emoji data and GObject introspection typelibs. The typelibs are for language
bindings loading GTK at runtime, but a Rust binary using the C ABI won't. The emoji resources are
only opened by the emoji chooser. Both go in the same `postInstall`. The GIR XML stays, because
`gtk4-layer-shell` scans `Gtk-4.0.gir` when it generates its own introspection data.

Rust emits a symbol table even in a release build with no debug info, and stdenv's default strip
flags are `-S -p`, which remove debug sections but keep `.symtab`. The binary was 17 MiB, of which
the symbol table was about 3 MiB. Setting `stripAllList = [ "bin" ];` on the crate makes the fixup
phase use `--strip-all`.

Finally, the squashfs was gzip-compressed by default. `nix-appimage` takes `squashfsArgs`, so
passing xz with the x86 BCJ filter saves another several megabytes. It costs build time and a
little startup time.

```nix
squashfsArgs = [ "-comp" "xz" "-Xbcj" "x86" "-Xdict-size" "100%" ];
```

Together, those steps took the image from 73 MiB to 37 MiB.

## The squashfs pass

The last pass works on the squashfs rather than on the Nix packages. `nix-appimage` packs each store
path whole, including files the program never opens. Extracting the image, deleting those files and
re-squashing is simpler than rebuilding glibc or GCC, and the store paths are private to the
AppImage:

```bash
offset=$(stat -Lc%s "$runtime")
unsquashfs -offset "$offset" -d tree glimt.AppImage
chmod -R u+w tree

find tree/nix/store -maxdepth 1 -type d -name '*-glibc-*' \
  -exec rm -rf '{}/share/i18n' '{}/share/locale' '{}/lib/gconv' \;

find tree/nix/store -maxdepth 1 -type d -name '*-gcc-*-lib' \
  -exec sh -c 'cd "$1/lib" && find . -maxdepth 1 \
    ! -name "libgcc_s.so*" -delete' _ {} \;

find tree -type f -name '*.so*' -exec strip --strip-unneeded {} +

mksquashfs tree out.AppImage -all-root -offset "$offset" \
  -comp xz -Xbcj x86 -Xdict-size 100%
dd if="$runtime" of=out.AppImage conv=notrunc
```

The GCC runtime keeps only `libgcc_s`; libstdc++ goes once libtiff's C++ bindings and graphite2's
test tool are removed. glibc keeps its `C.UTF-8` locale in `lib/locale`, but the locale sources,
translation catalogues and gconv modules go. Documentation, manual pages and GObject typelibs go
too. Finally, every shared object is stripped of `.symtab`, which stdenv leaves behind. That took
the image from 37 MiB to 29 MiB.

## Removing X11

The X11 libraries were the next branch. GTK itself can be built with `x11Support = false`, but
nixpkgs ties several dependencies to the same switch. `libglvnd` gets a `--disable-x11` build, so
it still provides EGL without GLX. `libepoxy` is the awkward one: nixpkgs disables EGL when X11 is
off, but GTK's Wayland backend includes `epoxy/egl.h`. The release builds a small EGL-only libepoxy
and points `LIBGL_PATH` at the EGL-only libglvnd.

`cairo`, `pango` and `libxkbcommon` are rebuilt without X11 as well. libxkbcommon also drops its
registry, tools and docs; the registry only pulls in libxml2 for `xkbcli`. The X11-free packages are
passed to GTK explicitly rather than overriding cairo and pango globally, because gtk3 and gjs are
still in the Rust toolchain's build closure and need the X11 versions.

That removed the X11 branch, but on its own it was worth only a couple of megabytes. The rest came
from dependencies that were still in the closure for other reasons.

## Trimming the dependency graph

The remaining dependency trims are smaller. GTK no longer gets `iso-codes`. `libtiff` is rebuilt
without WebP, LERC, libdeflate, xz and zstd; GTK only needs the TIFF C API. `freetype` is rebuilt
without brotli and bzip2, and `harfbuzz`, `fontconfig` and `cairo` point at that copy. A few
RPATH-only dependencies go in the post-processing pass.

The result is 20 MiB:

```console
$ ls -lh dist/glimt-v0.2.1-x86_64.AppImage
-r-xr-xr-x 1 sshine users 20M Nov  6 04:00 dist/glimt-v0.2.1-x86_64.AppImage
```

The current image is about a seventeenth of the first build.

## What's left

The largest remaining pieces are `gtk4` at about 13 MiB, the Rust binary at about 14 MiB, `glibc`
at about 6 MiB and `glib` at about 5 MiB. The toolkit and the language runtime dominate now.

Further reductions need a different kind of change. LTO across the Rust workspace could shrink the
binary, and patching GTK to drop its TIFF, JPEG and PNG loaders would remove a few more libraries.
Both cost build time and maintenance, and neither is a flag on an existing package.

## Alternatives to `nix-appimage`

[`nix-bundle`][nb] makes the same single-file idea without AppImage: the executable extracts the
closure to a temporary directory and runs it through namespaces. It starts slower and leaves the
extraction to the first run, but it avoids the AppImage runtime.

[nb]: https://github.com/matthewbauer/nix-bundle

[Flatpak][fp] and [Snap][snap] are the distribution-level answers. Both give you a sandbox, an
update channel and desktop integration, at the cost of another daemon and a build pipeline that
knows about runtimes and manifests. For a program that already has a Nix package and a release
workflow, an AppImage is a much smaller step.

[fp]: https://flatpak.org/
[snap]: https://snapcraft.io/

A plain tarball with the libraries beside the binary is the low-tech version. `patchelf` can rewrite
the rpath to `$ORIGIN/lib`, but that only fixes the ELF search path. GTK's data files, schemas and
loaders still need paths, and every one of them has to be rewritten or pointed at by a wrapper. At
that point the tarball has most of an AppImage and none of the packaging.

Static linking is the option that sounds best and is the least useful here. The dashboard is a GTK
application; the toolkit is the product, not an implementation detail that can be erased.

## Releasing it

The release pattern is the one from [the previous post][pmnbc]. `just dist` still builds the two
static musl clients and their checksums, and now calls `just appimage` for the dashboard. The
AppImage goes first because it is the artifact that has to run on another machine; the client is the
part that takes longest:

```just
# justfile
dist version: (check-version version)
    rm -rf dist && mkdir -p dist
    just appimage {{version}}
    just dist-client {{version}}
    @ls -1 dist
```

The workflow uploads the AppImage beside the tarballs:

```yaml
files: |
  dist/*.tar.gz
  dist/*.tar.gz.sha256
  dist/*.AppImage
  dist/*.AppImage.sha256
```

Consumers who want the release instead of a source build get `glimt-bin`, a `fetchurl` and a
`makeWrapper` around the AppImage, plus the static `glimtctl-bin`. The flake omits both on systems
with no matching artifact, the same way the CLI release does.

## The runner is not NixOS

The first release that carried the AppImage reached the smoke test and failed:

```console
$ ./dist/glimt-v0.3.0-x86_64.AppImage --version
./dist/glimt-v0.3.0-x86_64.AppImage: cannot write uid_map: Operation not permitted
```

Exit status 127. The message comes from `nix-appimage`'s `AppRun`, not from `glimt`. The same
wrapper runs on this NixOS machine; the v0.2.1 AppImage prints `glimt 0.2.1`. The host's
user-namespace policy is the difference.

Ubuntu 24.04 and later enable `kernel.apparmor_restrict_unprivileged_userns` by default. The
AppArmor profile allows `unshare(CLONE_NEWUSER)` but denies the write to `/proc/self/uid_map`, which
is what `nix-appimage` does before it mounts the bundled `/nix`. The GitHub runner image is
`ubuntu-26.04`, so the smoke test needs the restriction off:

```yaml
# .github/workflows/release.yml
- name: Allow unprivileged user namespaces for the AppImage
  run: |
    if [ -e /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]; then
      sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
    fi
```

That is a property of the test host, not of the artifact. A user on a default Ubuntu 24.04 install
will see the same error. The AppImage needs an AppArmor profile that grants `userns`, or the user
has to relax the restriction, or the bundle needs a loader that does not use user namespaces. The
release notes should say so.

## The cache that wasn't

The AppImage build is dominated by the X11-free GTK closure, and that closure is the long part of
the release. The first AppImage-only run took 55 minutes. I expected the Nix store cache to keep it.
It did not.

Two details of [cache-nix-action][cache-nix-action] explain why. Its post step is
`post-if: success()`, so a job that fails at the smoke test never saves anything. And a cache key is
immutable: when the primary key already exists, the action restores it and does not write the new
store paths back. The failed release never reached its post step. A later manual run then built the
same closure, but restored the key that the Rust CI job had already saved. The key existed, so the
action did not write the new store paths back. The 55 minutes of derivations were still lost.

[cache-nix-action]: https://github.com/sshine/glimt/blob/main/.github/workflows/release.yml

The fix is to put the long build in its own job and give it its own key:

```yaml
# .github/workflows/release.yml
appimage:
  runs-on: ubuntu-latest
  steps:
    # ...
    - uses: nix-community/cache-nix-action@...
      with:
        primary-key: nix-${{ runner.os }}-appimage-${{ hashFiles('**/*.nix', '**/flake.lock', '**/Cargo.lock') }}
        restore-prefixes-first-match: |
          nix-${{ runner.os }}-appimage-
          nix-${{ runner.os }}-
    - run: nix develop -c just appimage "${RELEASE_VERSION}"
    - uses: actions/upload-artifact@...
      with:
        name: appimage
        path: |
          dist/glimt-*-x86_64.AppImage
          dist/glimt-*-x86_64.AppImage.sha256
```

The `appimage` job succeeds as soon as the image is built, so its post step saves the closure even
if the smoke test in the next job fails. The next release restores the AppImage cache and only
rebuilds the parts that changed. The smoke test itself moves to a job that downloads the artifact:

```yaml
# .github/workflows/release.yml
release:
  needs: appimage
  steps:
    # ...
    - uses: actions/download-artifact@...
      with:
        name: appimage
        path: dist
    - run: |
        appimage="dist/glimt-${RELEASE_VERSION}-x86_64.AppImage"
        chmod +x "$appimage"
        "$appimage" --version
```

A manual `workflow_dispatch` can run just this path with `appimage_only=true`, so a change to the
wrapper does not wait for the static client.

The same command now prints:

```console
$ ./dist/glimt-v0.3.0-x86_64.AppImage --version
glimt 0.3.0
```

The image did not change between the failure and the success. The host policy did; the cache key is
what keeps the next build from paying for it again.
