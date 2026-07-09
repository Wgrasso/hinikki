// src/primitives/Card.tsx — a lifted surface. Depth via a shadow level (default) OR a single border —
// never both. Primary surfaces get the deepest elevation.
import React from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { theme } from "../theme";

type Elevation = "sm" | "card" | "lg" | "none";

type CardProps = {
  children: React.ReactNode;
  elevation?: Elevation;
  bordered?: boolean;
  tone?: "surface" | "surfaceAlt" | "primary";
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

export default function Card({
  children,
  elevation = "card",
  bordered = false,
  tone = "surface",
  onPress,
  accessibilityLabel,
  style,
}: CardProps): React.ReactElement {
  const base: ViewStyle[] = [
    styles.base,
    { backgroundColor: theme.colors[tone] },
    bordered ? styles.bordered : elevation !== "none" ? theme.shadows[elevation] : null,
    style ?? null,
  ].filter(Boolean) as ViewStyle[];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [...base, pressed ? styles.pressed : null]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
  },
  bordered: {
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pressed: { opacity: 0.92 },
});
