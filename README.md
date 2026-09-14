<div align="center">

# omarchy-screenlogs

**Periodic screen capture for Omarchy — a fullscreen screenshot every N seconds, straight to disk.**

</div>

<hr>

<div align="center">
● <a href="#installation">Installation</a> ﻿ ● <a href="#usage">Usage</a> ﻿ ● <a href="#configuration">Configuration</a> ﻿ ● <a href="#docs">Docs</a> ﻿ ● <a href="#license">License</a>
</div>

## Installation

```bash
omarchy plugin add https://github.com/FAZuH/omarchy-screenlogs.git --enable
```

Then place the **Screenlogs** widget on the bar from the shell's widget
settings. Requires Omarchy Quattro (the `omarchy plugin` shell); `grim` ships
with Omarchy.

## Usage

A camera icon appears on the bar:

| Input | Action |
|---|---|
| Left click | Open the panel: enable toggle, capture now, open folder, status |
| The gear (top right of the panel) | Open the settings window: schedule, monitors, format, retention |
| Middle click | Capture once, now |
| Right click | Pause / resume captures |

Captures pause automatically while the screen is locked, outside an optional
active-hours window, or after the session has been idle for N minutes.

Everything is also scriptable over the shell IPC:

```bash
omarchy-shell fazuh.screenlogs status    # state, last shot, folder, errors
omarchy-shell fazuh.screenlogs capture   # one screenshot now
omarchy-shell fazuh.screenlogs settings   # open / close the settings window
omarchy-shell fazuh.screenlogs disable   # pause
omarchy-shell fazuh.screenlogs enable    # resume (captures immediately)
```

## Configuration

Open the settings window (gear) to edit everything live. Settings are stored
in `~/.config/omarchy/screenlogs/config.json`, are hot-reloaded on change, and
can be edited by hand. The defaults capture one PNG per screen every 60
seconds into `~/Pictures/screenlogs`, keeping the newest 500 files.

The full key reference — active hours, idle pause, PNG/JPEG, and the count,
age and disk-budget retention rules — is in the
[Configuration reference](docs/configuration.md).

## Docs

- [Configuration reference](docs/configuration.md) — every key with its meaning, range, and the pause and pruning semantics
- [Omarchy shell plugins](https://omarchy.org/manual/shell-plugins/) — how plugin kinds, entry points, and `shell.json` work
- Self-check: `node test.mjs` · Manifest check: `omarchy plugin validate .`

## License

[MIT](LICENSE)
