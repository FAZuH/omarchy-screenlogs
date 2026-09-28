.pragma library

var DEFAULTS = {
  enabled: true,
  periodSec: 60,
  keep: 500,
  keepHours: 0,
  maxDiskMb: 0,
  dir: "~/Pictures/screenlogs",
  monitors: [],
  pauseWhenLocked: true,
  activeFrom: "",
  activeTo: "",
  idleMinutes: 0,
  format: "png",
  jpegQuality: 85
}

var PERIOD_MIN = 5
var PERIOD_MAX = 86400
var KEEP_MAX = 100000
var KEEP_HOURS_MAX = 87600
var DISK_MB_MAX = 1048576
var IDLE_MINUTES_MAX = 1440

function clamped(value, fallback, min, max) {
  var n = Number(value)
  var v = isFinite(n) && Math.floor(n) === n ? n : fallback
  return v < min || v > max ? fallback : v
}

function monitorList(value) {
  if (!Array.isArray(value)) return []
  var seen = ({})
  var out = []
  for (var i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string") continue
    var name = value[i].trim()
    if (!name || seen[name]) continue
    seen[name] = true
    out.push(name)
  }
  return out
}

function parseClock(text) {
  var s = String(text === undefined || text === null ? "" : text).trim()
  var m = /^([0-9]{1,2}):([0-9]{2})$/.exec(s)
  if (!m) return ""
  var h = parseInt(m[1], 10)
  var min = parseInt(m[2], 10)
  if (h > 23 || min > 59) return ""
  return (h < 10 ? "0" + h : String(h)) + ":" + m[2]
}

function clockMinutes(clock) {
  var m = /^([0-9]{2}):([0-9]{2})$/.exec(String(clock || ""))
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1
}

// Empty or equal bounds mean "always active". A start later than the end
// wraps past midnight: 22:00–06:00 covers the night.
function isWithinActiveHours(from, to, date) {
  var start = clockMinutes(from)
  var end = clockMinutes(to)
  if (start < 0 || end < 0 || start === end) return true
  var t = date.getHours() * 60 + date.getMinutes()
  if (start < end) return t >= start && t < end
  return t >= start || t < end
}

function normalize(raw) {
  var cfg = raw && typeof raw === "object" ? raw : {}
  var dir = typeof cfg.dir === "string" ? cfg.dir.trim() : ""
  return {
    enabled: cfg.enabled === undefined || cfg.enabled === null
      ? DEFAULTS.enabled : cfg.enabled === true,
    periodSec: clamped(cfg.periodSec, DEFAULTS.periodSec, PERIOD_MIN, PERIOD_MAX),
    keep: clamped(cfg.keep, DEFAULTS.keep, 0, KEEP_MAX),
    keepHours: clamped(cfg.keepHours, DEFAULTS.keepHours, 0, KEEP_HOURS_MAX),
    maxDiskMb: clamped(cfg.maxDiskMb, DEFAULTS.maxDiskMb, 0, DISK_MB_MAX),
    dir: dir || DEFAULTS.dir,
    monitors: monitorList(cfg.monitors),
    pauseWhenLocked: cfg.pauseWhenLocked === undefined || cfg.pauseWhenLocked === null
      ? DEFAULTS.pauseWhenLocked : cfg.pauseWhenLocked === true,
    activeFrom: parseClock(cfg.activeFrom),
    activeTo: parseClock(cfg.activeTo),
    idleMinutes: clamped(cfg.idleMinutes, DEFAULTS.idleMinutes, 0, IDLE_MINUTES_MAX),
    format: cfg.format === "jpeg" ? "jpeg" : "png",
    jpegQuality: clamped(cfg.jpegQuality, DEFAULTS.jpegQuality, 1, 100)
  }
}

// An empty list means "every screen", so a hotplugged monitor is still
// captured: unchecking one screen stores the others, and a list covering
// every screen collapses back to empty.
function toggleMonitor(selected, screens, name) {
  var list = monitorList(selected)
  var all = monitorList(screens)
  if (list.length === 0) {
    var rest = []
    for (var i = 0; i < all.length; i++)
      if (all[i] !== name) rest.push(all[i])
    return rest
  }
  var idx = list.indexOf(name)
  if (idx === -1) list.push(name)
  else list.splice(idx, 1)
  return coversAll(list, all) ? [] : list
}

function coversAll(list, screens) {
  if (screens.length === 0) return false
  for (var i = 0; i < screens.length; i++)
    if (list.indexOf(screens[i]) === -1) return false
  return true
}

function isMonitorSelected(selected, name) {
  return selected.length === 0 || selected.indexOf(name) !== -1
}

