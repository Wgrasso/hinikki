// index.swift — the widget extension's @main entry point (the one WidgetBundle for this target).
// @bacons/apple-targets compiles every Swift file in this folder into the extension; exactly one
// file may carry @main. The widget itself is defined in NikkiWidget.swift.
import WidgetKit
import SwiftUI

@main
struct NikkiWidgetBundle: WidgetBundle {
    var body: some Widget {
        NikkiWidget()
    }
}
