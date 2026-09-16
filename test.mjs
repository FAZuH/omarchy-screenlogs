// Run: node test.mjs — self-check for Capture.js config and shell-script logic.
import { readFileSync } from "node:fs"

const src = readFileSync(new URL("./Capture.js", import.meta.url), "utf8")
  .replace(/^\.pragma library\s*/, "")
const C = new Function(src +
  "\nreturn { DEFAULTS, normalize, parseClock, isWithinActiveHours, toggleMonitor," +
  " isMonitorSelected, coversAll, expandHome, shQuote, safeMonitor, stamp," +
  " captureScript }")()

let failed = 0
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a !== e) { failed++; console.error(`FAIL ${name}\n  want ${e}\n  got  ${a}`) }
  else console.log(`ok   ${name}`)
}

const at = new Date(2026, 8, 15, 14, 25, 30).getTime()

// ---- normalize: junk falls back, out-of-range clamps back to the default ----
check("empty config is defaults", C.normalize({}), C.DEFAULTS)
check("period below the floor falls back", C.normalize({ periodSec: 1 }).periodSec, 60)
check("period above the ceiling falls back", C.normalize({ periodSec: 999999 }).periodSec, 60)
check("period must be a whole number", C.normalize({ periodSec: 7.5 }).periodSec, 60)
check("period accepted in range", C.normalize({ periodSec: 300 }).periodSec, 300)
check("keep 0 means keep everything", C.normalize({ keep: 0 }).keep, 0)
check("negative keep falls back", C.normalize({ keep: -5 }).keep, 500)
check("enabled is strictly boolean", C.normalize({ enabled: "yes" }).enabled, false)
check("pauseWhenLocked defaults on", C.normalize({}).pauseWhenLocked, true)
check("pauseWhenLocked explicit false survives", C.normalize({ pauseWhenLocked: false }).pauseWhenLocked, false)
check("pauseWhenLocked junk is false", C.normalize({ pauseWhenLocked: "no" }).pauseWhenLocked, false)
check("format only accepts jpeg", C.normalize({ format: "jpeg" }).format, "jpeg")
check("format alias jpg is not accepted", C.normalize({ format: "jpg" }).format, "png")
check("format junk falls back to png", C.normalize({ format: "PNG" }).format, "png")
check("jpeg quality in range survives", C.normalize({ jpegQuality: 90 }).jpegQuality, 90)
check("jpeg quality 0 falls back", C.normalize({ jpegQuality: 0 }).jpegQuality, 85)
check("jpeg quality 200 falls back", C.normalize({ jpegQuality: 200 }).jpegQuality, 85)
check("keepHours accepted in range", C.normalize({ keepHours: 24 }).keepHours, 24)
check("negative keepHours falls back", C.normalize({ keepHours: -1 }).keepHours, 0)
check("maxDiskMb accepted in range", C.normalize({ maxDiskMb: 2048 }).maxDiskMb, 2048)
check("negative maxDiskMb falls back", C.normalize({ maxDiskMb: -5 }).maxDiskMb, 0)
check("idleMinutes accepted in range", C.normalize({ idleMinutes: 30 }).idleMinutes, 30)
check("idleMinutes above a day falls back", C.normalize({ idleMinutes: 5000 }).idleMinutes, 0)
check("blank dir falls back", C.normalize({ dir: "   " }).dir, "~/Pictures/screenlogs")
check("monitors drops non-strings, blanks, duplicates",
  C.normalize({ monitors: ["DP-1", 7, "", " DP-1 ", "eDP-1"] }).monitors, ["DP-1", "eDP-1"])
check("monitors not a list is empty", C.normalize({ monitors: "DP-1" }).monitors, [])

