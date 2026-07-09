// src/components/shared/PairingCode.tsx — shows a pairing code large and easy to read aloud.
import React from "react";
import { StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Text } from "../../primitives";
import { formatHouseholdCode } from "../../lib/constants";

export default function PairingCode({ code, label = "YOUR FAMILY CODE" }: { code: string; label?: string }): React.ReactElement {
  return (
    <View style={styles.box}>
      <Text variant="overline" tone="textSecondary">
        {label}
      </Text>
      <Text variant="display" tone="primary" style={styles.code}>
        {formatHouseholdCode(code)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.xl,
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  code: { letterSpacing: 4 },
});
