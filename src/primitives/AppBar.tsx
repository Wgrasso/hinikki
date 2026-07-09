// src/primitives/AppBar.tsx — the branded header region every screen uses instead of the bare OS bar.
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { theme } from "../theme";
import Icon from "./Icon";
import Text from "./Text";

type AppBarProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightLabel?: string;
  onRightPress?: () => void;
};

export default function AppBar({ title, subtitle, onBack, rightLabel, onRightPress }: AppBarProps): React.ReactElement {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed ? styles.pressed : null]}
          >
            <Icon name="back" color="primary" size={theme.iconSize.lg} />
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        {rightLabel && onRightPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={rightLabel}
            onPress={onRightPress}
            hitSlop={12}
            style={({ pressed }) => [pressed ? styles.pressed : null]}
          >
            <Text variant="bodyStrong" tone="primary">
              {rightLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text variant="display">{title}</Text>
      {subtitle ? (
        <Text variant="body" tone="textSecondary" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: theme.iconSize.lg,
    marginBottom: theme.spacing.sm,
  },
  backBtn: { marginLeft: -theme.spacing.xs },
  backSpacer: { height: theme.iconSize.lg },
  subtitle: { marginTop: theme.spacing.xs },
  pressed: { opacity: 0.6 },
});
