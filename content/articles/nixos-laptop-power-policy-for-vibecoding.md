+++
date = '2026-10-24T19:14:16+02:00'
draft = true
title = 'NixOS laptop power policy for vibecoding'
tags = ['nix', 'agentic']
+++

I start a coding agent on a long task, close the lid, and put the laptop in my bag.

By default, systemd-logind suspends the machine when the lid closes. The agent stops mid-task, its
network connections time out, and when I open the lid again the session has died with them.

What I want is a laptop that ignores the lid and keeps working until the battery is nearly empty,
and then hibernates instead of dying.

## tl;dr

- Set logind's `HandleLidSwitch`, `HandleLidSwitchExternalPower` and `HandleLidSwitchDocked` to
  `ignore`, and closing the lid no longer suspends anything.
- A systemd service polls `/sys/class/power_supply` and the ACPI lid state every 15 seconds.
- At 5% battery with the lid closed and no charger, it runs `systemctl hibernate`.
- At 5% battery with the lid open, it switches [power-profiles-daemon][ppd] to `power-saver`,
  the same switch as GNOME's Power Saver toggle.
- Hibernation goes to a swapfile on a LUKS root, which takes `boot.resumeDevice` and a
  `resume_offset` kernel parameter computed with `filefrag`.

[ppd]: https://gitlab.freedesktop.org/upower/power-profiles-daemon

## logind lets go of the lid

A daemon that decides what the lid means cannot share the job with logind, so logind is told to
stay out of it:

```nix
services.logind.settings.Login = {
  HandleLidSwitch = lib.mkDefault "ignore";
  HandleLidSwitchExternalPower = lib.mkDefault "ignore";
  HandleLidSwitchDocked = lib.mkDefault "ignore";
};
```

All three are needed. `HandleLidSwitch` alone only covers running on battery; on a charger or a
dock, logind reads the other two.

## Four cases

The policy is a shell loop. Each round it reads the lid state, the lowest capacity across all
`BAT*` supplies, and whether any `Mains` or `USB` supply is online. Stripped of logging and the
dry-run branch, the decision is:

```bash
if [ -n "$capacity" ] && [ "$capacity" -le "$threshold" ]; then
  if [ "$lid" = "closed" ] && { [ "$hibernate_on_ac" = "1" ] || [ "$ac_online" -eq 0 ]; }; then
    systemctl hibernate && sleep "$post_hibernate_delay"
  elif [ "$lid" != "closed" ]; then
    set_power_saver
  fi
fi
```

Above the threshold nothing happens, lid open or closed. That is the point: the agent keeps going.

At the threshold with the lid closed and a charger attached, nothing happens either, since the
battery is on its way up. `hibernateOnAC` overrides that for chargers too weak to keep up.

At the threshold with the lid open, I am at the keyboard and can decide for myself. The daemon
only switches to `power-saver` to buy some time.

The script reads every path from environment variables, so it runs against a fake sysfs. With
`BAT0/capacity` at 4 and the charger offline:

```console
$ POWER_POLICY_SYSFS=./sys POWER_POLICY_LID_FILE=./lid \
  POWER_POLICY_DRY_RUN=1 POWER_POLICY_ONESHOT=1 bash power-policy.sh
power-policy: starting (threshold=5%, poll=15s, profile=power-saver)
power-policy: battery 4%, lid closed, AC 0; would hibernate
```

And with the lid file changed to `open`:

```console
power-policy: starting (threshold=5%, poll=15s, profile=power-saver)
power-policy: would set power profile to power-saver
```

## Waking up at 4%

After resume the battery is still at 4%. Without a pause the loop would see the same numbers and
hibernate again before I find the charger.

So after a successful `systemctl hibernate`, the loop sleeps for `postHibernateDelay`, five minutes
by default. A separate oneshot unit, wanted by `hibernate.target`, switches to `power-saver` as soon
as the machine is back:

```nix
systemd.services.power-policy-resume = {
  wantedBy = [ "hibernate.target" ];
  after = [ "systemd-hibernate.service" ];
  serviceConfig = {
    Type = "oneshot";
    ExecStart = "${pkgs.power-profiles-daemon}/bin/powerprofilesctl set ${cfg.powerSaverProfile}";
  };
};
```

If hibernation fails, the loop falls back to `power-saver` and keeps polling.

## Hibernating to an encrypted swapfile

My swap is a file on the encrypted root, not a partition. The kernel resumes from a block device
and needs to know where in it the swapfile starts. The module exposes both:

```nix
boot.resumeDevice = lib.mkIf (cfg.resumeDevice != null) cfg.resumeDevice;
boot.kernelParams = lib.optional (cfg.resumeOffset != null) "resume_offset=${toString cfg.resumeOffset}";
```

