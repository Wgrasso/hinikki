// src/theme.ts — the single source of truth for HiNikki's look.
// Written first; every screen/primitive consumes ONLY these tokens. No raw values downstream.
// Metaphor: "a warm, sunlit morning note left on the kitchen table by someone who loves you".
import { Easing, TextStyle, ViewStyle } from "react-native";

const DISPLAY = "Fraunces_600SemiBold";
const BODY = "Inter_400Regular";
const BODY_STRONG = "Inter_600SemiBold";

const colors = {
  background: "#FAF4EA",
  surface: "#FFFFFF",
  surfaceAlt: "#F2E9D8",
  primary: "#2E6E6A",
  primaryDark: "#245854",
  onPrimary: "#FFFFFF",
  accent: "#E0A33E",
  textPrimary: "#2A2A26",
  textSecondary: "#5C5A52",
  textTertiary: "#8A877C",
  border: "#E6DECF",
  success: "#3E7C6A",
  danger: "#C44536",
  overlay: "rgba(42,42,38,0.45)",
} as const;

// Larger base sizes than usual — these are read by older eyes.
const text = {
  display: { fontFamily: DISPLAY, fontSize: 36, fontWeight: "700", letterSpacing: -0.5, lineHeight: 42 },
  title: { fontFamily: DISPLAY, fontSize: 28, fontWeight: "600", letterSpacing: -0.3, lineHeight: 34 },
  heading: { fontFamily: DISPLAY, fontSize: 22, fontWeight: "600", letterSpacing: 0, lineHeight: 28 },
  body: { fontFamily: BODY, fontSize: 18, fontWeight: "400", letterSpacing: 0, lineHeight: 26 },
  bodyStrong: { fontFamily: BODY_STRONG, fontSize: 18, fontWeight: "600", letterSpacing: 0, lineHeight: 26 },
  caption: { fontFamily: BODY, fontSize: 15, fontWeight: "500", letterSpacing: 0.2, lineHeight: 20 },
  overline: { fontFamily: BODY_STRONG, fontSize: 13, fontWeight: "700", letterSpacing: 1.2, lineHeight: 18 },
} satisfies Record<string, TextStyle>;

const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

const shadows = {
  sm: { shadowColor: "#3A2E1E", shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1 },
  card: { shadowColor: "#3A2E1E", shadowOpacity: 0.09, shadowOffset: { width: 0, height: 5 }, shadowRadius: 14, elevation: 3 },
  lg: { shadowColor: "#3A2E1E", shadowOpacity: 0.14, shadowOffset: { width: 0, height: 12 }, shadowRadius: 26, elevation: 9 },
} satisfies Record<string, ViewStyle>;

const motion = {
  ease: Easing.bezier(0.16, 1, 0.3, 1),
  durationFast: 160,
  durationBase: 260,
  durationSlow: 420,
  reveal: { translateY: 12, opacityFrom: 0 },
} as const;

// intent name → Ionicons glyph name (the Icon primitive is the only reader)
const iconGlyphs = {
  chevron: "chevron-forward",
  close: "close",
  back: "chevron-back",
  check: "checkmark",
  search: "search",
  chat: "chatbubble-ellipses",
  people: "people",
  help: "help-buoy",
  location: "location",
  weather: "partly-sunny",
  calendar: "calendar",
  phone: "call",
  warning: "alert-circle",
  home: "home",
  heart: "heart",
  add: "add",
  camera: "camera",
  settings: "settings-sharp",
  shield: "shield-checkmark",
  clock: "time",
  pill: "medkit",
  send: "arrow-up",
  mic: "mic",
  sparkle: "sparkles",
  refresh: "refresh",
  edit: "pencil",
  copy: "copy-outline",
  trash: "trash",
} as const;

const iconSize = { sm: 18, md: 24, lg: 32, xl: 48 } as const;

export const theme = {
  metaphor: "a warm, sunlit morning note left on the kitchen table by someone who loves you",
  colors,
  text,
  spacing,
  radius,
  shadows,
  motion,
  iconGlyphs,
  iconSize,
} as const;

export type Theme = typeof theme;
export type ColorRole = keyof typeof colors;
export type TextVariant = keyof typeof text;
export type SpacingKey = keyof typeof spacing;
export type IconName = keyof typeof iconGlyphs;
