+++
date = '2026-01-13T16:20:48+01:00'
draft = false
title = 'Using NixOS for Exam Computers'
tags = ['nix']
+++

I used NixOS to define two exam computers for a programming exam.

- One in a presentation room with an examiner and a censor, connected to a projector.
- Another one in an adjacent preparation room, just connected to the internet.

Both computers had the same software development environments, and a system user for each student.
The presentation computer was connected to a projector with screen mirroring. Some syncing of files
was necessary between the two  computers. Both computers needed various exam task descriptions on
disk.

## The Scene: Live-coding exams with preparation

If you're less interested in the motivation, and just want to read code, you can skip to:

- [The Execution: Preconfigured NixOS Machines](#the-execution-preconfigured-nixos-machines)

I have used NixOS as my primary Linux distro for three years.

I have also been teaching Computer Science for almost two years.

Most recently I inherited two elective courses with some rather peculiar exam structures. One of
them was a course called "[Low Level C](https://katalog.kea.dk/course/3050456/2025-2026)" and was
originally a course focusing on low-levelness in several ways, including C on embedded MCUs.

The teacher who had defined them, [Peter Lind](https://www.youtube.com/@peterlinddk), was quite
experimental, and taking over his courses I learned a lot from his evaluations of the course and exam
structures. For example, with only 3.5 hours of classroom activity per week and low out-of-class
activity, soldering was not a good learning goal. So it's better to focus on low-levelness in the
sense of bitwise manipulation, memory management, assembly programming, pointer arithmetic, and so
on.

I'll focus on the exam here, though: 20 minutes of individual oral examination (live-coding,
conversation) with **20 minutes of preparation**, "**all aids are permitted**". One programming task
and one theoretical subject for discussion. I'll explain why those two conditions are problematic
separate and in combination:

1. 20 minutes of preparation makes execution difficult: You need to book two rooms next to each
   other, and you need to cycle between the rooms in lockstep, having one student in prep while
   another is presenting.

   Without preparation you can catch up for lost time by shortening the voting time between
   students, but with prep and presentation working in lockstep you can almost only lose time. Some
   students are granted extra time during exam because of handicaps or other special conditions.

   Moving students computers between rooms steals several minutes every time, connecting and
   disconnecting chargers when batteries are sub-optimal, and constantly struggling with HDMI
   cables.
2. All aids being permitted speaks, of course, of the elephant in the room: AI. AI in programming
   comes in two shapes for students in 2024-2026: Copy-pasting from ChatGPT, and using IntelliJ
   auto-completion, which will let you just hit Enter to complete what's probably the program you
   want.

   Computer Science students at business academy level in Denmark still don't use agentic coding
   (Claude Code, GitHub Copilot, Codex CLI, Cursor, etc.) Presumably because many of them cost money
   or they're just not explorative.

   Aids also means notes which today are always on the student's own computer. So they're
   technically allowed to bring their own computer, since **all aids are permitted**.
3. Preparation + allowing AI means students can essentially code up a finished solution to any
   problem you give them. Allowing them to prepare doesn't really matter that much, it gives them a
   chance to "warm up", but however far they get, they'll just continue to live-code from there.

   So really, starting from scratch is probably easier, since they'll show more scaffolding
   (creation of files and filling out basic structure) than advanced refactoring. Preparing helps to
   overcome some uninteresting scaffolding.

Asking students to live-code during their presentation reveals their actual skills. There really is
no problem in assessing a student's programming ability as long as you watch them do it. But you
need to ask them to disable certain amounts of auto-completion, and those might have hindered their
learning during the entire semester without you knowing it.

## The Idea: Control the Environment

Every Computer Science exam at [EK](https://ek.dk) is more or less the same: Student comes in, draws
a subject at random from a known set of subjects, and live-demonstrates capability and knowledge
within that subject, examiners vote and give the student a grade. Some variation occurs, but that's
the most common template.

When my censors heard of my format, their immediate thought is: We must limit their access to AI.

And this setup does allow that, since you can restrict the computer in a way that you cannot
restrict internet access in modern environment: Preventing hot spots from appearing, and monitoring
if students are connected, and if so, what they are connected to, is Sisyphean.

But since **all aids are allowed**, that's not the actual purpose: The purpose is to minimize
waiting when switching between students. In practice I did save some time. Students did bring their
computer to the preparation for notes and AI access. They could have used AI on the exam computer,
but authenticating steals precious minutes.

## The Execution: Preconfigured NixOS Machines

Let's get schwifty!

I borrowed 2 Lenovo ThinkPads from the school's IT department and proceded to install NixOS on them
using the [graphical NixOS installer](https://nixos.org/download/) flashed to a USB stick. I really
wanted to experiment with custom USB installers, enabling flakes by default, and syncing the shared
components remotely.

But I had one day to execute, and I only needed two computers over two days. So I opted for another
bootstrap process, since it was the fastest for me and gave credibility to this blog post: How do
you actually do this from scratch without having already done it?

I picked GNOME as the Desktop Environment and simply wiped the disk. My only interaction with
Microsoft Windows is deleting its partition table once in a while, but it still brings me pleasure
every time.

## Design Goals

- I'd like to start from scratch, not rely on a complex flake setup, and only introduce complexity when it's necessary.
- Each student (listed in a JSON file) should have isolated, homogenous environments with the same tools installed.
- Students should have access to the school network without spending time authenticating, and without me needing to interface with Active Directory.
- The desktop environment should be simple and recognisable for Windows and MacOS users. (No tiling window manager experience required.)
- It should be possible to sync work between the preparation computer and the presentation computer.
- Besides a development environment, the student should have fast access to exam text material.
- It should be possible for me to reach the machines from each other and from my machine if I need to fix anything during the exam.

## A template

To begin working on the system from within itself, I create a basic working environment. Mind you,
this is not my personal development setup; one goal is to bootstrap from scratch. Since I want to
make a lot of GNOME UX changes via `dconf`, I'm going to use Claude Code to fast-forward the many
options I don't know the names of.

```nix
{ pkgs, ... }: {
  users.users.ek = {
    isNormalUser = true;
    description = "EK";
    extraGroups = [ "networkmanager" "wheel" ];
  };

  programs.firefox.enable = true;
  nixpkgs.config.allowUnfree = true;

  environment.systemPackages = with pkgs; [
    neovim
    git
    just
    claude-code
  ];

  services.openssh.enable = true;
}
```

<!--

I want to add a system user for each student based on a JSON file, and I want them to have wifi access:

```diff
@@ -1,8 +1,25 @@
-{ pkgs, ... }: {
-  users.users.ek = {
-    isNormalUser = true;
-    description = "EK";
-    extraGroups = [ "networkmanager" "wheel" ];
+{ pkgs, ... }:
+let
+  students = builtins.fromJSON (builtins.readFile ./llc.json);
+
+  createUser = student: {
+    name = student.id;
+    value = {
+      isNormalUser = true;
+      description = student.name;
+      extraGroups = [ "networkmanager" ];
+    };
+  };
+
+  studentUsers = builtins.listToAttrs (map createUser students);
+in
+{
+  users.users = studentUsers // {
+    ek = {
+      isNormalUser = true;
+      description = "EK";
+      extraGroups = [ "networkmanager" "wheel" ];
+    };
   };
```

For simplicity, I'll give students a deterministic password; they can technically log in as each
other, but they won't have time, and the time won't be well spent. As a principle I might like to
improve this part, but in practice I like not having to distribute a password:

```diff
@@ -8,6 +8,7 @@ let
       isNormalUser = true;
       description = student.name;
       extraGroups = [ "networkmanager" ];
+      initialPassword = builtins.substring 0 2 student.id;
     };
   };
```

Then comes the development environment they need for programming:

```diff
@@ -32,6 +31,11 @@ in
     just
     claude-code
+    jetbrains.clion
+    gcc
+    cmake
+    gnumake
   ];
```

We use JetBrains CLion because the students are used to IntelliJ and because it comes with most
things working together by default. It's what the students are most comfortable with, and it comes
with some annoyances: the first time the system user starts CLion, you have to activate the
software, pick a license and continue. This can be automated with managing dotfiles, but it's a
tedious layer of complexity that doesn't occur in non-commercialized FOSS IDEs.

Next is wifi access; here's a hotspot named Internet with the password internet:

```diff
+  networking.networkmanager.ensureProfiles = {
+    profiles = {
+      Internet = {
+        connection = {
+          id = "Internet";
+          type = "wifi";
+          autoconnect = true;
+        };
+        wifi = {
+          mode = "infrastructure";
+          ssid = "Internet";
+        };
+        wifi-security = {
+          key-mgmt = "wpa-psk";
+          psk = "internet";
+        };
+        ipv4.method = "auto";
+        ipv6.method = "auto";
+      };
+    };
+  };
```

And theeen... I realize I need to connect to multiple wifis, so I'll refactor this providing a helper function:

```diff
@@ -1,8 +1,6 @@
 { pkgs, ... }:
 let
-  students = builtins.fromJSON (builtins.readFile ./llc.json);
-
-  createUser = student: {
+  mkUser = student: {
     name = student.id;
     value = {
       isNormalUser = true;
@@ -12,7 +10,40 @@ let
     };
   };
 
-  studentUsers = builtins.listToAttrs (map createUser students);
+  students = builtins.fromJSON (builtins.readFile ./llc.json);
+  studentUsers = builtins.listToAttrs (map mkUser students);
+
+  mkOpenWifi = ssid: {
+    connection = {
+      id = ssid;
+      type = "wifi";
+      autoconnect = true;
+    };
+    wifi = {
+      mode = "infrastructure";
+      ssid = ssid;
+    };
+    ipv4.method = "auto";
+    ipv6.method = "auto";
+  };
+
+  mkWifi = ssid: psk: mkOpenWifi ssid // {
+    wifi-security = {
+      key-mgmt = "wpa-psk";
+      psk = psk;
+    };
+  };
 in
 {
   users.users = studentUsers // {
@@ -24,29 +55,9 @@ in
   };
 
   networking.networkmanager.ensureProfiles = {
-    profiles = {
-      Internet = {
-        connection = {
-          id = "Internet";
-          type = "wifi";
-          autoconnect = true;
-        };
-        wifi = {
-          mode = "infrastructure";
-          ssid = "Internet";
-        };
-        wifi-security = {
-          key-mgmt = "wpa-psk";
-          psk = "internet";
-        };
-        ipv4 = {
-          method = "auto";
-        };
-        ipv6 = {
-          method = "auto";
-        };
-      };
-    };
+    profiles.Internet = mkWifi "Internet" "internet";
+    profiles.Hotspot = mkWifi "Hotspot" "internet";
+    profiles.EK-PUBLIC = mkOpenWifi "EK-PUBLIC";
   };
 
   nixpkgs.config.allowUnfree = true;
```

## Start programs on login

Since I don't want my students to get confused about how to start programs, I'm starting the three
tools they might use: A terminal, an IDE, and a web browser:

```diff
@@ -62,7 +62,33 @@ in
     cmake
     gnumake
     firefox
+    ghostty
   ];
 
   services.openssh.enable = true;
+
+  # Autostart applications for all users
+  environment.etc."xdg/autostart/ghostty.desktop".text = ''
+    [Desktop Entry]
+    Type=Application
+    Name=Ghostty
+    Exec=ghostty
+    X-GNOME-Autostart-enabled=true
+  '';
+
+  environment.etc."xdg/autostart/clion.desktop".text = ''
+    [Desktop Entry]
+    Type=Application
+    Name=CLion
+    Exec=clion
+    X-GNOME-Autostart-enabled=true
+  '';
+
+  environment.etc."xdg/autostart/firefox.desktop".text = ''
+    [Desktop Entry]
+    Type=Application
+    Name=Firefox
+    Exec=firefox
+    X-GNOME-Autostart-enabled=true
+  '';
 }
```

You can feel the vibe-code here, because there's a lot of repeating myself that I'd like to factor out.

## Managing GNOME with dconf

In Ana Hobden's [Declarative GNOME configuration with NixOS][gnome-nix] you can learn to tweak your
GNOME exactly like you want and save these tweaks: Basically, anything you modify in a settings menu
can be saved to your Nix configuration, you just have to know the right config setting. Claude Code
can help with that.

Since the preferred way to install home-manager is using flakes, and I haven't yet introduced them,
I opted to stick without flakes for now. I want to know when I really need them, and there really is
a way to install home-manager without.

I also wanted to avoid home-manager entirely, but since GNOME's settings are stored in ~/.config, I
need something like home-manager. There are more modern alternatives to home-manager that I'd like
to explore, but I'm trying to keep things conventional here.

```diff
@@ -4,6 +4,7 @@
   imports = [
       ./hardware-configuration.nix
       ./low-level-c-exam.nix
+      ./home-manager.nix
   ];
 
   boot.loader.systemd-boot.enable = true;
@@ -40,6 +41,9 @@
     alsa.support32Bit = true;
     pulse.enable = true;
   };
+
+  programs.dconf.enable = true;
+
   system.stateVersion = "25.11";
 
 }

@@ -63,7 +63,7 @@ in
   nixpkgs.config.allowUnfree = true;
 
   environment.systemPackages = with pkgs; [
     neovim
     git
     just
     claude-code
@@ -74,6 +74,7 @@ in
     gnumake
     firefox
     ghostty
+    gnomeExtensions.dash-to-dock
   ];
 
   services.openssh.enable = true;
```

As for home-manager itself, the first thing I'd like to specifically enable is a plugin for GNOME
called [Dash to Dock](https://extensions.gnome.org/extension/307/dash-to-dock/) converting GNOME's
so-called dashbar into a more conventional dock, like MacOS'es. The difference is: GNOME's dashbar
will only reappear when you click the Win/Super key, and a dashbar will appear when you move the
mouse down into the general area, and in a lot of other cases.

```diff
@@ -0,0 +1,42 @@
+{ config, pkgs, ... }:
+
+let
+  home-manager = builtins.fetchTarball {
+    url = "https://github.com/nix-community/home-manager/archive/release-25.11.tar.gz";
+  };
+  students = builtins.fromJSON (builtins.readFile ./llc.json);
+in
+{
+  imports = [ (import "${home-manager}/nixos") ];
+
+  home-manager = {
+    useGlobalPkgs = true;
+    useUserPackages = true;
+
+    sharedModules = [{
+      home.stateVersion = "25.11";
+
+      dconf.settings = {
+        "org/gnome/shell" = {
+          enabled-extensions = [ "dash-to-dock@micheleg.github.com" ];
+        };
+
+        "org/gnome/shell/extensions/dash-to-dock" = {
+          dock-position = "BOTTOM";
+          dock-fixed = true;
+          autohide = false;
+          intellihide = false;
+        };
+
+        "org/gnome/desktop/wm/preferences" = {
+          button-layout = ":minimize,maximize,close";
+        };
+      };
+    }];
+
+    users = builtins.listToAttrs (
+      (map (student: { name = student.id; value = {}; }) students)
+      ++ [{ name = "ek"; value = {}; }]
+    );
+  };
+}
```

[gnome-nix]: https://hoverbear.org/blog/declarative-gnome-configuration-in-nixos/

-->

## Restructuring the NixOS configuration

When starting from scratch, NixOS gives you a configuration.nix and a hardware-configuration.nix.
The comments in hardware-configuration.nix suggest that you should never edit this file, since it
might get overwritten when you renew the hardware configuration. I have still not seen that happen
on my NixOS machines.

I'm going to break with this paradigm and introduce:

1. configuration.nix: Generic configuration shared between machines (I have two, remember)
2. exam-configuration.nix: Specific configuration for exam computers, shared between machines
3. machines/*.nix: Machine-specific configuration that is a mixture of hardware-specific
   configuration, unique properties like partition table UUIDs that are different across, and
   specific custom configuration parameters that enable custom NixOS modules.

Here is the shared configuration.nix, where I've copied over the parts from hardware-configuration.nix 
that is going to repeat on my two machines:

```nix
{ lib, config, pkgs, modulesPath, ... }:
{
  imports = [
      (modulesPath + "/installer/scan/not-detected.nix")
      ./exam-configuration.nix
  ];

  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  networking.networkmanager.enable = true;
  time.timeZone = "Europe/Copenhagen";
  i18n.defaultLocale = "en_DK.UTF-8";
  i18n.extraLocaleSettings = {
    LC_ADDRESS = "da_DK.UTF-8";
    LC_IDENTIFICATION = "da_DK.UTF-8";
    LC_MEASUREMENT = "da_DK.UTF-8";
    LC_MONETARY = "da_DK.UTF-8";
    LC_NAME = "da_DK.UTF-8";
    LC_NUMERIC = "da_DK.UTF-8";
    LC_PAPER = "da_DK.UTF-8";
    LC_TELEPHONE = "da_DK.UTF-8";
    LC_TIME = "da_DK.UTF-8";
  };
  services.xserver.enable = true;
  services.displayManager.gdm.enable = true;
  services.desktopManager.gnome.enable = true;
  services.xserver.xkb = {
    layout = "dk";
    variant = "";
  };
  console.keyMap = "dk-latin1";
  services.printing.enable = true;
  services.pulseaudio.enable = false;
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    alsa.support32Bit = true;
    pulse.enable = true;
  };

  programs.dconf.enable = true;

  # Enable flakes
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  system.stateVersion = "25.11";

  # hardware-configuration.nix commonalities
  boot.initrd.availableKernelModules = [ "xhci_pci" "nvme" "usb_storage" "sd_mod" "rtsx_pci_sdmmc" ];
  boot.initrd.kernelModules = [ ];
  boot.kernelModules = [ "kvm-intel" ];
  boot.extraModulePackages = [ ];
  nixpkgs.hostPlatform = lib.mkDefault "x86_64-linux";
  hardware.cpu.intel.updateMicrocode = lib.mkDefault config.hardware.enableRedistributableFirmware;
}
```

And yes, I did enable flakes at this point. I'll explain why I finally caved: Deploying this
configuration on two machines, I need some modules to be different. Without flakes there is no
obvious convention for having a multi-machine configuration. Any mechanism for enabling some modules
and not others seems very custom compared to flake.nix'es convention:

```nix
{
  description = "Exam machines NixOS configuration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    home-manager.url = "github:nix-community/home-manager/release-25.11";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, home-manager }: {
    nixosConfigurations = {
      exam1 = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          ./configuration.nix
          ./machines/exam1.nix
          home-manager.nixosModules.home-manager
        ];
      };

      exam2 = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          ./configuration.nix
          ./machines/exam2.nix
          home-manager.nixosModules.home-manager
        ];
      };
    };
  };
}
```

That's it, I really just want to be able to switch configuration and not accidentally refer to the
wrong one.

It seems simple, but I just don't know a better way.

I'll just make it extra easy for me using this justfile:

```justfile
default:
  @just --list

# Build and switch to a machine configuration (defaults to current hostname)
switch machine=`uname -n`:
  sudo nixos-rebuild switch --flake .#{{machine}}
```

Flakes solve a lot of different problems, so this was an exercise in finding something that they
solve uniquely.

Let me know if there's a standardised way to deploy the same configuration to multiple machines
without flakes.

## The final exam configuration

I find it confusing that home-manager's configuration lives in its own file and not as part of the
system configuration. It has its own little namespace where regular NixOS things don't work. I try
to avoid this by embedding home-manager into a regular NixOS module inside a lambda.

Let me iterate what features are added here:

- Icons for exam-related programs are pinned to the dock
- The dock auto-hides in various situations (maximized programs, etc.)
- The menubar has minimize, maximize and close: GNOME normally only has close.
- Battery life is shown; the support desk could only provide a single cable, and while that was more
  than enough for the good batteries inside the laptops, it was less anxious to me if I could
  monitor the batteries and move the charger to the other laptop during lunch break.
- Disable suspend on idle: This is normally sensible in office environments, but I'd really prefer
  to avoid suspend during exams.
- Add machines to a Tailscale VPN for ease of deployment via SSH of the shared configuration file.

```nix
{ config, pkgs, ... }:

let
  # Student data
  students = builtins.fromJSON (builtins.readFile ./llc.json);

  # User creation helper
  mkUser = student: {
    name = student.id;
    value = {
      isNormalUser = true;
      description = student.id;
      extraGroups = [ "networkmanager" "video" ];
      initialPassword = builtins.substring 0 2 student.id;
    };
  };

  studentUsers = builtins.listToAttrs (map mkUser students);

  # WiFi configuration helpers
  mkOpenWifi = ssid: {
    connection.id = ssid;
    connection.type = "wifi";
    connection.autoconnect = true;
    wifi.mode = "infrastructure";
    wifi.ssid = ssid;
    ipv4.method = "auto";
    ipv6.method = "auto";
  };

  mkWifi = ssid: psk: mkOpenWifi ssid // {
    wifi-security.key-mgmt = "wpa-psk";
    wifi-security.psk = "psk";
  };
in
{
  # User configuration
  users.users = studentUsers // {
    ek = {
      isNormalUser = true;
      description = "EK";
      extraGroups = [ "networkmanager" "wheel" ];
    };
  };

  # Home-manager configuration
  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;

    sharedModules = [{
      home.stateVersion = "25.11";

      home.packages = with pkgs; [
        gnomeExtensions.dash-to-dock
      ];

      dconf.settings = {
        # Pin icons to dock
        "org/gnome/shell" = {
          enabled-extensions = [ "dash-to-dock@micxgx.gmail.com" ];
          favorite-apps = [
            "org.gnome.Nautilus.desktop"
            "com.mitchellh.ghostty.desktop"
            "firefox.desktop"
            "clion.desktop"
            "rust-rover.desktop"
          ];
        };

        # Hide dock when programs are maximized
        "org/gnome/shell/extensions/dash-to-dock" = {
          dock-position = "BOTTOM";
          dock-fixed = false;
          autohide = true;
          intellihide = true;
          multi-monitor = true;
        };

        # Provide minimize/maximize icons next to the close "X" icon
        "org/gnome/desktop/wm/preferences" = {
          button-layout = ":minimize,maximize,close";
        };

        # Show battery percentage
        "org/gnome/desktop/interface" = {
          show-battery-percentage = true;
        };

        # Disable suspend on battery and off battery
        "org/gnome/settings-daemon/plugins/power" = {
          sleep-inactive-ac-type = "nothing";
          sleep-inactive-battery-type = "nothing";
        };

        # Disable screen lock and screen blanking
        "org/gnome/desktop/screensaver" = {
          lock-enabled = false;
        };

        "org/gnome/desktop/session" = {
          idle-delay = 0;
        };
      };
    }];

    users = builtins.listToAttrs (
      (map (student: { name = student.id; value = {}; }) students)
      ++ [{ name = "ek"; value = {}; }]
    );
  };

  # Network configuration
  networking.networkmanager.ensureProfiles = {
    profiles.Internet = mkWifi "Internet" "internet";
    profiles.EK-PUBLIC = mkOpenWifi "EK-PUBLIC";
  };

  # Allow unfree packages
  nixpkgs.config.allowUnfree = true;

  # System packages
  environment.systemPackages = with pkgs; [
    neovim
    git
    just
    claude-code
    wget
    jetbrains.clion
    rustup
    gcc
    cmake
    gnumake
    firefox
    ghostty
  ];

  # Enable SSH
  services.openssh.enable = true;

  # Tailscale VPN
  services.tailscale.enable = true;

  # Autostart applications for all users
  environment.etc."xdg/autostart/nautilus.desktop".text = ''
    [Desktop Entry]
    Type=Application
    Name=Files
    Exec=nautilus
    X-GNOME-Autostart-enabled=true
  '';

  environment.etc."xdg/autostart/ghostty.desktop".text = ''
    [Desktop Entry]
    Type=Application
    Name=Ghostty
    Exec=ghostty
    X-GNOME-Autostart-enabled=true
  '';

  environment.etc."xdg/autostart/clion.desktop".text = ''
    [Desktop Entry]
    Type=Application
    Name=CLion
    Exec=clion
    X-GNOME-Autostart-enabled=true
  '';

  environment.etc."xdg/autostart/firefox.desktop".text = ''
    [Desktop Entry]
    Type=Application
    Name=Firefox
    Exec=firefox
    X-GNOME-Autostart-enabled=true
  '';
}
```

As for copying files between computers: I briefly tried to sshfs mount a directory and scp/rsync
files between computers on login. None of these approaches worked very well, and I opted to run a
few remote commands on every student transitioning.

## The Evaluation: Would I do it again?

This was a proof of concept.

Did something not work as expected?

- The computers worked surprisingly well, but logging in and out of the machines stole time in a
  similar way as letting students open and close their laptops.
- Activating the IntelliJ / CLion license in every account could have been automated, but since I
  ran out of time, I opted to simply log in and open the IDE in every account once prior, and click
  accept.
- Every user's account needed to be told to duplicate the monitor, and switch to a resolution that
  is compatible with both the laptop monitor and the projector. This was a hassle, because you don't
  just do that with dconf, and Claude in its infinite wisdom started hallucinating solutions moments
  before the exam started that work for Xorg but not Wayland, since Nix calls it "xserver" even
  though it's Wayland.
- Mac users were slightly screwed by not being on their usual keyboard. I really need to provide an
  external Mac keyboard, since this was an unreasonable surprise to some of them.

This experiment was a reaction to an exam format that seemed hard to execute.

I've removed the preparation from the exam for any teacher who picks up the course again.

Machine orchestration is a little time consuming: It took a day of setting up.

If this were for a type of exam with a LOT of students at once, it would definitely be worth
repeating.
