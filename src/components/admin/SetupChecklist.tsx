// src/components/admin/SetupChecklist.tsx — shows the family how complete Nikki's world is.
import React from "react";
import { StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Card, Icon, Stack, Text } from "../../primitives";
import type { SetupChecklistItem } from "../../types/domain";

export default function SetupChecklist({ items }: { items: SetupChecklistItem[] }): React.ReactElement {
  const done = items.filter((i) => i.done).length;
  return (
    <Card elevation="card">
      <Stack gap="md">
        <View style={styles.header}>
          <Text variant="heading">Setting up Nikki</Text>
          <Text variant="bodyStrong" tone="primary">
            {done}/{items.length}
          </Text>
        </View>
        {items.map((item) => (
          <View key={item.key} style={styles.row}>
            <Icon name={item.done ? "check" : "add"} color={item.done ? "success" : "textTertiary"} />
            <Text variant="body" tone={item.done ? "textPrimary" : "textSecondary"}>
              {item.label}
            </Text>
          </View>
        ))}
      </Stack>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: 32 },
});
