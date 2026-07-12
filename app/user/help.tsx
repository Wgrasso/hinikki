// app/user/help.tsx — the simplest, most reachable screen: big help actions that always work.
import React, { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Screen, Stack, Text } from "../../src/primitives";
import BigHelpButton from "../../src/components/user/BigHelpButton";
import StateView from "../../src/components/shared/StateView";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { createEmergencyEvent, listEmergencyContacts } from "../../src/services/emergencyService";
import { getOlderAdult } from "../../src/services/profileService";
import { captureAndStoreLocation } from "../../src/features/safety/locationCapture";
import { openMapDirections } from "../../src/utils/openMaps";
import { useT } from "../../src/i18n";
import type { EmergencyContact } from "../../src/types/database";

// The Help screen leans on two things: who to call (emergency contacts) and where home is
// (the elder's saved address). Load them together so every button knows if it can safely act.
type HelpData = { contacts: EmergencyContact[]; homeAddress: string | null };

export default function HelpScreen(): React.ReactElement {
  const { t } = useT();
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const [note, setNote] = useState<string | null>(null);

  const { state, reload } = useAsync<HelpData>(async () => {
    const [contacts, profile] = await Promise.all([listEmergencyContacts(id), getOlderAdult(id)]);
    return { contacts, homeAddress: profile?.home_address ?? null };
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

  // Call the family's first reachable contact, and log it so the family sees it happened.
  async function callFamily(contacts: EmergencyContact[]): Promise<void> {
    const contact = contacts.find((c) => c.phone);
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

  // "I'm lost": let the family know right away (alert + a fresh location), then open the phone's
  // maps app with directions home so they can start walking back to somewhere familiar.
  async function goHome(homeAddress: string): Promise<void> {
    setNote(t("help.openingMap"));
    const ok = await openMapDirections(homeAddress); // open the map first — no waiting for a GPS fix
    const locId = await captureAndStoreLocation(id, true); // then record WHERE they were, and link it
    void createEmergencyEvent(id, { event_type: "lost", user_message: "Pressed “I feel lost”", detected_urgency: "high", location_update_id: locId }).catch(() => undefined);
    if (!ok) setNote(t("help.mapFailed"));
  }

  return (
    <Screen scroll>
      <AppBar title={t("tab.help")} subtitle={t("help.subtitle")} />
      <StateView state={state} onRetry={reload} loadingLabel={t("help.loading")}>
        {({ contacts, homeAddress }) => {
          const hasPhone = contacts.some((c) => c.phone);
          const hasHome = Boolean(homeAddress && homeAddress.trim().length > 0);
          return (
            <Stack gap="md">
              <BigHelpButton
                icon="location"
                label={t("help.lost.label")}
                description={hasHome ? t("help.lost.desc") : t("help.lost.noHome")}
                disabled={!hasHome}
                onPress={() => goHome(homeAddress as string)}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { paddingTop: theme.spacing.md },
});
