// src/components/shared/StateView.tsx — renders the four states from an AsyncState in the correct,
// mutually-exclusive order: loading → (error | empty | loaded). Used by every data view.
// Once data exists it stays on screen through refreshes: a small corner spinner appears instead of
// the full-screen loading state, so a reload never blanks out what the person is looking at.
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import type { IconName } from "../../theme";
import { Button, Stack, Text } from "../../primitives";
import type { AsyncState } from "../../utils/useAsync";
import EmptyState from "./EmptyState";

type StateViewProps<T> = {
  state: AsyncState<T>;
  onRetry: () => void;
  loadingLabel: string;
  isEmpty?: (data: T) => boolean;
  emptyIcon?: IconName;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  children: (data: T) => React.ReactElement;
};

export default function StateView<T>(props: StateViewProps<T>): React.ReactElement {
  const { state, onRetry, loadingLabel } = props;

  // Full-screen spinner only before the first data arrives.
  if (state.status === "loading") {
    return (
      <Stack align="center" justify="center" gap="md" style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
        <Text variant="body" tone="textSecondary">
          {loadingLabel}
        </Text>
      </Stack>
    );
  }

  if (state.status === "error") {
    return (
      <Stack align="center" justify="center" gap="md" style={styles.center}>
        <Text variant="heading" center>
          Something went wrong
        </Text>
        <Text variant="body" tone="textSecondary" center>
          {state.error} Please try again in a moment.
        </Text>
        <Button label="Try again" icon="check" onPress={onRetry} fullWidth={false} />
      </Stack>
    );
  }

  if (props.isEmpty && props.isEmpty(state.data)) {
    return (
      <EmptyState
        icon={props.emptyIcon ?? "sparkle"}
        title={props.emptyTitle ?? "Nothing here yet"}
        subtitle={props.emptySubtitle}
        actionLabel={props.emptyActionLabel}
        onAction={props.onEmptyAction}
      />
    );
  }

  // Data is on screen: keep showing it while a refresh runs, with a quiet corner spinner.
  // (A failed refresh keeps the stale data too — the hook never drops back to error once loaded.)
  return (
    <>
      {props.children(state.data)}
      {state.refreshing ? (
        <View style={styles.refreshBadge} pointerEvents="none">
          <ActivityIndicator color={theme.colors.primary} size="small" />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, paddingVertical: theme.spacing.xxl },
  refreshBadge: {
    position: "absolute",
    top: theme.spacing.md,
    right: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    padding: theme.spacing.sm,
    ...theme.shadows.sm,
  },
});
