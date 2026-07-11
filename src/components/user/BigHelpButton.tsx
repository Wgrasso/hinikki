// src/components/user/BigHelpButton.tsx — a large, unmistakable help action for the older adult.
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import type { IconName } from "../../theme";
import { Icon, Text } from "../../primitives";

type BigHelpButtonProps = {
  icon: IconName;
  label: string;
  description: string;
  tone?: "primary" | "danger";
  disabled?: boolean;
  onPress: () => void;
};

export default function BigHelpButton({ icon, label, description, tone = "primary", disabled = false, onPress }: BigHelpButtonProps): React.ReactElement {
  const isDanger = tone === "danger";
  const bg = isDanger ? theme.colors.danger : theme.colors.surface;
  const labelTone = isDanger ? "onPrimary" : "textPrimary";
  const iconBg = isDanger ? theme.colors.onPrimary : theme.colors.surfaceAlt;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: bg },
        theme.shadows.card,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Icon name={icon} color={isDanger ? "danger" : "primary"} size={theme.iconSize.lg} />
      </View>
      <View style={styles.text}>
        <Text variant="heading" tone={labelTone}>
          {label}
        </Text>
        <Text variant="body" tone={tone === "danger" ? "onPrimary" : "textSecondary"}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    minHeight: 88,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: theme.spacing.xs },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.4 },
});
