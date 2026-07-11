// src/components/user/RecapCard.tsx — the warm end-of-conversation recap (plan §4.6).
// Shows what Nikki and the person talked about and what she noted for the family —
// the same content the family sees in their Conversations feed, nothing more.
import React from "react";
import { StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Icon, Stack, Text } from "../../primitives";
import { useT } from "../../i18n";
import type { RecapChange } from "../../types/database";

const KIND_KEYS: Record<RecapChange["kind"], string> = {
  proposed: "recap.proposed",
  confirmed: "recap.confirmed",
  called: "recap.called",
  help: "recap.help",
};

export default function RecapCard({ summary, changes }: { summary: string; changes: RecapChange[] }): React.ReactElement {
  const { t } = useT();
  return (
    <View style={styles.card}>
      <Stack gap="sm">
        <View style={styles.headerRow}>
          <Icon name="heart" color="primary" />
          <Text variant="bodyStrong">{t("recap.title")}</Text>
        </View>
        <Text variant="body" tone="textSecondary">
          {summary}
        </Text>
        {changes.map((c, i) => (
          <View key={`${c.kind}-${i}`} style={styles.changeRow}>
            <Icon name="check" color="success" size={theme.iconSize.sm} />
            <Text variant="body" tone="textSecondary" style={styles.changeText}>
              {KIND_KEYS[c.kind] ? t(KIND_KEYS[c.kind], { label: c.label }) : c.label}
            </Text>
          </View>
        ))}
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  changeRow: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
  changeText: { flex: 1 },
});
