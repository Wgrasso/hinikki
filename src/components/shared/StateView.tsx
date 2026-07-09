// src/components/shared/StateView.tsx — renders the four states from an AsyncState in the correct,
// mutually-exclusive order: loading → (error | empty | loaded). Used by every data view.
import React from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
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

  return props.children(state.data);
}

const styles = StyleSheet.create({
  center: { flex: 1, paddingVertical: theme.spacing.xxl },
});
