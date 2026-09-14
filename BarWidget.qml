import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "fazuh.screenlogs"

  readonly property var service: bar && bar.shell
    ? bar.shell.serviceFor(root.moduleName) : null
  readonly property bool ready: service !== null
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  // BarWidget does not derive implicit size from children; forward the
  // button's size so a live, clickable slot is created.
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function open() { if (panelLoader.item) panelLoader.item.open() }
  function close() { if (panelLoader.item) panelLoader.item.close() }
  function toggle() { if (panelLoader.item) panelLoader.item.toggle() }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
    if ("service" in target) target.service = root.service
  }

  onBarChanged: injectPanel()
  onServiceChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  IpcHandler {
    target: root.moduleName

    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function capture(): void { if (root.ready) root.service.captureNow() }
    function enable(): void { if (root.ready) root.service.setEnabled(true) }
    function disable(): void { if (root.ready) root.service.setEnabled(false) }
    function status(): string {
      if (!root.ready) return "service unavailable"
      var s = (root.service.config.enabled ? "enabled · " : "paused · ")
        + root.service.statusText()
        + (root.service.lastError !== "" ? " error=\"" + root.service.lastError + "\"" : "")
        + " dir=" + root.service.config.dir
      return s
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "\uf030"
    dimmed: !root.ready || !root.service.config.enabled
    active: root.ready && root.service.busy
    tooltipText: !root.ready ? "Screenlogs unavailable"
      : (root.service.config.enabled
          ? "Screenlogs — " + root.service.statusText()
          : "Screenlogs — paused")
    onPressed: function(code) {
      if (code === Qt.LeftButton) root.toggle()
      else if (code === Qt.MiddleButton && root.ready) root.service.captureNow()
      else if (code === Qt.RightButton && root.ready)
        root.service.setEnabled(!root.service.config.enabled)
    }
  }
}
