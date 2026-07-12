// src/components/shared/DevModeSwitch.tsx — DEV ONLY floating control to jump between the
// admin and user views of a family (src/features/dev/devConfig.ts). The family-code chip is a
// dropdown: pick any configured dev family, then tap Admin or User to land in THAT family. The
// choice is remembered, so switching families never disturbs work in another. Renders nothing in
// release builds.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { theme } from "../../theme";
import { useAppState } from "../../auth/appState";
import { supabase } from "../../lib/supabase";
import { clearSession } from "../../storage/localStore";
import { becomeAdmin, becomeUser } from "../../features/dev/devHarness";
import { DEV_FAMILIES, getActiveDevFamily, setActiveDevFamilyCode, type DevFamily } from "../../features/dev/devConfig";

export default function DevModeSwitch(): React.ReactElement | null {
  const { mode, refresh, completeSetupWithGroup } = useAppState();
  const router = useRouter();
  const [busy, setBusy] = useState<null | "admin" | "user">(null);
  const [active, setActive] = useState<DevFamily | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    void getActiveDevFamily().then(setActive);
  }, []);

  if (!__DEV__ || !supabase || DEV_FAMILIES.length === 0) return null;

  async function pickFamily(family: DevFamily): Promise<void> {
    await setActiveDevFamilyCode(family.familyCode);
    setActive(family);
    setPickerOpen(false);
  }

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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Developer: choose the test family"
        onPress={() => setPickerOpen((o) => !o)}
        style={styles.code}
      >
        <RNText style={styles.codeText}>{active ? `${active.label} · ${active.familyCode}` : "…"} ▾</RNText>
      </Pressable>

      {pickerOpen ? (
        <View style={styles.menu}>
          {DEV_FAMILIES.map((f) => (
            <Pressable
              key={f.familyCode}
              accessibilityRole="button"
              accessibilityLabel={`Developer: use family ${f.label}`}
              onPress={() => void pickFamily(f)}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.pressed : null]}
            >
              <RNText style={[styles.menuText, active?.familyCode === f.familyCode ? styles.menuTextActive : null]}>
                {f.label} · {f.familyCode}
              </RNText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Developer: become admin of the selected family"
          onPress={() => void goAdmin()}
          style={({ pressed }) => [styles.pill, mode === "admin" ? styles.active : null, pressed ? styles.pressed : null]}
        >
          {busy === "admin" ? <ActivityIndicator color="#fff" size="small" /> : <RNText style={styles.label}>🅰 Admin</RNText>}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Developer: become the user of the selected family"
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
  code: { backgroundColor: "rgba(30,30,30,0.7)", paddingHorizontal: 6, borderRadius: theme.radius.pill, overflow: "hidden" },
  codeText: { color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: "700" },
  menu: { backgroundColor: "rgba(30,30,30,0.92)", borderRadius: theme.radius.sm, paddingVertical: 4, minWidth: 150, gap: 2 },
  menuItem: { paddingHorizontal: theme.spacing.md, paddingVertical: 8 },
  menuText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
  menuTextActive: { color: "#fff", textDecorationLine: "underline" },
  row: { flexDirection: "row", gap: 6 },
  pill: { minWidth: 66, alignItems: "center", backgroundColor: "rgba(30,30,30,0.75)", borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, paddingVertical: 6 },
  active: { backgroundColor: theme.colors.primary },
  pressed: { opacity: 0.6 },
  label: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
