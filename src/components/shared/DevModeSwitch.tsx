// src/components/shared/DevModeSwitch.tsx — DEV ONLY floating control to jump between the
// admin and user views of ONE fixed family (src/features/dev/devConfig.ts). Deterministic:
// each button signs into the fixed dev admin, or re-claims the fixed elder, so both sides
// always show the SAME group no matter what session was left in storage. Renders nothing in
// release builds.
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { theme } from "../../theme";
import { useAppState } from "../../auth/appState";
import { supabase } from "../../lib/supabase";
import { clearSession } from "../../storage/localStore";
import { becomeAdmin, becomeUser } from "../../features/dev/devHarness";
import { DEV_HARNESS } from "../../features/dev/devConfig";

export default function DevModeSwitch(): React.ReactElement | null {
  const { mode, refresh, completeSetupWithGroup } = useAppState();
  const router = useRouter();
  const [busy, setBusy] = useState<null | "admin" | "user">(null);

  if (!__DEV__ || !supabase || !DEV_HARNESS) return null;

  async function goAdmin(): Promise<void> {
    if (busy) return;
    setBusy("admin");
    try {
      const r = await becomeAdmin();
      if (!r.ok) { Alert.alert("Dev: could not become admin", r.message); return; }
      await clearSession(); // drop stale local link so refresh() re-derives from the server
      await refresh();
      router.replace("/admin/dashboard");
    } finally {
      setBusy(null);
    }
  }

  async function goUser(): Promise<void> {
    if (busy) return;
    setBusy("user");
    try {
      const r = await becomeUser();
      if (!r.ok) { Alert.alert("Dev: could not become user", r.message); return; }
      await completeSetupWithGroup("user", r.olderAdultId, r.groupId, r.joinCode);
      router.replace("/user/nikki");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <RNText style={styles.code}>{DEV_HARNESS.familyCode}</RNText>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Developer: become admin of the test family"
          onPress={() => void goAdmin()}
          style={({ pressed }) => [styles.pill, mode === "admin" ? styles.active : null, pressed ? styles.pressed : null]}
        >
          {busy === "admin" ? <ActivityIndicator color="#fff" size="small" /> : <RNText style={styles.label}>🅰 Admin</RNText>}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Developer: become the user of the test family"
          onPress={() => void goUser()}
          style={({ pressed }) => [styles.pill, mode === "user" ? styles.active : null, pressed ? styles.pressed : null]}
        >
          {busy === "user" ? <ActivityIndicator color="#fff" size="small" /> : <RNText style={styles.label}>🅴 User</RNText>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 50, right: theme.spacing.md, zIndex: 999, alignItems: "flex-end", gap: 2 },
  code: { color: "rgba(255,255,255,0.9)", backgroundColor: "rgba(30,30,30,0.7)", fontSize: 10, fontWeight: "700", paddingHorizontal: 6, borderRadius: theme.radius.pill, overflow: "hidden" },
  row: { flexDirection: "row", gap: 6 },
  pill: { minWidth: 66, alignItems: "center", backgroundColor: "rgba(30,30,30,0.75)", borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, paddingVertical: 6 },
  active: { backgroundColor: theme.colors.primary },
  pressed: { opacity: 0.6 },
  label: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