The device is the unlocked LUKS mapping, `/dev/mapper/cryptroot`. The offset is the physical offset
of the swapfile's first extent:

```bash
filefrag -v /var/lib/swapfile | awk '$1 == "0:" {print $4}'
```

That number changes if the swapfile is ever recreated, so the command sits in a comment next to
the value.

## The whole module

It is a [dendritic][dn] flake-parts module that exports `nixosModules.power-policy`. The shell
script lives inside it as a `writeShellScript`, and the options become environment variables:

[dn]: /articles/dendritic-nix-with-nixos-shell

```nix
# modules/power-policy.nix
{ ... }:
{
  flake.nixosModules.power-policy =
    { config, lib, pkgs, ... }:
    let
      cfg = config.services.power-policy;

      powerPolicy = pkgs.writeShellScript "power-policy" ''
        set -euo pipefail

        threshold="''${POWER_POLICY_THRESHOLD:-5}"
        poll="''${POWER_POLICY_POLL_INTERVAL:-15}"
        profile="''${POWER_POLICY_POWER_SAVER_PROFILE:-power-saver}"
        lid_file="''${POWER_POLICY_LID_FILE:-}"
        sysfs="''${POWER_POLICY_SYSFS:-/sys/class/power_supply}"
        dry_run="''${POWER_POLICY_DRY_RUN:-0}"
        hibernate_on_ac="''${POWER_POLICY_HIBERNATE_ON_AC:-0}"
        post_hibernate_delay="''${POWER_POLICY_POST_HIBERNATE_DELAY:-300}"

        log() {
          printf 'power-policy: %s\n' "$*"
        }

        set_power_saver() {
          if [ "$dry_run" = "1" ]; then
            log "would set power profile to $profile"
            return 0
          fi
          if [ "$(powerprofilesctl get 2>/dev/null || true)" = "$profile" ]; then
            return 0
          fi
          if powerprofilesctl set "$profile"; then
            log "set power profile to $profile"
          else
            log "could not set power profile to $profile"
          fi
        }

        read_capacity() {
          local b="$1" now full
          if [ -r "$b/capacity" ]; then
            cat "$b/capacity"
            return 0
          fi
          if [ -r "$b/energy_now" ] && [ -r "$b/energy_full" ]; then
            now="$(cat "$b/energy_now")"
            full="$(cat "$b/energy_full")"
          elif [ -r "$b/charge_now" ] && [ -r "$b/charge_full" ]; then
            now="$(cat "$b/charge_now")"
            full="$(cat "$b/charge_full")"
          else
            return 1
          fi
          if [ "$full" -gt 0 ]; then
            echo $(( now * 100 / full ))
          fi
        }

        log "starting (threshold=$threshold%, poll=''${poll}s, profile=$profile)"
        while :; do
          if [ -z "$lid_file" ]; then
            lid_file="$(find /proc/acpi/button/lid -name state -type f 2>/dev/null | head -n 1 || true)"
          fi
          lid="unknown"
          if [ -n "$lid_file" ] && [ -r "$lid_file" ]; then
            lid="$(awk '{print $2}' "$lid_file")"
          fi

          capacity=""
          for b in "$sysfs"/BAT*; do
            [ -d "$b" ] || continue
            c="$(read_capacity "$b" 2>/dev/null || true)"
            case "$c" in
              "" | *[!0-9]*) continue ;;
            esac
            if [ -z "$capacity" ] || [ "$c" -lt "$capacity" ]; then
              capacity="$c"
            fi
          done

          ac_online=0
          for a in "$sysfs"/*; do
            [ -d "$a" ] || continue
            supply_type="$(cat "$a/type" 2>/dev/null || true)"
            case "$supply_type" in
              Mains | USB)
                if [ "$(cat "$a/online" 2>/dev/null || echo 0)" = "1" ]; then
                  ac_online=1
                fi
                ;;
            esac
          done

          if [ -n "$capacity" ] && [ "$capacity" -le "$threshold" ]; then
            if [ "$lid" = "closed" ] && { [ "$hibernate_on_ac" = "1" ] || [ "$ac_online" -eq 0 ]; }; then
              if [ "$dry_run" = "1" ]; then
                log "battery ''${capacity}%, lid closed, AC ''${ac_online}; would hibernate"
              else
                log "battery ''${capacity}%, lid closed, AC ''${ac_online}; hibernating"
                if systemctl hibernate; then
                  sleep "$post_hibernate_delay"
                else
                  log "hibernate failed; falling back to power saver"
                  set_power_saver
                  sleep "$poll"
                fi
              fi
            elif [ "$lid" != "closed" ]; then
              set_power_saver
            fi
          fi

          if [ "''${POWER_POLICY_ONESHOT:-0}" = "1" ]; then
            break
          fi
          sleep "$poll"
        done
      '';
    in
    {
      options.services.power-policy = {
        enable = lib.mkEnableOption "lid/battery power policy";

        batteryThreshold = lib.mkOption {
          type = lib.types.ints.between 1 100;
          default = 5;
          description = "Battery percentage at or below which to hibernate when the lid is closed.";
        };

        pollInterval = lib.mkOption {
          type = lib.types.ints.positive;
          default = 15;
          description = "Seconds between battery and lid checks.";
        };

        powerSaverProfile = lib.mkOption {
          type = lib.types.str;
          default = "power-saver";
          description = "power-profiles-daemon profile to activate instead of hibernating.";
        };

        lidStateFile = lib.mkOption {
          type = lib.types.str;
          default = "";
          description = "Lid state file. Empty means auto-detect under /proc/acpi/button/lid.";
        };

        hibernateOnAC = lib.mkOption {
          type = lib.types.bool;
          default = false;
          description = "Hibernate at the threshold even while AC power is connected.";
        };

        postHibernateDelay = lib.mkOption {
          type = lib.types.ints.positive;
          default = 300;
          description = "Seconds to wait after resuming from hibernation before checking again.";
        };

        resumeDevice = lib.mkOption {
          type = lib.types.nullOr lib.types.str;
          default = null;
          description = "Block device containing the hibernation swapfile or partition (e.g. /dev/mapper/cryptroot).";
        };

        resumeOffset = lib.mkOption {
          type = lib.types.nullOr lib.types.int;
          default = null;
          description = "Physical offset of the swapfile's first block, as reported by filefrag's physical_offset column.";
        };
      };

      config = lib.mkIf cfg.enable {
        # The policy daemon owns lid behavior; logind must not act on its own.
        services.logind.settings.Login = {
          HandleLidSwitch = lib.mkDefault "ignore";
          HandleLidSwitchExternalPower = lib.mkDefault "ignore";
          HandleLidSwitchDocked = lib.mkDefault "ignore";
        };

        # powerprofilesctl is the same switch as GNOME's Power Saver toggle.
        services.power-profiles-daemon.enable = lib.mkDefault true;

        boot.resumeDevice = lib.mkIf (cfg.resumeDevice != null) cfg.resumeDevice;
        boot.kernelParams = lib.optional (cfg.resumeOffset != null) "resume_offset=${toString cfg.resumeOffset}";

        systemd.services.power-policy = {
          description = "Lid/battery power policy";
          wantedBy = [ "multi-user.target" ];
          wants = lib.optional config.services.power-profiles-daemon.enable "power-profiles-daemon.service";
          after = lib.optional config.services.power-profiles-daemon.enable "power-profiles-daemon.service";
          path = with pkgs; [
            coreutils
            findutils
            gawk
            power-profiles-daemon
            systemd
          ];
          environment = {
            POWER_POLICY_THRESHOLD = toString cfg.batteryThreshold;
            POWER_POLICY_POLL_INTERVAL = toString cfg.pollInterval;
            POWER_POLICY_POWER_SAVER_PROFILE = cfg.powerSaverProfile;
            POWER_POLICY_LID_FILE = cfg.lidStateFile;
            POWER_POLICY_HIBERNATE_ON_AC = if cfg.hibernateOnAC then "1" else "0";
            POWER_POLICY_POST_HIBERNATE_DELAY = toString cfg.postHibernateDelay;
          };
          serviceConfig = {
            Type = "simple";
            ExecStart = "${powerPolicy}";
            Restart = "always";
            RestartSec = 5;
          };
        };

        systemd.services.power-policy-resume = {
          description = "Activate power saver after resuming from hibernation";
          wantedBy = [ "hibernate.target" ];
          after = [ "systemd-hibernate.service" ];
          serviceConfig = {
            Type = "oneshot";
            ExecStart = "${pkgs.power-profiles-daemon}/bin/powerprofilesctl set ${cfg.powerSaverProfile}";
          };
        };
      };
    };
}
```

The laptop enables it like this:

```nix
# modules/nixos-configurations.nix
config.flake.nixosModules.power-policy
{
  services.power-policy = {
    enable = true;
    # /var/lib/swapfile lives on the encrypted root. Recompute the offset
    # if the swapfile is recreated:
    #   filefrag -v /var/lib/swapfile | awk '$1 == "0:" {print $4}'
    resumeDevice = "/dev/mapper/cryptroot";
    resumeOffset = 3606528;
  };
}
```