// ---- clocks: parse to canonical HH:MM or reject ----
check("clock pads the hour", C.parseClock("9:05"), "09:05")
check("clock trims whitespace", C.parseClock("  08:30  "), "08:30")
check("clock rejects single-digit minutes", C.parseClock("9:5"), "")
check("clock rejects hour 24", C.parseClock("24:00"), "")
check("clock rejects minute 60", C.parseClock("23:60"), "")
check("clock rejects prose", C.parseClock("abc"), "")
check("clock rejects empty", C.parseClock(""), "")
check("clock rejects null", C.parseClock(null), "")

// ---- active hours: empty/equal = always, start > end wraps midnight ----
const noon = new Date(2026, 8, 15, 12, 0)
const two = new Date(2026, 8, 15, 2, 0)
const eleven = new Date(2026, 8, 15, 23, 0)
const nine = new Date(2026, 8, 15, 9, 0)
check("no bounds is always active",
  C.isWithinActiveHours("", "", noon), true)
check("equal bounds is always active",
  C.isWithinActiveHours("09:00", "09:00", noon), true)
check("one invalid bound is always active",
  C.isWithinActiveHours("25:00", "17:00", noon), true)
check("day window contains noon",
  C.isWithinActiveHours("09:00", "17:00", noon), true)
check("day window includes the start hour",
  C.isWithinActiveHours("09:00", "17:00", nine), true)
check("day window excludes the end hour",
  C.isWithinActiveHours("09:00", "17:00", new Date(2026, 8, 15, 17, 0)), false)
check("overnight window contains late evening",
  C.isWithinActiveHours("22:00", "06:00", eleven), true)
check("overnight window contains early morning",
  C.isWithinActiveHours("22:00", "06:00", two), true)
check("overnight window excludes midday",
  C.isWithinActiveHours("22:00", "06:00", noon), false)

// ---- monitor selection: [] = all, and the materialize/collapse round trip ----
const screens = ["DP-1", "HDMI-A-1", "eDP-1"]
check("empty selection reports every screen selected", C.isMonitorSelected([], "DP-1"), true)
check("named selection is membership", C.isMonitorSelected(["DP-1"], "eDP-1"), false)
check("unchecking one of all keeps the others",
  C.toggleMonitor([], screens, "HDMI-A-1"), ["DP-1", "eDP-1"])
check("checking a skipped screen adds it",
  C.toggleMonitor(["DP-1"], screens, "eDP-1"), ["DP-1", "eDP-1"])
check("adding the last missing screen collapses to all",
  C.toggleMonitor(["DP-1", "eDP-1"], screens, "HDMI-A-1"), [])
check("removing from an explicit list keeps it explicit",
  C.toggleMonitor(["DP-1", "eDP-1"], screens, "DP-1"), ["eDP-1"])
check("coversAll is false with no screens (nothing to cover)",
  C.coversAll([], []), false)

// ---- paths and quoting ----
check("~ expands", C.expandHome("~/Pictures/screenlogs", "/home/u"), "/home/u/Pictures/screenlogs")
check("bare ~ expands", C.expandHome("~", "/home/u"), "/home/u")
check("absolute path passes through", C.expandHome("/tmp/x", "/home/u"), "/tmp/x")
check("single quote is escaped", C.shQuote("it's"), "'it'\\''s'")
check("leading quote is escaped", C.shQuote("'/tmp x"), "''\\''/tmp x'")
check("monitor name is filename-safe", C.safeMonitor("DP 1/../x"), "DP-1-..-x")
check("stamp is sortable", C.stamp(at), "20260915-142530")
check("stamp pads single-digit fields",
  C.stamp(new Date(2026, 0, 5, 1, 2, 3).getTime()), "20260105-010203")

// ---- capture script: captures ----
const cfg = (over) => C.normalize(Object.assign({}, C.DEFAULTS, over))
const script = C.captureScript(cfg({ dir: "~/Pix", keep: 500 }), at, ["DP-1", "eDP 1"], "/home/u")
check("directory created", script.includes("mkdir -p -- '/home/u/Pix'"), true)
check("mkdir failure aborts the script",
  script.includes("mkdir -p -- '/home/u/Pix' 2>/dev/null || { echo \"ERR=directory\"; exit 1; }"), true)
