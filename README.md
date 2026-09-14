<div align="center">

# screenlogs

**Periodic screen capture for Omarchy — a fullscreen screenshot every N seconds, straight to disk.**

</div>

<hr>

<div align="center">
● <a href="#installation">Installation</a> ﻿ ● <a href="#usage">Usage</a> ﻿ ● <a href="#configuration">Configuration</a> ﻿ ● <a href="#docs">Docs</a> ﻿ ● <a href="#license">License</a>
</div>

## Installation

```bash
omarchy plugin add https://github.com/FAZuH/screenlogs.git --enable
```

From a local checkout instead:

```bash
omarchy plugin add ~/Work/Omarchy/omarchy-screenlogs --enable
omarchy plugin enable fazuh.screenlogs right
```

Requires Omarchy Quattro (the `omarchy plugin` shell). `grim` ships with Omarchy.

## Usage

A camera icon appears on the bar:

| Input | Action |
|---|---|
| Left click | Open the configuration panel |
| Middle click | Capture once, now |
| Right click | Pause / resume captures |

Everything is also scriptable over the shell IPC:

```bash
omarchy-shell fazuh.screenlogs status    # state, last shot, folder, errors
omarchy-shell fazuh.screenlogs capture   # one screenshot now
omarchy-shell fazuh.screenlogs disable   # pause
omarchy-shell fazuh.screenlogs enable    # resume (captures immediately)
```

## Configuration

Open the panel (left click on the bar icon) to set everything live:

| Setting | Default | Meaning |
|---|---|---|
| Capture screenshots | on | Master toggle — pause and resume without uninstalling |
| Every (seconds) | 60 | Seconds between captures (5–86400) |
| Keep recent screenshots | 500 | Newest N files kept in the folder; 0 keeps everything |
| Save folder | `~/Pictures/screenlogs` | Created on the next capture; `~` expands |
| Monitors | all | One file per checked screen; an empty selection follows hotplugged monitors |

Settings live in `~/.config/omarchy/screenlogs/config.json` and can be edited by hand.

Files are named `st-<date>-<time>-<monitor>.png`, e.g. `st-20260915-142530-DP-1.png`.
Pruning counts files in the save folder, newest first, across all monitors.
Captures pause while the toggle is off and resume on the next tick.

## Docs

- [Omarchy shell plugins](https://omarchy.org/manual/shell-plugins/) — how plugin kinds, entry points, and `shell.json` work
- [Manifest](manifest.json) · [Service](Service.qml) · [Bar widget](BarWidget.qml) · [Panel](Panel.qml) · [Capture logic](Capture.js)
- Self-check: `node test.mjs`; manifest check: `omarchy plugin validate .`

## License

[MIT](LICENSE)
