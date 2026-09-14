import QtQuick
import Quickshell
import Quickshell.Io
import "Capture.js" as Capture

Item {
  id: root

  // Config lives in this plugin's own file (like Auto Wallpaper and Snappy do)
  // rather than inline in shell.json: it survives the widget being removed
  // from the bar, and the panel edits it through one writer — this service.
  readonly property string home: Quickshell.env("HOME")
  readonly property string configDir: home + "/.config/omarchy/screenlogs"
  readonly property string configPath: configDir + "/config.json"

  // Mirrors Capture.DEFAULTS until the config file loads. `enabled` and
  // `periodSec` are literal so a stale cached Capture library or a config
  // write racing startup can't leave captures un- or over-scheduled.
  property bool loaded: false
  property var config: ({
    enabled: true,
    periodSec: 60,
    keep: 500,
    dir: Capture.DEFAULTS.dir,
    monitors: []
  })

  property bool busy: false
  property string lastError: ""
  property string lastShot: ""
  property double lastShotAt: 0
  property int fileCount: -1

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
    var s = root.config.enabled
      ? "Every " + root.config.periodSec + "s" : "Paused"
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

  function setPeriod(seconds) {
    saveConfig({ periodSec: seconds })
  }

  function setKeep(count) {
    saveConfig({ keep: count })
  }

  function setDir(text) {
    saveConfig({ dir: text })
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

  function captureNow() {
    if (root.busy) return
    root.busy = true
    captureProc.command = ["bash", "-c", Capture.captureScript(
      root.config.dir, root.config.keep, Date.now(), root.config.monitors, root.home)]
    captureProc.running = true
  }

  // The one-second tick mirrors Auto Wallpaper's scheduler: an in-memory due
  // check that spawns nothing until a capture is actually due, and picks up
  // period or monitor changes (and suspend/wake) without timer bookkeeping.
  function reconcile() {
    if (!root.loaded || root.busy || !root.config.enabled) return
    var due = root.lastShotAt <= 0
      || (Date.now() - root.lastShotAt) >= root.config.periodSec * 1000
    if (due) captureNow()
  }

  function applyCaptureOutput(text) {
    var lines = String(text || "").split("\n")
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      if (line.indexOf("LAST=") === 0) root.lastShot = line.slice(5)
      else if (line.indexOf("ERR=") === 0) root.lastError = line.slice(4).trim()
      else if (line.indexOf("COUNT=") === 0)
        root.fileCount = parseInt(line.slice(6), 10) || 0
    }
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
        // Capture failures are already reported through the ERR line; stderr
        // only carries script-level mistakes (bad cd, xargs missing).
        if (detail && !root.lastError) root.lastError = detail.slice(0, 300)
      }
    }
    onExited: function(exitCode) {
      root.busy = false
      root.lastShotAt = Date.now()
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
    // Fresh install: seed the file so the folder documents itself.
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
