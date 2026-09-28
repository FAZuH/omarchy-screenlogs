// Run: node test.mjs — self-check for Capture.js config and shell-script logic.
import { readFileSync, mkdtempSync, writeFileSync, utimesSync, readdirSync, mkdirSync, symlinkSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"

const src = readFileSync(new URL("./Capture.js", import.meta.url), "utf8")
  .replace(/^\.pragma library\s*/, "")
const C = new Function(src +
  "\nreturn { DEFAULTS, normalize, parseClock, isWithinActiveHours, toggleMonitor," +
  " isMonitorSelected, coversAll, expandHome, shQuote, safeMonitor, stamp," +
  " groupDigits, formatAge, countUsage, ageUsage, budgetUsage, dirCheckScript," +
  " collapseHome, dirNotice, captureScript }")()

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
check("count prune keeps the newest 500", pruned.includes("head -n -500"), true)
check("count prune never deletes from the newest end", pruned.includes("tail -n +"), false)
check("age prune uses minutes", pruned.includes("-mmin +1440"), true)
check("age prune off runs no find",
  C.captureScript(cfg({ keepHours: 0 }), at, ["DP-1"], "/home/u").includes("-mmin"), false)
check("disk prune measures the directory", pruned.includes("du -sk -- ."), true)
check("disk budget 2048 is enforced in KB",
  pruned.includes("budget=$(( 2048 * 1024 ))"), true)
check("disk prune deletes oldest first from the sorted list",
  pruned.includes("read -r _mtime blocks name; do")
    && pruned.includes("done < <(printf '%s\\n' \"$own\")"), true)
check("disk prune subtracts each file's real KB",
  pruned.includes("total=$((total - (blocks + 1) / 2))"), true)
check("disk prune stops when deletions stop helping",
  pruned.includes('[ -e "$name" ] || continue'), true)
check("count prune does not shrink the budget by already-deleted files",
  pruned.indexOf('[ -e "$name" ] || continue')
    < pruned.indexOf("total=$((total - (blocks + 1) / 2))"), true)
check("age prune deletes only plugin-named files",
  pruned.includes("-name 'st-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]*.png'"), true)
check("count prune matches the naming convention",
  pruned.includes("-printf '%T@\\t%b\\t%f\\n'"), true)
check("no deletion matches every png or jpg",
  pruned.includes("-name '*.png'") || pruned.includes("ls -1t -- *.png"), false)
check("no ls glob survives: past ~65k files ARG_MAX zeroes the listing",
  /ls -1[a-z]* -- st-/.test(pruned), false)
check("file count uses the naming convention",
  pruned.includes("own=$(find . -maxdepth 1 -type f") && pruned.includes("COUNT=$(printf"), true)
// The capture script must ask the same question the settings window asks. If it
// ever carries its own copy of the rule, the two can drift and retention can
// delete somewhere the window promised it would not.
check("the capture script reuses the probe's rule rather than copying it",
  C.dirCheckScript("/x").split("\n").slice(1).every((l) => pruned.includes(l)), true)
check("retention refuses a symlinked path",
  pruned.includes('  *) prune= ;;'), true)
check("retention refuses / and the home directory for deletion, not just for du",
  pruned.includes("  UNSAFE) prune=; measure= ;;"), true)
check("the budget loop is gated on deletion being safe",
  pruned.indexOf("while IFS=$'\\t' read")
    > pruned.lastIndexOf('if [ -n "$prune" ]; then'), true)
check("the size readout is not gated on deletion being safe",
  pruned.includes("du -sk -- .")
    && pruned.indexOf("du -sk -- .") > pruned.indexOf('case "$check" in'), true)
check("prunes run inside the deletion guard",
  pruned.indexOf("head -n -500") > pruned.indexOf('if [ -n "$prune" ]; then')
    && pruned.indexOf("head -n -500") < pruned.indexOf("budget=$(( 2048 * 1024 ))"), true)
check("cd failure aborts before retention",
  pruned.includes("cd -- '/home/u/Pix' 2>/dev/null || { echo \"ERR=directory\"; exit 1; }"), true)
check("retention never runs before the directory change",
  pruned.indexOf("cd -- ") < pruned.indexOf("find ."), true)
check("the directory is scanned once per round, not once per prune",
  (pruned.match(/own=\$\(find \. -maxdepth 1 -type f/g) || []).length, 1)
check("all prunes off delete nothing",
  C.captureScript(cfg({ keep: 0, keepHours: 0, maxDiskMb: 0 }), at, ["DP-1"], "/home/u")
    .includes("rm -f"), false)
check("all prunes off still measure the directory for the readout",
  C.captureScript(cfg({ keep: 0, keepHours: 0, maxDiskMb: 0 }), at, ["DP-1"], "/home/u")
    .includes("du -sk -- ."), true)
check("age prune off runs no -mmin",
  C.captureScript(cfg({ keepHours: 0 }), at, ["DP-1"], "/home/u").includes("-mmin"), false)

// ---- capture script: reporting ----
check("last shot is reported", script.includes('echo "LAST=$last"'), true)
check("failed monitors are reported", script.includes('echo "ERR=$err"'), true)
check("file count is reported", script.includes("COUNT="), true)
check("directory size is reported in MB", pruned.includes('echo "SIZE=$size"'), true)
check("size is measured in KB then rounded to MB",
  pruned.includes("size=$(( (total + 1023) / 1024 ))"), true)
check("oldest file time is reported in epoch seconds",
  pruned.includes('echo "OLDEST=$(printf') && pruned.includes("cut -d. -f1"), true)

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

// Every combination of limits has to produce a script bash will accept: an
// empty `if … fi` is a syntax error, and one limit switching off is enough to
// empty a block.
for (const limits of [{}, { keep: 0 }, { keepHours: 0 }, { maxDiskMb: 0 },
  { keep: 0, keepHours: 0, maxDiskMb: 0 }, { keep: 10 }, { keepHours: 5 },
  { maxDiskMb: 500 }, { keep: 10, keepHours: 5, maxDiskMb: 500 }]) {
  const name = Object.keys(limits).join("+") || "defaults"
  let bad = ""
  try {
    execFileSync("bash", ["-n"], {
      input: C.captureScript(C.normalize({ dir: "~/x", ...limits }), at, [], "/home/u")
    })
  } catch (e) {
    bad = String(e.stderr)
  }
  check(`script parses with ${name}`, bad, "")
}

// ---- retention: run the generated script for real ----
// String assertions cannot tell "deletes the oldest" from "deletes the
// newest", so the retention half of the script is executed against a
// throwaway directory reached through a symlink, the shape a stock Omarchy
// ~/Pictures has.
function pruneDir(files, options) {
  const root = mkdtempSync(join(tmpdir(), "screenlogs-"))
  try {
    // config.link puts the save directory behind a symlink, the shape a stock
    // Omarchy ~/Pictures has; config.homeAsDir makes the save directory the home
    // directory itself, which the probe calls UNSAFE; config.report returns the
    // script's stdout instead of the files left behind.
    const { link = false, homeAsDir = false, report = false, ...config } = options
    mkdirSync(join(root, "real", "shots"), { recursive: true })
    symlinkSync(join(root, "real"), join(root, "link"))
    const dir = homeAsDir ? root : join(root, link ? "link" : "real", "shots")
    for (let i = 0; i < files; i++) {
      const p = join(dir, "st-2026092" + (i % 9) + "-" + String(i).padStart(6, "0") + ".png")
      writeFileSync(p, "x".repeat(4096))
      utimesSync(p, 1790000000 + i * 60, 1790000000 + i * 60)
    }
    writeFileSync(join(dir, "not-ours.png"), "x".repeat(4096))
    const script = C.captureScript(C.normalize({ ...config, dir }), at, [], root)
    // Retention is everything after the directory change.
    const out = execFileSync("bash", ["-c", script.slice(script.indexOf("cd -- "))],
      { cwd: dir, env: { ...process.env, HOME: root } }).toString()
    return report ? out : readdirSync(dir).sort()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const kept = pruneDir(30, { keep: 10 })
check("count prune keeps the newest 10", kept.length, 11) // + not-ours.png
check("count prune keeps the newest, not the oldest",
  kept.some((f) => f.endsWith("-000029.png")), true)
check("count prune dropped the oldest file",
  kept.some((f) => f.endsWith("-000000.png")), false)
check("count prune over the limit deletes nothing", pruneDir(5, { keep: 50 }).length, 6)
check("unrelated files are never deleted", pruneDir(30, { maxDiskMb: 1 })
  .includes("not-ours.png"), true)
check("budget prunes through a symlinked path",
  pruneDir(400, { maxDiskMb: 1 }).length < 400, true)
check("all limits off delete nothing", pruneDir(30, {}).length, 31)
check("a symlinked directory keeps every file",
  pruneDir(30, { maxDiskMb: 1, link: true }).length, 31)
// Aggressive limits against $HOME itself must delete exactly as much as no
// limits at all. Compared rather than counted, so the harness's own scaffolding
// directories do not have to be in the expected number.
check("the home directory keeps every file",
  pruneDir(30, { keep: 5, keepHours: 1, maxDiskMb: 1, homeAsDir: true }).length,
  pruneDir(30, { homeAsDir: true }).length)
check("a symlinked directory still reports a size",
  /\nSIZE=\d/.test(pruneDir(30, { maxDiskMb: 1, link: true, report: true })), true)

// ---- the directory probe the settings window validates with ----
function probe(dir, home) {
  const root = mkdtempSync(join(tmpdir(), "screenlogs-"))
  try {
    mkdirSync(join(root, "real", "shots"), { recursive: true })
    symlinkSync(join(root, "real"), join(root, "link"))
    const script = C.dirCheckScript(dir.replace("$ROOT", root))
    return execFileSync("bash", ["-c", script], {
      cwd: root, env: { ...process.env, HOME: home === "/" ? "/" : root }
    }).toString().trim()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

check("probe passes a plain directory", probe("$ROOT/real/shots"), "SAME")
const symlinked = probe("$ROOT/link/shots").split("\t")
check("probe flags a symlinked directory", symlinked[0], "SYMLINK")
check("probe names the real path behind the symlink",
  symlinked[1].endsWith("/real/shots"), true)
check("probe reports a missing directory", probe("$ROOT/nope"), "MISSING")
check("probe refuses the home directory", probe("$ROOT"), "UNSAFE")

check("notice names the path the user typed and the one to use",
  C.dirNotice("~/Pictures/screenlogs", "/home/u/Media/Pictures/screenlogs", "/home/u"),
  "Retention is off: ~/Pictures/screenlogs is reached through a symlink. "
    + "Use ~/Media/Pictures/screenlogs instead.")
check("notice is empty when there is nothing to suggest",
  C.dirNotice("~/Pictures", "", "/home/u"), "")
check("home collapses to ~", C.collapseHome("/home/u", "/home/u"), "~")
check("a path under home collapses to ~/…", C.collapseHome("/home/u/a/b", "/home/u"), "~/a/b")
check("a path outside home is left alone",
  C.collapseHome("/mnt/c/photos", "/home/u"), "/mnt/c/photos")
check("no home leaves the path alone", C.collapseHome("/mnt/c", ""), "/mnt/c")

// ---- retention readouts ----
check("digits are grouped", C.groupDigits(14839), "14,839")
check("grouping leaves short numbers alone", C.groupDigits(999), "999")
check("grouping handles exactly three digits", C.groupDigits(1000), "1,000")
check("age reads in seconds", C.formatAge(45), "45s")
check("age reads in minutes", C.formatAge(600), "10m")
check("age reads in hours", C.formatAge(7200), "2h")
check("age reads in days", C.formatAge(172800), "2d")
check("age floors junk to zero", C.formatAge(-5), "0s")
check("age floors missing to zero", C.formatAge(undefined), "0s")
check("count readout is plural", C.countUsage(17286), "17,286 files now")
check("count readout is singular", C.countUsage(1), "1 file now")
check("count readout admits an unknown count", C.countUsage(-1), "unknown")
check("age readout measures back from now",
  C.ageUsage(1790000000, 1790000000000), "oldest is 0s old")
check("age readout counts up in hours",
  C.ageUsage(1790000000, (1790000000 + 7200) * 1000), "oldest is 2h old")
check("age readout admits an empty directory", C.ageUsage(0, 1790000000000),
  "no screenshots yet")
check("budget readout reports usage", C.budgetUsage(14839, 5000),
  "14,839 MB used · 9,839 MB over budget")
check("budget readout reports headroom", C.budgetUsage(120, 5000),
  "120 MB used · 4,880 MB to spare")
check("budget readout omits the delta when the limit is off",
  C.budgetUsage(120, 0), "120 MB used")
check("budget readout admits an unmeasurable size", C.budgetUsage(-1, 5000),
  "size unknown")

process.exit(failed ? 1 : 0)
