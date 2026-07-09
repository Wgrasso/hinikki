// src/components/user/VoiceOrb.tsx — the one big affordance of the voice experience: a large,
// warm mic orb (far above the 56pt minimum) with a state ring. Purely presentational, no SDK.
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Icon, Text } from "../../primitives";

export type VoiceOrbState = "idle" | "busy" | "listening" | "speaking";

const ORB_SIZE = 136;

const RING_COLOR: Record<VoiceOrbState, string> = {
  idle: theme.colors.border,
  busy: theme.colors.border,
  listening: theme.colors.primary,
  speaking: theme.colors.accent,
};

type VoiceOrbProps = {
  state: VoiceOrbState;
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export default function VoiceOrb({ state, label, onPress, disabled = false }: VoiceOrbProps): React.ReactElement {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [styles.orb, { borderColor: RING_COLOR[state] }, pressed ? styles.pressed : null]}
      >
        {state === "busy" ? (
          <ActivityIndicator size="large" color={theme.colors.onPrimary} />
        ) : (
          <Icon name="mic" color="onPrimary" size={theme.iconSize.xl} />
        )}
      </Pressable>
      <Text variant="body" tone="textSecondary" style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: theme.spacing.md },
  orb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    borderWidth: 6,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.card,
  },
  pressed: { opacity: 0.9 },
  label: { textAlign: "center" },
});
