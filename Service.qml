import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "Capture.js" as Capture

Item {
  id: root

  // Config lives in this plugin's own file rather than inline in shell.json:
  // it survives the widget being removed from the bar, and every edit routes
  // through this service, the single writer.
  readonly property string home: Quickshell.env("HOME")
  readonly property string configDir: home + "/.config/omarchy/screenlogs"
  readonly property string configPath: configDir + "/config.json"

  property bool loaded: false
  property var config: Capture.normalize({})

  property bool busy: false
  property bool locked: false
  property string lastError: ""
  property string lastShot: ""
  property double lastShotAt: 0
  property int fileCount: -1
  property int dirMb: -1
  property double oldestSec: 0
  property double nowMs: 0

  // Non-empty when the save directory is reached through a symlink, which
  // retention refuses. Holds the physical path to suggest instead.
  property string dirRealPath: ""
  // The last save-directory the user typed that retention would refuse.
  property string rejectedDir: ""

  readonly property bool idlePaused: root.config.idleMinutes > 0 && idleMonitor.isIdle

  IdleMonitor {
    id: idleMonitor
    enabled: root.loaded && root.config.idleMinutes > 0
    timeout: root.config.idleMinutes * 60
    respectInhibitors: true
  }

  SettingsWindow {
    id: settingsWindow
    service: root
  }

  function screenNames() {
    var out = []
    var screens = Quickshell.screens || []
    for (var i = 0; i < screens.length; i++) {
      var screen = screens[i]
      if (screen && screen.name && screen.width > 0 && screen.height > 0)
        out.push(String(screen.name))
    }
    return out
  }

  function isMonitorSelected(name) {
    return Capture.isMonitorSelected(root.config.monitors, name)
  }

  function statusText() {
    if (!root.loaded) return "Starting…"
    if (!root.config.enabled) return "Paused"
    if (root.locked) return "Paused: screen locked"
    if (root.idlePaused) return "Paused: idle"
    if (!Capture.isWithinActiveHours(root.config.activeFrom, root.config.activeTo, new Date(root.nowMs)))
      return "Paused: outside " + root.config.activeFrom + "–" + root.config.activeTo
    var s = "Every " + root.config.periodSec + "s"
    if (root.lastShotAt > 0)
      s += " · last " + Qt.formatDateTime(new Date(root.lastShotAt), "HH:mm:ss")
    if (root.fileCount >= 0)
      s += " · " + root.fileCount + " file" + (root.fileCount === 1 ? "" : "s")
    // A configured limit the directory makes unenforceable is worth saying out
    // loud: retention is not running, and pretending otherwise is what made the
    // symlinked-directory case so hard to spot.
    if (root.dirRealPath !== "" && (root.config.keep > 0 || root.config.keepHours > 0
      || root.config.maxDiskMb > 0))
      s += " · retention off (symlinked directory)"
    return s
  }

  // Retention refuses a symlinked save directory. The probe asks the shell the
  // same question the capture script asks, so the warning cannot drift from
  // what actually happens at capture time.
  function checkDir() {
    dirCheck.pending = ""
    dirCheck.command = ["bash", "-c",
      Capture.dirCheckScript(Capture.expandHome(root.config.dir, root.home))]
    dirCheck.running = true
  }

  readonly property string dirNotice: Capture.dirNotice(
    root.rejectedDir !== "" ? root.rejectedDir : root.config.dir,
    root.dirRealPath, root.home)

  function useRealDir() {
    if (!root.dirRealPath) return
    saveConfig({ dir: Capture.collapseHome(root.dirRealPath, root.home) })
    root.rejectedDir = ""
  }

  // Saves the save-directory only when retention would accept it. A rejected
  // path still captures; it just never prunes, so this is a warning, not a lock.
  function saveDir(value) {
    var text = String(value === undefined || value === null ? "" : value).trim()
    dirCheck.pending = text
    dirCheck.command = ["bash", "-c",
      Capture.dirCheckScript(Capture.expandHome(text, root.home))]
    dirCheck.running = true
  }

  function saveConfig(patch) {
    applyConfig(JSON.stringify(Capture.normalize(Object.assign({}, root.config, patch))))
    configFile.setText(JSON.stringify(root.config, null, 2) + "\n")
  }

  function applyConfig(raw) {
    root.config = Capture.normalize(parseConfig(raw))
    root.loaded = true
    checkDir()
  }

  function parseConfig(raw) {
    try {
      return raw && String(raw).trim() !== "" ? JSON.parse(String(raw)) : {}
    } catch (e) {
      console.warn("Screenlogs: bad config.json, using defaults:", e)
      return {}
    }
  }

  function setEnabled(value) {
    saveConfig({ enabled: value === true })
    if (value === true && !root.busy) captureNow()
  }

  function toggleMonitor(name) {
    saveConfig({
      monitors: Capture.toggleMonitor(
        root.config.monitors, root.screenNames(), String(name || ""))
    })
  }

  function openDirectory() {
    openProc.command = ["xdg-open", Capture.expandHome(root.config.dir, root.home)]
    openProc.running = true
  }

  function showSettings() {
    settingsWindow.opened = true
  }

  function toggleSettings() {
    settingsWindow.opened = !settingsWindow.opened
  }

  function captureNow() {
    if (root.busy) return
    root.busy = true
    captureProc.command = ["bash", "-c", Capture.captureScript(
      root.config, Date.now(), root.config.monitors, root.home)]
    captureProc.running = true
  }

  // One-second tick instead of a rescheduled timer: nothing spawns until a
  // capture is actually due, and period, monitor or pause changes (plus
  // suspend/wake) are picked up on the next pass without timer bookkeeping.
  function reconcile() {
    root.nowMs = Date.now()
    if (!root.loaded || root.busy || !root.config.enabled) return
    if (root.idlePaused) return
    if (!Capture.isWithinActiveHours(root.config.activeFrom, root.config.activeTo, new Date(root.nowMs))) return
    var due = root.lastShotAt <= 0
      || (root.nowMs - root.lastShotAt) >= root.config.periodSec * 1000
    if (due) captureNow()
  }

  // A stat the script could not measure arrives empty; 0 is a real value, so
  // NaN has to be told apart from it.
  function numberOr(raw, fallback) {
    var n = parseInt(String(raw), 10)
    return isNaN(n) ? fallback : n
  }

  function applyCaptureOutput(text) {
    var sawLocked = false
    var lines = String(text || "").split("\n")
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      if (line === "LOCKED=1") sawLocked = true
      else if (line.indexOf("LAST=") === 0) root.lastShot = line.slice(5)
      else if (line.indexOf("ERR=") === 0) root.lastError = line.slice(4).trim()
      else if (line.indexOf("COUNT=") === 0) root.fileCount = numberOr(line.slice(6), 0)
      else if (line.indexOf("SIZE=") === 0) root.dirMb = numberOr(line.slice(5), -1)
      else if (line.indexOf("OLDEST=") === 0) root.oldestSec = numberOr(line.slice(7), 0)
    }
    root.locked = sawLocked
    if (!sawLocked) root.lastShotAt = Date.now()
  }

  Process {
    id: configDirProc
    command: ["mkdir", "-p", root.configDir]
  }

  Process {
    id: openProc
    command: ["true"]
  }

  // One probe, two callers: with an empty `pending` it just reports where the
  // configured directory really is, with a pending value it also gates a save.
  Process {
    id: dirCheck
    property string pending: ""

    command: ["true"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var line = String(text || "").trim().split("\n").pop()
        var real = line.indexOf("SYMLINK\t") === 0 ? line.slice(8).trim() : ""
        root.dirRealPath = real
        if (!dirCheck.pending) return
        if (real) {
          root.rejectedDir = dirCheck.pending
          return
        }
        root.rejectedDir = ""
        root.saveConfig({ dir: dirCheck.pending })
      }
    }
  }

  Process {
    id: captureProc
    command: ["true"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyCaptureOutput(text)
    }
    stderr: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var detail = String(text || "").trim()
        // Capture failures already arrive through the ERR line; stderr only
        // carries script-level mistakes (bad cd, xargs missing).
        if (detail && !root.lastError) root.lastError = detail.slice(0, 300)
      }
    }
    onExited: function(exitCode) {
      root.busy = false
      if (exitCode !== 0 && !root.lastError)
        root.lastError = "capture script exited " + exitCode
    }
  }

  FileView {
    id: configFile
    path: root.configDir + "/config.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.applyConfig(text())
    onLoadFailed: {
      applyConfig("")
      saveConfig({})
    }
  }

  Timer {
    id: tickTimer
    interval: 1000
    running: root.loaded
    repeat: true
    onTriggered: root.reconcile()
  }

  Component.onCompleted: {
    configDirProc.running = true
    configFile.reload()
  }
}
