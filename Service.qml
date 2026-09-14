import QtQuick
import Quickshell
import Quickshell.Io
import "Capture.js" as Capture

Item {
  id: root

  // Config lives in this plugin's own file rather than inline in shell.json:
  // it survives the widget being removed from the bar, and every edit routes
  // through this service — the single writer.
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
  property double nowMs: 0

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
    if (root.locked) return "Paused — screen locked"
    if (root.idlePaused) return "Paused — idle"
    if (!Capture.isWithinActiveHours(root.config.activeFrom, root.config.activeTo, new Date(root.nowMs)))
      return "Paused — outside " + root.config.activeFrom + "–" + root.config.activeTo
    var s = "Every " + root.config.periodSec + "s"
    if (root.lastShotAt > 0)
      s += " · last " + Qt.formatDateTime(new Date(root.lastShotAt), "HH:mm:ss")
    if (root.fileCount >= 0)
      s += " · " + root.fileCount + " file" + (root.fileCount === 1 ? "" : "s")
    return s
  }

  function saveConfig(patch) {
    var next = ({})
    for (var key in root.config) next[key] = root.config[key]
    for (var p in patch) next[p] = patch[p]
    applyConfig(JSON.stringify(Capture.normalize(next)))
    configFile.setText(JSON.stringify(root.config, null, 2) + "\n")
  }

  function applyConfig(raw) {
    root.config = Capture.normalize(parseConfig(raw))
    root.loaded = true
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

  function openFolder() {
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

  function applyCaptureOutput(text) {
    var sawLocked = false
    var lines = String(text || "").split("\n")
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      if (line === "LOCKED=1") sawLocked = true
      else if (line.indexOf("LAST=") === 0) root.lastShot = line.slice(5)
      else if (line.indexOf("ERR=") === 0) root.lastError = line.slice(4).trim()
      else if (line.indexOf("COUNT=") === 0)
        root.fileCount = parseInt(line.slice(6), 10) || 0
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
