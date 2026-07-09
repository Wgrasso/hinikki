// src/components/user/NikkiCard.tsx — THE signature element. A warm cream-on-teal speech panel that
// makes Nikki feel present on every user screen. Revealed with the app-wide motion convention.
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Icon, Reveal, Text } from "../../primitives";

type NikkiCardProps = {
  message: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  emphasis?: "calm" | "urgent";
};

export default function NikkiCard({ message, ctaLabel, onCtaPress, emphasis = "calm" }: NikkiCardProps): React.ReactElement {
  return (
    <Reveal>
      <View style={[styles.panel, emphasis === "urgent" ? styles.urgent : null]}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Icon name="sparkle" color="onPrimary" size={theme.iconSize.md} />
          </View>
          <Text variant="overline" tone="onPrimary">
            NIKKI
          </Text>
        </View>
        <Text variant="heading" tone="onPrimary" style={styles.message}>
          {message}
        </Text>
        {ctaLabel && onCtaPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
            onPress={onCtaPress}
            style={({ pressed }) => [styles.cta, pressed ? styles.pressed : null]}
          >
            <Text variant="bodyStrong" tone="primary">
              {ctaLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    ...theme.shadows.lg,
  },
  urgent: { backgroundColor: theme.colors.danger },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  message: { lineHeight: theme.text.heading.lineHeight },
  cta: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    minHeight: 52,
    justifyContent: "center",
  },
  pressed: { opacity: 0.9 },
});
