.pragma library

// Pure logic for the Screenlogs plugin: config normalization and the capture
// shell script. Kept out of QML so `node test.mjs` can exercise it.

var DEFAULTS = {
  enabled: true,
  periodSec: 60,
  keep: 500,
  dir: "~/Pictures/screenlogs",
  monitors: []
}

var PERIOD_MIN = 5
var PERIOD_MAX = 86400
var KEEP_MAX = 100000

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

// Junk in a hand-edited config falls back to the default rather than half
// applying, so `reconcile` never schedules a capture at period 0.
function normalize(raw) {
  var cfg = raw && typeof raw === "object" ? raw : {}
  var dir = typeof cfg.dir === "string" ? cfg.dir.trim() : ""
  return {
    enabled: cfg.enabled === undefined || cfg.enabled === null
      ? DEFAULTS.enabled : cfg.enabled === true,
    periodSec: clamped(cfg.periodSec, DEFAULTS.periodSec, PERIOD_MIN, PERIOD_MAX),
    keep: clamped(cfg.keep, DEFAULTS.keep, 0, KEEP_MAX),
    dir: dir || DEFAULTS.dir,
    monitors: monitorList(cfg.monitors)
  }
}

// An empty monitor list means "every screen", so the box stays correct when a
// monitor is hotplugged. Unchecking one screen therefore materializes the list
// to every other screen, and a list that covers every screen collapses back to
// "all" so a later hotplug is still followed.
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

// Only used for file names and the error report, never for the grim target.
// Stripping `/` and `..` keeps a hand-edited monitor name inside the folder.
function safeMonitor(name) {
  return String(name).replace(/[^A-Za-z0-9._-]/g, "-")
}

function stamp(epochMs) {
  var d = new Date(epochMs)
  function pad(n) { return n < 10 ? "0" + n : String(n) }
  return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
    + "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
}

// One shell run per tick: capture every target, prune to the newest `keep`
// files (0 keeps everything), then report what happened. Values reach bash
// only inside single quotes, and grim failures are recorded per monitor
// instead of aborting the run, so one dead output never stops the others.
function captureScript(dirRaw, keep, epochMs, targets, home) {
  var dir = expandHome(String(dirRaw || DEFAULTS.dir), home)
  var ts = stamp(epochMs)
  var list = monitorList(targets)
  var lines = ["mkdir -p " + shQuote(dir), "last=", "err="]

  if (list.length === 0) {
    var file = shQuote(dir + "/st-" + ts + ".png")
    lines.push("grim " + file + " 2>/dev/null && last=" + file
      + " || err=\"grim\"")
  }
  for (var i = 0; i < list.length; i++) {
    var name = list[i]
    var shot = shQuote(dir + "/st-" + ts + "-" + safeMonitor(name) + ".png")
    lines.push("grim -o " + shQuote(name) + " " + shot
      + " 2>/dev/null && last=" + shot
      + " || err=\"${err:+$err }" + safeMonitor(name) + "\"")
  }

  var k = clamped(keep, DEFAULTS.keep, 0, KEEP_MAX)
  if (k > 0) {
    lines.push("cd " + shQuote(dir) + " 2>/dev/null"
      + " && ls -1t -- *.png *.jpg 2>/dev/null"
      + " | tail -n +" + (k + 1)
      + " | tr '\\n' '\\0' | xargs -0 -r rm -f")
  }
  // ponytail: newline-free file names assumed (`ls | tr` pipeline); a name
  // with an embedded newline would desync the count. Upgrade to
  // `find -printf` if that ever bites.
  lines.push("echo \"LAST=$last\"")
  lines.push("echo \"ERR=$err\"")
  lines.push("echo \"COUNT=$(ls -1 -- *.png *.jpg 2>/dev/null | wc -l | tr -d ' ')\"")
  return lines.join("\n")
}
