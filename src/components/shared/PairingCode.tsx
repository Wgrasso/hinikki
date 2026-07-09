// src/components/shared/PairingCode.tsx — shows a pairing code large and easy to read aloud,
// with a one-tap Copy button so family can share it easily.
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { theme } from "../../theme";
import { Text } from "../../primitives";
import Icon from "../../primitives/Icon";
import { formatHouseholdCode } from "../../lib/constants";

export default function PairingCode({ code, label = "YOUR FAMILY CODE" }: { code: string; label?: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View style={styles.box}>
      <Text variant="overline" tone="textSecondary">
        {label}
      </Text>
      <Text variant="display" tone="primary" style={styles.code}>
        {formatHouseholdCode(code)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copied ? "Code copied to clipboard" : "Copy code"}
        onPress={copy}
        hitSlop={12}
        style={({ pressed }) => [styles.copyBtn, pressed ? styles.pressed : null]}
      >
        <Icon name={copied ? "check" : "copy"} size={theme.iconSize.sm} color={copied ? "success" : "primary"} />
        <Text variant="bodyStrong" tone={copied ? "success" : "primary"}>
          {copied ? "Copied!" : "Copy code"}
        </Text>
      </Pressable>
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
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    marginTop: theme.spacing.xs,
  },
  pressed: { opacity: 0.6 },
});
