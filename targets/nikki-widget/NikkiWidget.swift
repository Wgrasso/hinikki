// NikkiWidget.swift — the "Praat met Nikki" widget: a microphone pictogram + a Dutch prompt that
// opens HiNikki when tapped. It is deliberately static (its only job is to launch the app), so the
// timeline is a single, never-refreshing entry. Supports every widget family a phone can show:
// home screen (small / medium / large) and lock screen (circular / rectangular / inline).
import WidgetKit
import SwiftUI

// MARK: - Brand colors (mirrors src/theme.ts; painted explicitly so we never rely on asset lookup)

extension Color {
    /// 0xRRGGBB → Color. Keeps the hex from src/theme.ts readable at the call site.
    init(hex: UInt32) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1.0)
    }
}

private let nikkiTeal = Color(hex: 0x2E6E6A)   // theme.colors.primary
private let nikkiCream = Color(hex: 0xFAF4EA)  // theme.colors.background

// MARK: - Timeline (static: one entry, never reloads)

struct NikkiEntry: TimelineEntry {
    let date: Date
}

struct NikkiProvider: TimelineProvider {
    func placeholder(in context: Context) -> NikkiEntry {
        NikkiEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (NikkiEntry) -> Void) {
        completion(NikkiEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NikkiEntry>) -> Void) {
        // The content never changes, so hand back a single entry and ask iOS never to refresh.
        completion(Timeline(entries: [NikkiEntry(date: Date())], policy: .never))
    }
}

// MARK: - View

struct NikkiWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: NikkiProvider.Entry

    var body: some View {
        content
            // Tapping the widget opens the app at its root; normal boot routing lands a user on Nikki.
            .widgetURL(URL(string: "hinikki://"))
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryInline:
            // Lock-screen inline: one system-tinted line next to the app clock.
            Label("Praat met Nikki", systemImage: "mic.fill")

        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "mic.fill")
                    .font(.system(size: 22, weight: .semibold))
            }

        case .accessoryRectangular:
            HStack(spacing: 8) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 20, weight: .semibold))
                Text("Praat met Nikki")
                    .font(.headline)
                    .minimumScaleFactor(0.7)
                    .lineLimit(2)
            }

        default:
            homeScreen
        }
    }

    // Home-screen sizes: a warm teal card with a cream microphone and the full Dutch prompt.
    private var homeScreen: some View {
        VStack(spacing: family == .systemSmall ? 10 : 16) {
            ZStack {
                Circle().fill(nikkiCream.opacity(0.16))
                Image(systemName: "mic.fill")
                    .font(.system(size: micSize, weight: .semibold))
                    .foregroundStyle(nikkiCream)
            }
            .frame(width: micCircle, height: micCircle)

            Text("Klik hier als je met Nikki wilt praten")
                .font(.system(size: textSize, weight: .semibold, design: .rounded))
                .foregroundStyle(nikkiCream)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.7)
                .lineLimit(4)
        }
        .padding(family == .systemSmall ? 12 : 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetTealBackground()
    }

    // Per-family sizing so the pictogram and text feel right at every scale.
    private var micSize: CGFloat {
        switch family {
        case .systemSmall: return 34
        case .systemLarge: return 66
        default: return 46 // systemMedium
        }
    }

    private var micCircle: CGFloat {
        switch family {
        case .systemSmall: return 66
        case .systemLarge: return 130
        default: return 92 // systemMedium
        }
    }

    private var textSize: CGFloat {
        switch family {
        case .systemSmall: return 15
        case .systemLarge: return 27
        default: return 20 // systemMedium
        }
    }
}

// iOS 17 requires containerBackground to fill the widget; earlier iOS uses a plain background.
private extension View {
    @ViewBuilder
    func widgetTealBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(nikkiTeal, for: .widget)
        } else {
            self.background(nikkiTeal)
        }
    }
}

// MARK: - Widget

struct NikkiWidget: Widget {
    let kind: String = "NikkiWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NikkiProvider()) { entry in
            NikkiWidgetView(entry: entry)
        }
        .configurationDisplayName("Praat met Nikki")
        .description("Tik om Nikki te openen en met haar te praten.")
        .supportedFamilies([
            .systemSmall, .systemMedium, .systemLarge,
            .accessoryCircular, .accessoryRectangular, .accessoryInline,
        ])
        .contentMarginsDisabled() // we paint our own full-bleed background
    }
}

// MARK: - Xcode preview (dev only; not compiled into the shipped binary's behavior)

#Preview(as: .systemSmall) {
    NikkiWidget()
} timeline: {
    NikkiEntry(date: .now)
}