function expandHome(dir, home) {
  if (dir === "~") return home
  if (dir.indexOf("~/") === 0) return home + dir.slice(1)
  return dir
}

function shQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'"
}

// Only ever used for file names and the error report, never for the grim
// target: stripping `/` keeps a hand-edited monitor name inside the directory.
function safeMonitor(name) {
  return String(name).replace(/[^A-Za-z0-9._-]/g, "-")
}

function stamp(epochMs) {
  var d = new Date(epochMs)
  function pad(n) { return n < 10 ? "0" + n : String(n) }
  return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
    + "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
}

// The plugin's own file-name shape: st-<8 digits>-<6 digits>, optionally
// followed by a per-monitor suffix. Retention deletes only these, never other
// images that happen to share the directory.
var OWNED = "st-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]*"

function groupDigits(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

// Coarse on purpose: a caption, not a stopwatch. Seconds, then minutes, then
// hours, then whole days.
function formatAge(seconds) {
  var s = Math.max(0, Math.floor(Number(seconds) || 0))
  if (s < 60) return s + "s"
  var m = Math.floor(s / 60)
  if (m < 60) return m + "m"
  var h = Math.floor(m / 60)
  if (h < 24) return h + "h"
  return Math.floor(h / 24) + "d"
}

function countUsage(count) {
  if (!(count >= 0)) return "unknown"
  return groupDigits(count) + (count === 1 ? " file" : " files") + " now"
}

function ageUsage(oldestSec, nowMs) {
  if (!(oldestSec > 0)) return "no screenshots yet"
  return "oldest is " + formatAge(nowMs / 1000 - oldestSec) + " old"
}

function budgetUsage(usedMb, limitMb) {
  if (!(usedMb >= 0)) return "size unknown"
  var s = groupDigits(usedMb) + " MB used"
  if (limitMb > 0) s += usedMb > limitMb
    ? " · " + groupDigits(usedMb - limitMb) + " MB over budget"
    : " · " + groupDigits(limitMb - usedMb) + " MB to spare"
  return s
}

// Retention deletes, so it only prunes a directory it can prove it is really
// in: no symlinked path component, and never / or the home directory. A
// symlinked target is refused rather than followed, so the settings window can
// point the user at the real path instead of pruning somewhere they did not
// choose. Stock Omarchy puts ~/Pictures behind a symlink, which is why the
// settings window checks before it saves.
function dirCheckScript(dir) {
  return [
    "cd -- " + shQuote(dir) + " 2>/dev/null || { echo MISSING; exit 0; }",
    'case "$(pwd -L)" in /|"$HOME") echo UNSAFE; exit 0 ;; esac',
    '[ "$(pwd -L)" = "$(pwd -P)" ] && echo SAME || printf "SYMLINK\\t%s\\n" "$(pwd -P)"'
  ].join("\n")
}

// The suggestion has to name a path the user could type, so a home inside the
// path is folded back to `~` rather than spelled out.
function collapseHome(path, home) {
  var p = String(path || "")
  var h = String(home || "")
  if (!h) return p
  if (p === h) return "~"
  return p.indexOf(h + "/") === 0 ? "~" + p.slice(h.length) : p
}

function dirNotice(logical, physical, home) {
  if (!physical) return ""
  return "Retention is off: " + collapseHome(logical, home)
    + " is reached through a symlink. Use " + collapseHome(physical, home) + " instead."
}

// Values reach bash only inside single quotes; a failed grim is recorded per
// monitor instead of aborting the run.
function captureScript(config, epochMs, targets, home) {
  var cfg = normalize(config)
  var dir = expandHome(cfg.dir, home)
  var ext = cfg.format === "jpeg" ? "jpg" : "png"
  var ts = stamp(epochMs)
  var list = monitorList(targets)
  var typeArg = cfg.format === "jpeg" ? " -t jpeg -q " + cfg.jpegQuality : ""
  var lines = ["mkdir -p -- " + shQuote(dir) + " 2>/dev/null || { echo \"ERR=directory\"; exit 1; }", "last=", "err="]

  // omarchy-hyprland-session-locked exits 0 when locked, 1/2 otherwise
  // (2 = undetermined, which the helper's contract says to treat as unlocked).
  if (cfg.pauseWhenLocked)
    lines.push("if omarchy-hyprland-session-locked 2>/dev/null; then echo LOCKED=1; exit 0; fi")

  if (list.length === 0) {
    var file = shQuote(dir + "/st-" + ts + "." + ext)
    lines.push("grim" + typeArg + " " + file + " 2>/dev/null && last=" + file
      + " || err=\"grim\"")
  }
  for (var i = 0; i < list.length; i++) {
    var name = list[i]
    var shot = shQuote(dir + "/st-" + ts + "-" + safeMonitor(name) + "." + ext)
    lines.push("grim -o " + shQuote(name) + typeArg + " " + shot
      + " 2>/dev/null && last=" + shot
      + " || err=\"${err:+$err }" + safeMonitor(name) + "\"")
  }

  // Fail closed: if the directory change fails, relative retention commands
  // must not fall back to the process's working directory.
  lines.push("cd -- " + shQuote(dir) + " 2>/dev/null || { echo \"ERR=directory\"; exit 1; }")

  var owned = "find . -maxdepth 1 -type f \\( -name '" + OWNED + ".png' -o -name '" + OWNED + ".jpg' \\)"
  var scan = owned + " -printf '%T@\\t%b\\t%f\\n' 2>/dev/null | sort -n"
  // `prune` gates deletion, `measure` only gates du: a symlinked directory is
  // still worth reporting a size for, and refusing to is what made the broken
  // limit invisible. Both answers come from the one probe the settings window
  // validates with — a hand-rolled second copy of the rule is how `prune` ended
  // up set in `/` and `$HOME` while that probe called them UNSAFE.
  lines.push("prune=")
  lines.push("measure=$(pwd -L)")
  lines.push("check=$(" + dirCheckScript(dir) + ")")
  lines.push('case "$check" in')
  lines.push("  SAME) prune=yes ;;")
  lines.push("  UNSAFE) prune=; measure= ;;")
  lines.push("  *) prune= ;;")
  lines.push("esac")
  // One scan feeds retention and the settings window's usage readouts. Never a
  // shell glob: past ~65k files the pattern overflows ARG_MAX and ls reports
  // nothing, which silently disabled the count and budget limits.
  lines.push("own=$(" + scan + ")")
  // Each prune carries its own guard, the same shape the budget loop below
  // already uses. Collecting them first to share one guard needs a count
  // check, because bash rejects an empty `if … fi` — and an empty guard is
  // exactly what one limit switching off produces.
  if (cfg.keepHours > 0)
    lines.push('if [ -n "$prune" ]; then', "  " + owned
      + " -mmin +" + (cfg.keepHours * 60) + " -delete 2>/dev/null", "fi")
  if (cfg.keep > 0)
    // `own` runs oldest first, so "all but the newest N" is what has to go.
    lines.push('if [ -n "$prune" ]; then',
      "  printf '%s\\n' \"$own\" | head -n -" + cfg.keep
        + " | cut -f3- | tr '\\n' '\\0' | xargs -0 -r rm -f", "fi")
  // du measures the whole directory, so non-screenshot files count against the
  // budget and are never deleted — the loop simply runs out of owned files
  // first. Blocks are 512-byte units and du rounds each file up to a whole KB,
  // so subtract it the same way or the loop stops short of the budget.
  lines.push('if [ -n "$measure" ]; then')
  lines.push("  total=$(du -sk -- . 2>/dev/null | cut -f1); total=${total:-0}")
  if (cfg.maxDiskMb > 0) {
    lines.push("  budget=$(( " + cfg.maxDiskMb + " * 1024 ))")
    lines.push("  if [ -n \"$prune\" ]; then")
    lines.push("    while IFS=$'\\t' read -r _mtime blocks name; do")
    lines.push("      [ \"$total\" -le \"$budget\" ] && break")
    lines.push("      [ -n \"$name\" ] || break")
    // The count prune may already have taken this one: rm -f would succeed on a
    // missing name and shrink `total` for a file that is no longer on disk.
    lines.push("      [ -e \"$name\" ] || continue")
    lines.push("      rm -f -- \"$name\" && total=$((total - (blocks + 1) / 2))")
    lines.push("    done < <(printf '%s\\n' \"$own\")")
    lines.push("  fi")
  }
  // `own` was read before the prunes ran, so the count and age readouts are one
  // round behind; `size` is exact because the loop tracks what it freed.
  lines.push("  size=$(( (total + 1023) / 1024 ))")
  lines.push("fi")
  lines.push("echo \"LAST=$last\"")
  lines.push("echo \"ERR=$err\"")
  lines.push("echo \"COUNT=$(printf '%s\\n' \"$own\" | grep -c .)\"")
  lines.push("echo \"OLDEST=$(printf '%s\\n' \"$own\" | head -1 | cut -f1 | cut -d. -f1)\"")
  lines.push("echo \"SIZE=$size\"")
  return lines.join("\n")
}
