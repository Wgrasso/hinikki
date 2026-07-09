// src/components/user/QuickChips.tsx — large suggested-action chips so the older adult can tap instead
// of type.
import React from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { theme } from "../../theme";
import { Text } from "../../primitives";

type QuickChipsProps = {
  items: string[];
  onPick: (label: string) => void;
};

export default function QuickChips({ items, onPick }: QuickChipsProps): React.ReactElement {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {items.map((item) => (
        <Pressable
          key={item}
          accessibilityRole="button"
          accessibilityLabel={item}
          onPress={() => onPick(item)}
          style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}
        >
          <Text variant="bodyStrong" tone="primary">
            {item}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs, paddingRight: theme.spacing.lg },
  chip: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    minHeight: 48,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pressed: { opacity: 0.85 },
});
