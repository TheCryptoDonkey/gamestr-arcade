# Bitfest booth readiness

Working event date: **18 November 2026, awaiting owner confirmation**. This is
an operator runbook and an evidence checklist, not physical acceptance. **The
booth machine has not been selected.** Prepare and verify a portable Linux
release now; machine installation and physical acceptance follow selection.

## Current evidence (10 November 2026)

- Checkout `1e72f5c95965fb8b602e7e34b9274664e1138d6f` has 17 player titles,
  all declaring gamepad input. `node scripts/conference-status.mjs` reports
  **BLOCKED: 0/17 physical certifications** and no installed local Pallasite
  fallback in this checkout. Sixteen titles declare required connectivity.
- The tracked deployment default is `axenstax@192.168.191.32`, with the shell
  at `~/gamestr-arcade.AppImage` and catalogue at `~/gamestr-games`.
  An initial bounded read-only SSH probe timed out on port 22. This tracked
  default is historical configuration, not the selected Bitfest machine. Host identity, current
  service, installed games, fallback binary and actual controller support
  remain unverified; the local missing binary does not prove it is missing
  on the booth.
- `systemd/booth-wayland.conf` names a `bitfest-1` Ubuntu 25.10 GNOME/Wayland
  booth. Confirm that this is the intended host before shipping; the deploy
  script's default is not proof. The script installs the shared service, but
  does not install the Wayland override or AppArmor profile.
- Linux CI packages and boots an AppImage, checks input-negative failure,
  runs browser journeys and records checksums. Passing that workflow proves
  its recorded revision and simulated runtime, not physical booth acceptance.

## Portable release contents

The Linux CI artifact includes the shell AppImage, SHA256SUMS, runtime and
input-negative smoke evidence, SBOM, both web builds, and
`gamestr-arcade-source.tar.gz`. The source archive is made from the same CI
commit and checksummed alongside the AppImage. It contains tracked catalogue,
systemd service/drop-ins, AppArmor profile, scripts, schemas, operator docs,
lockfile and vendored packages. The AppImage itself contains the application
and bundled config, not the games.

After downloading the CI artifact, locate its `release/` directory and verify
the AppImage and archive before extraction:

```bash
cd <downloaded-artifact>/release
sha256sum -c SHA256SUMS
tar -xzf gamestr-arcade-source.tar.gz
cd gamestr-arcade-source
npm ci
```

Use the Node version in `.nvmrc`; `npm ci` installs the validator's locked
dependencies. The fresh-machine instructions are now at
`gamestr-arcade-source/SETUP.md`, with service files under `systemd/` and
the source catalogue under `games/`. Keep the already-verified AppImage from
the artifact's `release/` directory: it need not be rebuilt. From this extracted
source directory, use `npm run deploy -- --booth <user@confirmed-host>
--ship-only --artifact <absolute-AppImage-path> --sha256 <digest> --no-games
--restart` after target-specific setup and backup. A fresh machine needs its
reviewed catalogue installed separately; explicit `--sync-games` is available
only after confirming the target is suitable for reconciliation.

The archive cannot supply gitignored native game binaries, local mirrors
or private config. Obtain and checksum those separately, install them only on
the selected machine, and complete the physical/offline gates below.

## Before installing a candidate

1. Confirm the date, select the final x86_64 Linux machine/SSH target, booth
   operator, display, controllers and wired/wireless connections. Establish access.
   Read service state and installed catalogue before changing either.
2. Record the candidate commit, CI run, exact AppImage filename and SHA-256.
   Use the Linux CI artifact or an x86_64 Linux build (`npm ci && npm run dist`).
   Run `npm run check` on the exact source revision; retain CI and runtime-smoke
   evidence with the handover.
3. Preserve a recoverable copy of the installed AppImage, user service and
   drop-ins, catalogue (including native binaries and local sites), and local
   config before deployment. Keep credential-bearing config private; record
   backup locations and checksums, never NWC credentials, in the handover.
4. Inspect the installed Wayland/X11 setup. For the named Wayland booth,
   verify the tracked override and narrow AppArmor profile described in
   [SETUP.md](../SETUP.md) are installed and match the candidate. Verify the
   session's display environment and screen-blanking policy on the real screen.
5. Reconcile catalogue changes explicitly. Ordinary deploy preserves the
   installed catalogue. Explicit `--sync-games` opts into
   `rsync --delete --exclude='*.AppImage'`: it preserves native AppImages,
   **overwrites booth-edited manifests/certifications and deletes booth-only
   local sites/assets** absent from the source catalogue. Keep `--no-games`
   for a shell-only deployment. Use `--sync-games` only after the owner has
   chosen to reconcile the inspected, backed-up catalogue to source. It does
   not install Pallasite's native binary.