check("one grim per monitor", script.match(/grim -o /g).length, 2)
check("monitor target is the raw name", script.includes("grim -o 'DP-1'"), true)
check("png needs no type flag", script.includes("-t jpeg"), false)
check("png files use the png extension",
  script.includes("'/home/u/Pix/st-20260915-142530-eDP-1.png'"), true)
check("jpeg sets the quality flag",
  C.captureScript(cfg({ dir: "~/Pix", format: "jpeg" }), at, ["DP-1"], "/home/u")
    .includes(" -t jpeg -q 85"), true)
check("custom jpeg quality reaches grim",
  C.captureScript(cfg({ dir: "~/Pix", format: "jpeg", jpegQuality: 70 }), at, ["DP-1"], "/home/u")
    .includes(" -t jpeg -q 70"), true)
check("jpeg files use the jpg extension",
  C.captureScript(cfg({ dir: "~/Pix", format: "jpeg" }), at, ["DP-1"], "/home/u")
    .includes("st-20260915-142530-DP-1.jpg"), true)

// ---- capture script: pause while locked ----
const lockOn = C.captureScript(cfg({}), at, ["DP-1"], "/home/u")
check("lock check runs before captures",
  lockOn.includes("if omarchy-hyprland-session-locked 2>/dev/null; then echo LOCKED=1; exit 0; fi"), true)
check("lock off runs no check",
  C.captureScript(cfg({ pauseWhenLocked: false }), at, ["DP-1"], "/home/u")
    .includes("omarchy-hyprland-session-locked"), false)

// ---- capture script: retention ----
const pruned = C.captureScript(
  cfg({ dir: "~/Pix", keep: 500, keepHours: 24, maxDiskMb: 2048 }), at, ["DP-1"], "/home/u")
check("count prune keeps the newest 500", pruned.includes("tail -n +501"), true)
check("age prune uses minutes", pruned.includes("-mmin +1440"), true)
check("age prune off runs no find",
  C.captureScript(cfg({ keepHours: 0 }), at, ["DP-1"], "/home/u").includes("-mmin"), false)
check("disk prune measures the directory", pruned.includes("du -sm -- ."), true)
check("disk budget 2048 is enforced", pruned.includes("-gt 2048"), true)
check("disk prune stops when deletions stop helping",
  pruned.includes('[ "$oldest" != "$prev" ]'), true)
check("cd failure aborts before retention",
  pruned.includes("cd -- '/home/u/Pix' 2>/dev/null || { echo \"ERR=directory\"; exit 1; }"), true)
check("retention never runs before the directory change",
  pruned.indexOf("cd -- ") < pruned.indexOf("find ."), true)
check("all prunes off run neither find nor du",
  C.captureScript(cfg({ keep: 0, keepHours: 0, maxDiskMb: 0 }), at, ["DP-1"], "/home/u")
    .includes("du -sm"), false)

// ---- capture script: reporting ----
check("last shot is reported", script.includes('echo "LAST=$last"'), true)
check("failed monitors are reported", script.includes('echo "ERR=$err"'), true)
check("file count is reported", script.includes("COUNT="), true)

// ---- capture script: hostile input stays quoted ----
const evil = C.captureScript(cfg({ dir: "'/tmp x" }), at, ["a'b"], "/home/u")
check("hostile dir stays one quoted word", evil.includes("mkdir -p -- ''\\''/tmp x'"), true)
check("hostile monitor target stays one quoted word",
  evil.includes("grim -o 'a'\\''b'"), true)
check("no monitors falls back to one all-screen grim",
  C.captureScript(cfg({ dir: "~/Pix" }), at, [], "/home/u")
    .includes("grim '/home/u/Pix/st-20260915-142530.png' 2>/dev/null"), true)
check("no monitors runs no per-output grim",
  C.captureScript(cfg({ dir: "~/Pix" }), at, [], "/home/u").includes("grim -o"), false)

process.exit(failed ? 1 : 0)
