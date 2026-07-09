// src/primitives/Icon.tsx — the ONLY file that imports @expo/vector-icons.
// All functional affordances render through this, colored + sized from theme tokens.
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import type { ColorRole, IconName } from "../theme";

type IconProps = {
  name: IconName;
  size?: number;
  color?: ColorRole;
};

export default function Icon({ name, size = theme.iconSize.md, color = "textSecondary" }: IconProps): React.ReactElement {
  const glyph = theme.iconGlyphs[name] as keyof typeof Ionicons.glyphMap;
  return <Ionicons name={glyph} size={size} color={theme.colors[color]} />;
}
