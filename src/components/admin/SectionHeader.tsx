// src/components/admin/SectionHeader.tsx — a small titled section header with an optional action.
// When `needsSetup` is set it shows a "!" marker beside the title, so a required-but-missing
// section is called out inline (paired with an accent border on the section body) instead of a
// separate banner.
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Icon, Text } from "../../primitives";

type SectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  needsSetup?: boolean;
  needsSetupLabel?: string;
};

export default function SectionHeader({ title, actionLabel, onAction, needsSetup, needsSetupLabel }: SectionHeaderProps): React.ReactElement {
  return (
    <View style={styles.row}>
      <View style={styles.titleGroup}>
        <Text variant="heading">{title}</Text>
        {needsSetup ? <SetupMark label={needsSetupLabel} /> : null}
      </View>
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

// The small amber "!" chip. Same accent used by the tab badge, so on-screen and tab-bar cues match.
export function SetupMark({ label }: { label?: string }): React.ReactElement {
  return (
    <View style={styles.mark} accessibilityLabel={label} accessibilityRole={label ? "image" : undefined}>
      <Text variant="caption" tone="onPrimary" style={styles.markText}>
        !
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.spacing.sm },
  titleGroup: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, flexShrink: 1 },
  action: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  pressed: { opacity: 0.6 },
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { color: theme.colors.onPrimary, fontWeight: "700", lineHeight: 18 },
});
