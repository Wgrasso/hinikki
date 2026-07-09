// src/primitives/Button.tsx — the branded action. Large (>=56) for older hands, pill, press feedback.
// Never the OS <Button>.
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { theme } from "../theme";
import type { IconName } from "../theme";
import Icon from "./Icon";
import Text from "./Text";

type Variant = "primary" | "secondary" | "danger";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
};

export default function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
  fullWidth = true,
}: ButtonProps): React.ReactElement {
  const isFilled = variant === "primary" || variant === "danger";
  const bg = variant === "primary" ? theme.colors.primary : variant === "danger" ? theme.colors.danger : theme.colors.surface;
  const labelTone = isFilled ? "onPrimary" : "primary";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg },
        variant === "secondary" ? styles.secondaryBorder : null,
        fullWidth ? styles.fullWidth : null,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isFilled ? theme.colors.onPrimary : theme.colors.primary} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} color={labelTone} size={theme.iconSize.md} /> : null}
          <Text variant="bodyStrong" tone={labelTone}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.sm,
  },
  secondaryBorder: {
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  content: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  fullWidth: { alignSelf: "stretch" },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.5 },
});
