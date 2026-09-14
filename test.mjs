// Run: node test.mjs — self-check for Capture.js config and shell-script logic.
import { readFileSync } from "node:fs"

const src = readFileSync(new URL("./Capture.js", import.meta.url), "utf8")
  .replace(/^\.pragma library\s*/, "")
const C = new Function(src +
  "\nreturn { DEFAULTS, normalize, toggleMonitor, isMonitorSelected, coversAll," +
  " expandHome, shQuote, safeMonitor, stamp, captureScript }")()

let failed = 0
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a !== e) { failed++; console.error(`FAIL ${name}\n  want ${e}\n  got  ${a}`) }
  else console.log(`ok   ${name}`)
}

// ---- normalize: junk falls back, out-of-range clamps back to the default ----
check("empty config is defaults", C.normalize({}), C.DEFAULTS)
check("period below the floor falls back", C.normalize({ periodSec: 1 }).periodSec, 60)
check("period above the ceiling falls back", C.normalize({ periodSec: 999999 }).periodSec, 60)
check("period must be a whole number", C.normalize({ periodSec: 7.5 }).periodSec, 60)
check("period accepted in range", C.normalize({ periodSec: 300 }).periodSec, 300)
check("keep 0 means keep everything", C.normalize({ keep: 0 }).keep, 0)
check("negative keep falls back", C.normalize({ keep: -5 }).keep, 500)
check("enabled is strictly boolean", C.normalize({ enabled: "yes" }).enabled, false)
check("blank dir falls back", C.normalize({ dir: "   " }).dir, "~/Pictures/screenlogs")
check("monitors drops non-strings, blanks, duplicates",
  C.normalize({ monitors: ["DP-1", 7, "", " DP-1 ", "eDP-1"] }).monitors, ["DP-1", "eDP-1"])
check("monitors not a list is empty", C.normalize({ monitors: "DP-1" }).monitors, [])

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
check("monitor name is filename-safe", C.safeMonitor("DP 1/../x"), "DP-1-..-x")

// ---- capture script ----
const at = new Date(2026, 8, 15, 14, 25, 30).getTime()
const script = C.captureScript("~/Pix", 500, at, ["DP-1", "eDP 1"], "/home/u")
check("stamp is sortable", C.stamp(at), "20260915-142530")
check("folder created", script.includes("mkdir -p '/home/u/Pix'"), true)
check("one grim per monitor", script.match(/grim -o /g).length, 2)
check("monitor target is the raw name", script.includes("grim -o 'DP-1'"), true)
check("file name is sanitized",
  script.includes("'/home/u/Pix/st-20260915-142530-eDP-1.png'"), true)
check("prune keeps the newest 500", script.includes("tail -n +501"), true)
check("result lines are reported",
  [script.includes("echo \"LAST=$last\""), script.includes("echo \"ERR=$err\""),
    script.includes("COUNT=")].every(Boolean), true)

const loose = C.captureScript("~/Pix", 0, at, [], "/home/u")
check("keep 0 prunes nothing", loose.includes("tail"), false)
check("no monitors falls back to one all-screen grim",
  loose.includes("grim '/home/u/Pix/st-20260915-142530.png' 2>/dev/null"), true)
check("no monitors runs no per-output grim", loose.includes("grim -o"), false)

const evil = C.captureScript("'/tmp x", 10, at, ["a'b"], "/home/u")
check("hostile dir stays one quoted word",
  evil.includes("mkdir -p " + C.shQuote("'/tmp x")), true)
check("hostile monitor target stays one quoted word",
  evil.includes("grim -o " + C.shQuote("a'b")), true)
check("quote characters are escaped, not left bare",
  C.shQuote("'/tmp x"), "''\\''/tmp x'")

process.exit(failed ? 1 : 0)
