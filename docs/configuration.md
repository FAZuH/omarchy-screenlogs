# Configuration reference

Screenlogs keeps its settings in `~/.config/omarchy/screenlogs/config.json`.
The service watches the file and picks up hand edits immediately; every value
is validated on load, and anything out of range or malformed falls back to its
default rather than half applying. The settings window (gear button in the
panel) edits the same file through the service.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `true` | Master toggle. Pausing never uninstalls anything. |
| `periodSec` | integer | `60` | Seconds between capture rounds (5–86400). |
| `dir` | string | `~/Pictures/screenlogs` | Save folder; `~` expands, created on the next capture. |
| `monitors` | list | `[]` | Screen names to capture; see below. |
| `pauseWhenLocked` | boolean | `true` | Skip captures while the session is locked. |
| `activeFrom` | string | `""` | First capture hour, `HH:MM`. |
| `activeTo` | string | `""` | Last capture hour, `HH:MM`. |
| `idleMinutes` | integer | `0` | Pause after this many minutes without input (0 = never). |
| `format` | string | `"png"` | `png` or `jpeg`. |
| `jpegQuality` | integer | `85` | grim `-q` value for jpeg, 1–100. |
| `keep` | integer | `500` | Newest N screenshot files survive each round (0 = unlimited). |
| `keepHours` | integer | `0` | Delete files older than this many hours (0 = off). |
| `maxDiskMb` | integer | `0` | Delete oldest files until the folder fits this budget (0 = off). |

## Monitors

An empty `monitors` list means *every screen*, so a monitor plugged in later
is captured automatically. Unchecking one screen in the settings window
materializes the list to the other screens; re-checking the last one collapses
it back to empty. One file is written per screen per round; a screen that
fails to capture is reported in the status without stopping the others.

## When captures pause

The panel status shows the current reason. In precedence order:

1. `enabled: false` — paused by you.
2. Screen locked — Omarchy's own `omarchy-hyprland-session-locked` check runs
   before each round; an undetermined result counts as unlocked. The first
   capture follows shortly after unlock.
3. Idle — uses the compositor's idle clock (the same mechanism as Omarchy's
   idle service, screen-saver inhibitors respected), so a video or presentation
   that inhibits idle does not trigger the pause.
4. Outside the active-hours window — `activeFrom`/`activeTo` as `HH:MM`.
   Blank or equal bounds mean always active; a start later than the end wraps
   past midnight, so `22:00`–`06:00` covers the night. The start instant is
   active, the end instant is not.

## Retention

After every capture round the folder is pruned, in this order:

1. **Age**: files older than `keepHours` are deleted.
2. **Count**: past `keep`, the oldest files are deleted until only the newest
   N remain — counted across all monitors, newest first by mtime.
3. **Disk budget**: while the folder exceeds `maxDiskMb`, the oldest screenshot
   is deleted repeatedly (it stops if non-screenshot files alone exceed the
   budget rather than looping).

All three default sensibly: count 500, age and budget off.

## Files

Names are `st-<YYYYMMDD>-<HHMMSS>-<monitor>.png` (or `.jpg`), sortable by
name. Timestamps are local time. Failed captures never overwrite; the last
error is shown in the panel and through `omarchy-shell fazuh.screenlogs status`.
