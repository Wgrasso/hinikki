// src/components/admin/SectionHeader.tsx — a small titled section header with an optional action.
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Icon, Text } from "../../primitives";

type SectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text variant="heading">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={10}
          style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
        >
          <Icon name="add" color="primary" size={theme.iconSize.sm} />
          <Text variant="bodyStrong" tone="primary">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.spacing.sm },
  action: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  pressed: { opacity: 0.6 },
});
