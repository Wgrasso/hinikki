// app/user/help.tsx — the simplest, most reachable screen: big help actions that always work.
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Screen, Stack, Text } from "../../src/primitives";
import BigHelpButton from "../../src/components/user/BigHelpButton";
import StateView from "../../src/components/shared/StateView";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { createEmergencyEvent, listEmergencyContacts } from "../../src/services/emergencyService";
import { listSafeLocations } from "../../src/services/locationService";
import { captureAndStoreLocation, getCurrentPlace } from "../../src/features/safety/locationCapture";
import { hasSafeDestination, nearestSafeDestination } from "../../src/features/safety/homeDestination";
import { openMapDirections } from "../../src/utils/openMaps";
import { useT } from "../../src/i18n";
import type { EmergencyContact, SafeLocation } from "../../src/types/database";

// The Help screen leans on two things: who to call (emergency contacts) and the safe places to
// guide them to. Load them together so every button knows if it can safely act.
type HelpData = { contacts: EmergencyContact[]; safe: SafeLocation[] };

export default function HelpScreen(): React.ReactElement {
  const { t } = useT();
  const { olderAdultId, signOut } = useAppState();
  const router = useRouter();
  const id = olderAdultId ?? "";
  const [note, setNote] = useState<string | null>(null);

  const { state, reload } = useAsync<HelpData>(async () => {
    const [contacts, safe] = await Promise.all([listEmergencyContacts(id), listSafeLocations(id)]);
    return { contacts, safe };
  }, [id]);

  // Refetch on focus and on live changes; stale-while-refresh keeps it flicker-free.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  useEffect(() => {
    if (!id) return;
    return subscribeLive(id, () => reload());
  }, [id, reload]);

  // Transient status notes ("opening the map…", "no phone saved") are momentary — clear them after
  // a few seconds so a stale message never lingers on screen and confuses the person. (PairingCode
  // uses the same self-clearing pattern.)
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(timer);
  }, [note]);

  // Call the family's first reachable contact, and log it so the family sees it happened.
  async function callFamily(contacts: EmergencyContact[]): Promise<void> {
    const contact = contacts.find((c) => (c.phone ?? "").trim().length > 0);
    if (!contact?.phone) {
      setNote(t("help.noPhoneSaved"));
      return;
    }
    void createEmergencyEvent(id, { event_type: "call_family", user_message: `Pressed “Call family” — called ${contact.name}`, detected_urgency: "low" }).catch(() => undefined);
    // Hand off to the phone dialer. We deliberately show no "calling…" note — the app can't tell
    // when the call connects or ends, so a lingering status would be misleading.
    Linking.openURL(`tel:${contact.phone.replace(/\s/g, "")}`).catch(() =>
      setNote(t("help.callFailed")),
    );
  }

  // "I'm lost": let the family know right away (a durable alert + a fresh location), THEN open the
  // phone's maps app with driving directions to the nearest safe place. We record the location and
  // log the event BEFORE handing off to Maps: opening Maps backgrounds the app, and a GPS fix taken
  // after that can be delayed or dropped — which would rob the family of the "where are they" link
  // at the exact moment it matters most.
  async function goHome(safe: SafeLocation[]): Promise<void> {
    setNote(t("help.openingMap"));
    // Where they are now → pick the CLOSEST safe place to guide them to.
    const place = await getCurrentPlace();
    const destination = nearestSafeDestination(place ? { latitude: place.latitude, longitude: place.longitude } : null, safe);
    if (!destination) {
      setNote(t("help.mapFailed"));
      return;
    }
    // Record WHERE they are and alert the family while the app is still in the foreground.
    const locId = await captureAndStoreLocation(id, true);
    void createEmergencyEvent(id, { event_type: "lost", user_message: "Pressed “I feel lost”", detected_urgency: "high", location_update_id: locId }).catch(() => undefined);
    const ok = await openMapDirections(destination);
    if (!ok) setNote(t("help.mapFailed"));
  }

  // "Start over": disconnect this phone from the family (used by caregivers/testers, not the
  // elder — hence the deliberately quiet styling and a confirmation first). Re-pairing with the
  // family code brings the same person right back; the pairing claim was built for this.
  function confirmStartOver(): void {
    Alert.alert(t("help.startOver.title"), t("help.startOver.body"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("help.startOver.confirm"),
        style: "destructive",
        onPress: () => {
          void signOut().then(() => router.replace("/"));
        },
      },
    ]);
  }

  return (
    <Screen scroll>
      <AppBar title={t("tab.help")} subtitle={t("help.subtitle")} />
      <StateView state={state} onRetry={reload} loadingLabel={t("help.loading")}>
        {({ contacts, safe }) => {
          const hasPhone = contacts.some((c) => (c.phone ?? "").trim().length > 0);
          const canGuide = hasSafeDestination(safe);
          return (
            <Stack gap="md">
              <BigHelpButton
                icon="location"
                label={t("help.lost.label")}
                description={canGuide ? t("help.lost.desc") : t("help.lost.noHome")}
                disabled={!canGuide}
                onPress={() => goHome(safe)}
              />
              <BigHelpButton
                icon="phone"
                label={t("help.call.label")}
                description={t("help.call.desc")}
                disabled={!hasPhone}
                onPress={() => callFamily(contacts)}
              />
              {!hasPhone ? (
                <View style={styles.note}>
                  <Text variant="body" tone="textSecondary" center>
                    {t("help.noPhone")}
                  </Text>
                </View>
              ) : null}
              {note ? (
                <View style={styles.note}>
                  <Text variant="body" tone="textSecondary" center>
                    {note}
                  </Text>
                </View>
              ) : null}
            </Stack>
          );
        }}
      </StateView>
      {/* Outside StateView on purpose: a phone with broken pairing (load error) is exactly the
          phone that needs a way to start over. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("help.startOver.link")}
        onPress={confirmStartOver}
        style={({ pressed }) => [styles.startOver, pressed ? styles.startOverPressed : null]}
      >
        <Text variant="body" tone="textTertiary" center>
          {t("help.startOver.link")}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { paddingTop: theme.spacing.md },
  startOver: { marginTop: theme.spacing.xl, paddingVertical: theme.spacing.md, minHeight: 44, justifyContent: "center" },
  startOverPressed: { opacity: 0.7 },
});
