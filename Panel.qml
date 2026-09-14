import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "Capture.js" as Capture

Panel {
  id: root
  moduleName: "fazuh.screenlogs"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property var service: null
  readonly property var barIdentity: hostWidget || root
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.45)
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  // The folder field is a draft while typing; it commits on Enter and is
  // re-seeded whenever the panel opens, so a service write can't clobber text
  // mid-edit.
  property string dirDraft: ""

  readonly property var screens: root.opened && root.service
    ? root.service.screenNames() : []

  function open() {
    if (root.service) root.dirDraft = root.service.config.dir
    controller.show()
  }

  function close() { controller.hide() }
  function toggle() { opened ? close() : open() }

  function switchPanel(direction) {
    if (bar && typeof bar.switchPanelFrom === "function")
      return bar.switchPanelFrom(barIdentity, direction)
    return false
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(440))
    contentHeight: panel.fittedContentHeight(content.implicitHeight, Style.space(640))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Flickable {
        anchors.fill: parent
        contentWidth: width
        contentHeight: content.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        ColumnLayout {
          id: content
          width: parent.width
          spacing: Style.space(12)

          PanelHero {
            Layout.fillWidth: true
            title: "Screenlogs"
            meta: root.service ? root.service.statusText() : "Service unavailable"
            foreground: root.foreground
            fontFamily: root.fontFamily
            iconComponent: Component {
              Text {
                text: "\uf030"
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.display
              }
            }
          }

          PanelSeparator { Layout.fillWidth: true; foreground: root.foreground }

          PanelSectionHeader {
            Layout.fillWidth: true
            text: "SCHEDULE"
            foreground: root.foreground
            fontFamily: root.fontFamily
          }

          Toggle {
            Layout.fillWidth: true
            label: "Capture screenshots"
            description: root.service && root.service.config.enabled
              ? "A screenshot every " + root.service.config.periodSec + " seconds."
              : "Paused. Middle-click the bar icon captures once without resuming."
            checked: root.service ? root.service.config.enabled : false
            foreground: root.foreground
            accent: Color.accent
            fontFamily: root.fontFamily
            enabled: root.service !== null
            onClicked: if (root.service) root.service.setEnabled(!root.service.config.enabled)
          }

          NumberField {
            label: "Every (seconds)"
            from: Capture.PERIOD_MIN
            to: Capture.PERIOD_MAX
            stepSize: 5
            value: root.service ? root.service.config.periodSec : Capture.DEFAULTS.periodSec
            foreground: root.foreground
            accent: Color.accent
            fontFamily: root.fontFamily
            enabled: root.service !== null
            onModified: function(value) { if (root.service) root.service.setPeriod(value) }
          }

          NumberField {
            label: "Keep recent screenshots"
            from: 0
            to: Capture.KEEP_MAX
            stepSize: 25
            value: root.service ? root.service.config.keep : Capture.DEFAULTS.keep
            foreground: root.foreground
            accent: Color.accent
            fontFamily: root.fontFamily
            enabled: root.service !== null
            onModified: function(value) { if (root.service) root.service.setKeep(value) }
          }

          Text {
            Layout.fillWidth: true
            text: "0 keeps everything. Pruning counts files in the save folder, newest first, across all monitors."
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }

          PanelSeparator { Layout.fillWidth: true; foreground: root.foreground }

          PanelSectionHeader {
            Layout.fillWidth: true
            text: "SAVE FOLDER"
            foreground: root.foreground
            fontFamily: root.fontFamily
          }

          TextField {
            id: dirField
            Layout.fillWidth: true
            placeholderText: Capture.DEFAULTS.dir
            text: root.dirDraft
            foreground: root.foreground
            accent: Color.accent
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
            enabled: root.service !== null
            onAccepted: {
              if (root.service) root.service.setDir(text)
              root.dirDraft = text
              focus = false
            }
            Keys.onPressed: function(event) {
              if (event.key === Qt.Key_Escape) {
                focus = false
                event.accepted = true
              }
            }
          }

          Text {
            Layout.fillWidth: true
            text: "Press Enter to save. `~` expands to the home directory; the folder is created on the next capture."
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }

          PanelSeparator { Layout.fillWidth: true; foreground: root.foreground }

          PanelSectionHeader {
            Layout.fillWidth: true
            text: "MONITORS"
            foreground: root.foreground
            fontFamily: root.fontFamily
          }

          Text {
            Layout.fillWidth: true
            visible: root.screens.length === 0
            text: "No screens detected."
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }

          Repeater {
            model: root.screens

            delegate: Toggle {
              required property var modelData
              Layout.fillWidth: true
              label: modelData
              description: root.service && root.service.isMonitorSelected(modelData)
                ? "Captured" : "Skipped"
              checked: root.service ? root.service.isMonitorSelected(modelData) : false
              foreground: root.foreground
              accent: Color.accent
              fontFamily: root.fontFamily
              enabled: root.service !== null
              onClicked: if (root.service) root.service.toggleMonitor(modelData)
            }
          }

          Text {
            Layout.fillWidth: true
            text: root.service && root.service.config.monitors.length === 0
              ? "Every screen is captured, and a monitor plugged in later is picked up automatically."
              : "Only the checked screens are captured, one file each per period."
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }

          PanelSeparator { Layout.fillWidth: true; foreground: root.foreground }

          RowLayout {
            Layout.fillWidth: true
            spacing: Style.space(8)

            Button {
              Layout.fillWidth: true
              text: "Capture now"
              iconText: "\uf030"
              bordered: true
              focusable: true
              enabled: root.service && !root.service.busy
              foreground: root.foreground
              accent: Color.accent
              fontFamily: root.fontFamily
              onClicked: if (root.service) root.service.captureNow()
            }

            Button {
              Layout.fillWidth: true
              text: "Open folder"
              iconText: "󰥨"
              bordered: true
              focusable: true
              enabled: root.service !== null
              foreground: root.foreground
              accent: Color.accent
              fontFamily: root.fontFamily
              onClicked: if (root.service) root.service.openFolder()
            }
          }

          Text {
            Layout.fillWidth: true
            visible: root.service && root.service.lastError !== ""
            text: root.service ? "Failed: " + root.service.lastError : ""
            textFormat: Text.PlainText
            color: root.urgent
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }

          Text {
            Layout.fillWidth: true
            visible: root.service && root.service.lastShot !== ""
            text: root.service && root.service.lastShot !== ""
              ? "Latest: " + root.service.lastShot.split("/").pop() : ""
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }
        }
      }
    }
  }
}
