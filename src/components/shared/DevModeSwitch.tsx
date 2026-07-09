// src/components/shared/DevModeSwitch.tsx — DEV ONLY floating pill to flip between the
// elder ("user") and admin sides with real auth sessions (src/features/dev/devSessionSwitch).
// Renders nothing in release builds. Deliberately small and slightly ugly: it is scaffolding.
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text as RNText } from "react-native";
import { useRouter } from "expo-router";
import { theme } from "../../theme";
import { useAppState } from "../../auth/appState";
import { supabase } from "../../lib/supabase";
import { prepareLoginAsOther, switchSession } from "../../features/dev/devSessionSwitch";
import type { AppMode } from "../../types/database";

export default function DevModeSwitch(): React.ReactElement | null {
  const { mode, refresh } = useAppState();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!__DEV__ || !supabase || !mode) return null;
  const target: AppMode = mode === "admin" ? "user" : "admin";

  async function flip(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const result = await switchSession(mode as AppMode, target);
      if (result === "switched") {
        await refresh();
        router.replace("/");
        return;
      }
      if (result === "needs-login") {
        Alert.alert(
          `No ${target} session on this device yet`,
          `Sign in once as ${target === "admin" ? "a family admin" : "the older adult (join with the family code)"} — after that this button flips instantly both ways.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Go to sign-in",
              onPress: () => {
                void prepareLoginAsOther(mode as AppMode)
                  .then(refresh)
                  .then(() => router.replace("/"));
              },
            },
          ],
        );
        return;
      }
      Alert.alert("Could not switch", "Try again, or sign in manually.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Developer: switch to ${target} view`}
      onPress={() => void flip()}
      style={({ pressed }) => [styles.pill, pressed || busy ? styles.pressed : null]}
    >
      <RNText style={styles.label}>⇄ {target === "admin" ? "Admin" : "User"}</RNText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    top: 54,
    right: theme.spacing.md,
    zIndex: 999,
    backgroundColor: "rgba(30,30,30,0.75)",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  pressed: { opacity: 0.6 },
  label: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
