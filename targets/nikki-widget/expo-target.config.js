// expo-target.config.js — declares the iOS "Praat met Nikki" WidgetKit target to @bacons/apple-targets.
// The root /targets folder is magic: this config is what turns the sibling Swift files into a real
// widget extension during `expo prebuild` (run for us by EAS). Keep it minimal — this widget only
// needs to open the app, so no App Group / entitlements / shared data.

/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "NikkiWidget",
  // Pin the extension's bundle id explicitly (dot-prefix = appended to the app id) so it is
  // deterministic: com.willemgrasso.hinikki.nikkiwidget. EAS auto-registers this new App ID +
  // provisioning profile on the first (interactive) build. Without this, the plugin would derive
  // the suffix from the target *type* ("widget"), which is easy to mismatch in docs/credentials.
  bundleIdentifier: ".nikkiwidget",
  // The plugin defaults widget targets to iOS 18.0; lower it so older phones can use the widget.
  // 16.0 still enables every family we ship (home-screen + lock-screen accessory).
  deploymentTarget: "16.0",
  colors: {
    // HiNikki brand tokens (see src/theme.ts). Used by the OS for the widget's system accent/background;
    // the SwiftUI view also paints these explicitly so it never depends on asset-name resolution.
    $accent: "#E0A33E",
    $widgetBackground: "#2E6E6A",
  },
};
