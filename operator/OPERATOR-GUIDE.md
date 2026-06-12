# Gamestr Arcade — Booth Operator Guide

This machine runs the **Gamestr Arcade**. Here's everything you need on the day.

---

## Starting up

The arcade does **not** start on its own — launch it when you're ready, either way:

- **Click the `Gamestr Arcade` icon** in the apps menu (press the *Super*/Windows
  key, type "arcade", press Enter), **or**
- Open a Terminal and type: `arcade start`

It fills the screen once it loads. To close it, press **`Ctrl+Q`** (or `arcade stop`).

---

## Player controls

- Players use the **gamepad** (or the on-screen cursor) to pick a game.
- Choose a tile to start a game; scores appear on the leaderboards.
- **Esc** (or the gamepad **Back** button) exits a running game back to the grid.

---

## Admin keys (for you, the operator)

| Key      | What it does                                            |
|----------|---------------------------------------------------------|
| `Ctrl+Q` | **Quit** the arcade (drops to the desktop)              |
| `F5`     | **Reload** — re-scans games and re-reads settings       |
| `c`      | Toggle the **CRT** scanline look on/off                 |
| `m`      | **Mute / unmute** sound                                 |

---

## If something looks wrong

| Symptom                                   | Do this                                  |
|-------------------------------------------|------------------------------------------|
| Arcade closed / showing the desktop       | `arcade start` (or click the icon)       |
| Frozen or misbehaving                     | `arcade restart`                         |
| Black screen / won't come back after that | **Reboot the machine**, then launch again |
| Want to check it's running                | `arcade status`                          |
| Want to see what it's doing               | `arcade logs`  (Ctrl+C to stop watching) |

A reboot fixes almost everything — afterwards, launch the arcade again with the
icon or `arcade start`.

---

## End of the day

Press **`Ctrl+Q`** to close the arcade, then **shut the machine down** normally
(power menu → Power Off). Nothing to save. Next time, launch it again with the
icon or `arcade start`.

---

*Adding or swapping games is a maintenance task — see the developer's `SETUP.md`,
not this guide.*
