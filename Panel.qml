import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import qs.Ui

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

  function open() { controller.show() }
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
    contentWidth: panel.fittedContentWidth(Style.space(400))
    contentHeight: panel.fittedContentHeight(content.implicitHeight, Style.space(420))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

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
          trailingControl: Component {
            Button {
              iconText: "\uf013"
              tooltipText: "Settings"
              bordered: true
              focusable: true
              enabled: root.service !== null
              foreground: root.foreground
              accent: Color.accent
              fontFamily: root.fontFamily
              onClicked: {
                root.close()
                if (root.service) root.service.showSettings()
              }
            }
          }
        }

        PanelSeparator { Layout.fillWidth: true; foreground: root.foreground }

        Toggle {
          Layout.fillWidth: true
          label: "Capture screenshots"
          description: root.service && root.service.config.enabled
            ? "Screenshot every " + root.service.config.periodSec + " seconds."
            : "Paused. Middle-click the bar icon captures once without resuming."
          checked: root.service ? root.service.config.enabled : false
          foreground: root.foreground
          accent: Color.accent
          fontFamily: root.fontFamily
          enabled: root.service !== null
          onClicked: if (root.service) root.service.setEnabled(!root.service.config.enabled)
        }

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
