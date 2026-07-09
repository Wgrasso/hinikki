// src/components/shared/ListRow.tsx — a reusable row: leading slot + title/subtitle + chevron.
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Icon, Text } from "../../primitives";

type ListRowProps = {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  showChevron?: boolean;
};

export default function ListRow({
  title,
  subtitle,
  leading,
  onPress,
  accessibilityLabel,
  showChevron = true,
}: ListRowProps): React.ReactElement {
  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" tone="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onPress && showChevron ? <Icon name="chevron" color="textTertiary" /> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        onPress={onPress}
        style={({ pressed }) => [styles.row, theme.shadows.sm, pressed ? styles.pressed : null]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={[styles.row, theme.shadows.sm]}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    minHeight: 64,
  },
  leading: { justifyContent: "center" },
  text: { flex: 1, gap: theme.spacing.xs },
  pressed: { opacity: 0.92 },
});
