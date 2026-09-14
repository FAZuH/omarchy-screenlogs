import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "Capture.js" as Capture

PanelWindow {
  id: root

  property var service: null
  property bool opened: false
  visible: opened
  color: "transparent"
  exclusionMode: ExclusionMode.Ignore
  anchors {
    left: true
    right: true
    top: true
    bottom: true
  }
  WlrLayershell.namespace: "fazuh-screenlogs-settings"
  WlrLayershell.layer: WlrLayer.Overlay
  // OnDemand, not the menu's Exclusive: a settings window must not steal the
  // keyboard from the rest of the desktop while it is open.
  WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand

  readonly property color text: Color.popups.text
  readonly property color dim: Qt.darker(Color.popups.text, 1.45)
  readonly property string fontFamily: Style.font.family

  // Text fields are drafts while typing; they commit on Enter and re-seed
  // from the config whenever the window opens, so a service write can't
  // clobber text mid-edit.
  property string dirDraft: ""
  property string fromDraft: ""
  property string toDraft: ""

  readonly property var screens: root.opened && root.service
    ? root.service.screenNames() : []

  onOpenedChanged: if (opened && root.service) {
    root.dirDraft = root.service.config.dir
    root.fromDraft = root.service.config.activeFrom
    root.toDraft = root.service.config.activeTo
  }

  function close() { root.opened = false }

  Shortcut {
    sequences: ["Esc"]
    enabled: root.opened
    onActivated: root.close()
  }

  Rectangle {
    anchors.fill: parent
    color: Color.menu.scrim
    MouseArea {
      anchors.fill: parent
      onClicked: root.close()
    }
  }

  Rectangle {
    id: card

    width: Math.min(Style.space(560), root.width - Style.space(32))
    height: Math.min(root.height - Style.space(48),
      headerRow.implicitHeight + Style.space(28) + settings.implicitHeight + 2)
    anchors.centerIn: parent
    color: Color.popups.background
    radius: Style.cornerRadius
    border.color: Color.popups.border
    border.width: Style.normalBorderWidth

    // Swallows clicks on card padding so the scrim underneath can't close
    // the window when the user clicks inside the card but off a control.
    MouseArea { anchors.fill: parent }

    ColumnLayout {
      id: contentCol
      anchors.fill: parent
      anchors.margins: Style.space(14)
      spacing: Style.space(12)

      RowLayout {
        id: headerRow
        Layout.fillWidth: true
        spacing: Style.space(10)

        Text {
          textFormat: Text.PlainText
          text: "Screenlogs settings"
          color: root.text
          font.family: root.fontFamily
          font.pixelSize: Style.font.title
          font.bold: true
        }

        Item { Layout.fillWidth: true }

        Button {
          iconText: "✕"
          text: ""
          bordered: true
          focusable: true
          foreground: root.text
          accent: Color.accent
          fontFamily: root.fontFamily
          onClicked: root.close()
        }
      }

      Flickable {
        Layout.fillWidth: true
        Layout.fillHeight: true
        contentWidth: width
        contentHeight: settings.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        ColumnLayout {
          id: settings
          width: parent.width
          spacing: Style.space(10)

          PanelSectionHeader {
            Layout.fillWidth: true
            text: "SCHEDULE"
            foreground: root.text
            fontFamily: root.fontFamily
          }

          NumberField {
            Layout.fillWidth: true
            label: "Every (seconds)"
            from: Capture.PERIOD_MIN
            to: Capture.PERIOD_MAX
            stepSize: 5
            value: root.service ? root.service.config.periodSec : Capture.DEFAULTS.periodSec
            foreground: root.text
            accent: Color.accent
            fontFamily: root.fontFamily
            enabled: root.service !== null
            onModified: function(value) {
              if (root.service) root.service.saveConfig({ periodSec: value })
            }
          }

          Toggle {
            Layout.fillWidth: true
            label: "Pause while the screen is locked"
            checked: root.service ? root.service.config.pauseWhenLocked : Capture.DEFAULTS.pauseWhenLocked
            foreground: root.text
            accent: Color.accent
            fontFamily: root.fontFamily
            enabled: root.service !== null
            onClicked: if (root.service)
              root.service.saveConfig({ pauseWhenLocked: !root.service.config.pauseWhenLocked })
          }

          RowLayout {
            Layout.fillWidth: true
            spacing: Style.space(10)

            TextField {
              id: fromField
              Layout.fillWidth: true
              placeholderText: "Active from (HH:MM)"
              text: root.fromDraft
              foreground: root.text
              accent: Color.accent
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              enabled: root.service !== null
              onAccepted: {
                if (root.service) root.service.saveConfig({ activeFrom: text })
                root.fromDraft = text
                focus = false
              }
              Keys.onPressed: function(event) {
                if (event.key === Qt.Key_Escape) {
                  text = root.fromDraft
                  focus = false
                  event.accepted = true
                }
              }
            }

            TextField {
              id: toField
              Layout.fillWidth: true
              placeholderText: "Active to (HH:MM)"
              text: root.toDraft
              foreground: root.text
              accent: Color.accent
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              enabled: root.service !== null
              onAccepted: {
                if (root.service) root.service.saveConfig({ activeTo: text })
                root.toDraft = text
                focus = false
              }
              Keys.onPressed: function(event) {
                if (event.key === Qt.Key_Escape) {
                  text = root.toDraft
                  focus = false
                  event.accepted = true
                }
              }
            }
          }

          Text {
            Layout.fillWidth: true
            text: "Blank or equal bounds mean always active. Start later than the end wraps past midnight."
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }

          NumberField {
            Layout.fillWidth: true
            label: "Pause after idle (minutes)"
            from: 0
            to: Capture.IDLE_MINUTES_MAX
            stepSize: 5
            value: root.service ? root.service.config.idleMinutes : Capture.DEFAULTS.idleMinutes
            foreground: root.text
            accent: Color.accent
            fontFamily: root.fontFamily
            enabled: root.service !== null
            onModified: function(value) {
              if (root.service) root.service.saveConfig({ idleMinutes: value })
            }
          }

          PanelSeparator { Layout.fillWidth: true; foreground: root.text }

          PanelSectionHeader {
            Layout.fillWidth: true
            text: "CAPTURE"
            foreground: root.text
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
              foreground: root.text
              accent: Color.accent
              fontFamily: root.fontFamily
              enabled: root.service !== null
              onClicked: if (root.service) root.service.toggleMonitor(modelData)
            }
          }

          Toggle {
            Layout.fillWidth: true
            label: "Save as JPEG"
            checked: root.service ? root.service.config.format === "jpeg" : false
            foreground: root.text
            accent: Color.accent
            fontFamily: root.fontFamily
            enabled: root.service !== null
            onClicked: if (root.service)
              root.service.saveConfig({
                format: root.service.config.format === "jpeg" ? "png" : "jpeg"
              })
          }

          NumberField {
            Layout.fillWidth: true
            visible: root.service && root.service.config.format === "jpeg"
            label: "JPEG quality"
            from: 1
            to: 100
            stepSize: 5
            value: root.service ? root.service.config.jpegQuality : Capture.DEFAULTS.jpegQuality
            foreground: root.text
            accent: Color.accent
            fontFamily: root.fontFamily
            enabled: root.service !== null
            onModified: function(value) {
              if (root.service) root.service.saveConfig({ jpegQuality: value })
            }
          }

          Text {
            Layout.fillWidth: true
            text: "Save directory"
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }
          TextField {
            id: dirField
            Layout.fillWidth: true
            placeholderText: Capture.DEFAULTS.dir
            text: root.dirDraft
            foreground: root.text
            accent: Color.accent
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
            enabled: root.service !== null
            onAccepted: {
              if (root.service) root.service.saveConfig({ dir: text })
              root.dirDraft = text
              focus = false
            }
            Keys.onPressed: function(event) {
              if (event.key === Qt.Key_Escape) {
                text = root.dirDraft
                focus = false
                event.accepted = true
              }
            }
          }


          PanelSeparator { Layout.fillWidth: true; foreground: root.text }

          PanelSectionHeader {
            Layout.fillWidth: true
            text: "RETENTION"
            foreground: root.text
            fontFamily: root.fontFamily
          }

          NumberField {
            Layout.fillWidth: true
            label: "Keep recent screenshots"
            from: 0
            to: Capture.KEEP_MAX
            stepSize: 25
            value: root.service ? root.service.config.keep : Capture.DEFAULTS.keep
            foreground: root.text
            accent: Color.accent
            fontFamily: root.fontFamily
            enabled: root.service !== null
            onModified: function(value) {
              if (root.service) root.service.saveConfig({ keep: value })
            }
          }

          NumberField {
            Layout.fillWidth: true
            label: "Keep screenshots newer than (hours)"
            from: 0
            to: Capture.KEEP_HOURS_MAX
            stepSize: 1
            value: root.service ? root.service.config.keepHours : Capture.DEFAULTS.keepHours
            foreground: root.text
            accent: Color.accent
            fontFamily: root.fontFamily
            enabled: root.service !== null
            onModified: function(value) {
              if (root.service) root.service.saveConfig({ keepHours: value })
            }
          }

          NumberField {
            Layout.fillWidth: true
            label: "Directory budget (MB)"
            from: 0
            to: Capture.DISK_MB_MAX
            stepSize: 100
            value: root.service ? root.service.config.maxDiskMb : Capture.DEFAULTS.maxDiskMb
            foreground: root.text
            accent: Color.accent
            fontFamily: root.fontFamily
            enabled: root.service !== null
            onModified: function(value) {
              if (root.service) root.service.saveConfig({ maxDiskMb: value })
            }
          }

          Text {
            Layout.fillWidth: true
            text: "0 turns a limit off."
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
