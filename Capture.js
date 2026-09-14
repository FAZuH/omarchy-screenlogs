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

function integer(value, fallback) {
  var parsed = Number(value)
  return isFinite(parsed) && Math.floor(parsed) === parsed ? parsed : fallback
}

function clamped(value, fallback, min, max) {
  var parsed = integer(value, fallback)
  return parsed < min || parsed > max ? fallback : parsed
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

// Values reach bash only inside single quotes; a failed grim is recorded per
// monitor instead of aborting the run.
function captureScript(config, epochMs, targets, home) {
  var cfg = normalize(config)
  var dir = expandHome(cfg.dir, home)
  var ext = cfg.format === "jpeg" ? "jpg" : "png"
  var ts = stamp(epochMs)
  var list = monitorList(targets)
  var typeArg = cfg.format === "jpeg" ? " -t jpeg -q " + cfg.jpegQuality : ""
  var lines = ["mkdir -p " + shQuote(dir), "last=", "err="]

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

  lines.push("cd " + shQuote(dir) + " 2>/dev/null || true")

  if (cfg.keepHours > 0)
    lines.push("find . -maxdepth 1 -type f \\( -name '*.png' -o -name '*.jpg' \\)"
      + " -mmin +" + (cfg.keepHours * 60) + " -delete 2>/dev/null")

  if (cfg.keep > 0)
    lines.push("ls -1t -- *.png *.jpg 2>/dev/null"
      + " | tail -n +" + (cfg.keep + 1)
      + " | tr '\\n' '\\0' | xargs -0 -r rm -f")

  if (cfg.maxDiskMb > 0) {
    lines.push("prev=")
    lines.push("while [ \"$(du -sm -- . 2>/dev/null | cut -f1)\" -gt " + cfg.maxDiskMb + " ]; do")
    lines.push("  oldest=$(ls -1tr -- *.png *.jpg 2>/dev/null | head -n 1)")
    // The repeat guard ends the loop when the budget can't be met by deleting
    // screenshots (oversized non-screenshot files in the directory).
    lines.push("  [ -n \"$oldest\" ] && [ \"$oldest\" != \"$prev\" ] || break")
    lines.push("  rm -f -- \"$oldest\"")
    lines.push("  prev=$oldest")
    lines.push("done")
  }

  // Assumes file names contain no newlines (`ls | tr` pipeline); an embedded
  // newline would desync COUNT. Upgrade to `find -printf` if that bites.
  lines.push("echo \"LAST=$last\"")
  lines.push("echo \"ERR=$err\"")
  lines.push("echo \"COUNT=$(ls -1 -- *.png *.jpg 2>/dev/null | wc -l | tr -d ' ')\"")
  return lines.join("\n")
}