Deploy an exact candidate using the confirmed target, not an assumed default:

```bash
npm run deploy -- --booth <user@confirmed-host> --ship-only \
  --artifact release/gamestr-arcade-<version>-x86_64.AppImage \
  --sha256 <64-hex-digest> --no-games --restart
```

This still installs/enables the shared service. `--no-enable` instead disables
autostart; choose the agreed booth policy. A custom `:directory` changes the
shell upload path, but the shared service still launches from the home directory
and catalogue sync still targets `~/gamestr-games`; reconcile those paths first.

## Physical rehearsal and go/no-go

Use the final packaged shell, installed catalogue, display and controllers.
Follow [conference-acceptance.md](conference-acceptance.md) for **each** title:
boot attached, navigate, launch from its opening menu, test every hint, pause,
exit, relaunch, disconnect/reconnect and exercise both `standard` and Linux HAT
profiles over the intended wired/wireless paths. Record the exact game revision,
hardware, connection, date and result before adding hardware certification.
Keep diagnostics temporary and remove their override afterwards.

Rehearse these cabinet-wide outcomes and retain the operator's observations:

| Exercise | Required result |
| --- | --- |
| Cold boot and graphical login | Correct catalogue opens on the final display; attract/select works; no screen blanking during the rehearsal. |
| Native and web sessions | Controls, audio, pause and return work; no stuck input or previous visitor's signing/payment session carries into a fresh visitor session. |
| Network outage | Shell stays recoverable and the installed nominated fallback launches and plays with networking disabled. Pallasite's remote URL is insufficient. |
| Reconnect after outage | Online titles and leaderboards recover; observed score publication can be traced to the correct title and player. |
| Optional wallet/sign-in | If enabled for the booth, verify the configured flow and policy using an agreed bounded payment; otherwise record it as disabled. Keep Payment Lab hidden in normal kiosk mode. |
| Recovery | Operator demonstrates game exit, renderer reload, service restart and return from a failed candidate using the retained release. |

Validate the **installed** catalogue from a checkout with the matching tooling:

```bash
node scripts/validate-manifests.mjs /home/<booth-user>/gamestr-games
node scripts/conference-status.mjs /home/<booth-user>/gamestr-games
```

These are two explicit commands because `npm run conference:status -- <path>`
forwards the path to the final status command while its preceding manifest
validator still uses the default source/example directories. Keep schema
validation and certification checks against the same installed catalogue.

Go only after the candidate checksum/live service is recorded, the installed
gate is green, every physical run and outage/recovery rehearsal has evidence,
and the owner accepts the reviewed revision. A gate result cannot establish
that a human performed the manifest's claimed physical tests.

## Operator recovery and rollback

- Game exit: Escape, Guide or View + Menu returns to the carousel. Start/Menu
  alone belongs to the game. F5 rescans games and reloads non-startup config;
  games-directory or kiosk-mode changes require a service restart.
- Inspect `systemctl --user status gamestr-arcade` and
  `journalctl --user-unit gamestr-arcade -n 40 --no-pager` privately. After fixing
  a failed startup, run `systemctl --user reset-failed gamestr-arcade` then
  `systemctl --user restart gamestr-arcade`. Four starts in 120 seconds trip the
  crash-loop guard. Repeated SIGTRAP/SIGBUS may require a clean reboot as
  described in SETUP; do not disable the Chromium sandbox as a recovery shortcut.
- `deploy.sh --restart` checks a PID-bound renderer-ready marker and stable
  service/renderer processes. On failure it attempts to restore
  `gamestr-arcade.AppImage.previous` and requests a restart, then exits nonzero.
  **It does not validate rollback readiness or restore catalogue, service,
  overrides or config.** Read back service state, renderer readiness and the
  actual display after rollback; recover those other files from the retained
  backup if the candidate changed them.
- For manual AppImage rollback, stop the service, restore the retained exact
  AppImage to its confirmed launch path, verify its checksum and executable
  permission, reset failed state and restart. On the tracked Wayland override,
  extraction is timestamp based: ensure the restored AppImage is newer than
  `~/.arcade-extracted` (for example `touch ~/gamestr-arcade.AppImage`) so the
  override re-extracts the restored binary. Verify the screen and repeat the
  native launch/return smoke before reopening the cabinet.

Handover must name the accepted shell commit/checksum, game revisions,
certification and outage evidence, host/service paths, backups, operator and
unresolved issues. Keep local release evidence until that handover is accepted;
stop task-owned diagnostic processes and remove temporary diagnostic overrides.
