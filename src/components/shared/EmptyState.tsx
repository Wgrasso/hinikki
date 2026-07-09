// src/components/shared/EmptyState.tsx — a designed empty state: a real icon (never emoji art) +
// a heading + a subline + an optional pill CTA.
import React from "react";
import { StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import type { IconName } from "../../theme";
import { Button, Icon, Stack, Text } from "../../primitives";

type EmptyStateProps = {
  icon: IconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps): React.ReactElement {
  return (
    <Stack align="center" justify="center" gap="md" style={styles.wrap}>
      <View style={styles.badge}>
        <Icon name={icon} color="primary" size={theme.iconSize.xl} />
      </View>
      <Text variant="heading" center>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" tone="textSecondary" center>
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.cta}>
          <Button label={actionLabel} onPress={onAction} fullWidth={false} />
        </View>
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: theme.spacing.xxl, paddingHorizontal: theme.spacing.lg },
  badge: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  cta: { marginTop: theme.spacing.sm },
});
