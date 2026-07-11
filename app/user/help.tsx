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

  async function callFirst(contacts: EmergencyContact[], asEmergency: boolean): Promise<void> {
    const contact = contacts.find((c) => c.phone);
    if (asEmergency) {
      await createEmergencyEvent(id, { event_type: "help", user_message: "Pressed Emergency", detected_urgency: "high" });
      void captureAndStoreLocation(id, true);
    }
    if (!contact?.phone) {
      setNote(t("help.noPhoneSaved"));
      return;
    }
    setNote(t("help.calling", { name: contact.name }));
    Linking.openURL(`tel:${contact.phone.replace(/\s/g, "")}`).catch(() =>
      setNote(t("help.callFailed")),
    );
  }

  // Open the phone's own maps app with turn-by-turn directions to the saved home address.
  async function goHome(homeAddress: string): Promise<void> {
    setNote(t("help.openingMap"));
    const ok = await openMapDirections(homeAddress);
    if (!ok) setNote(t("help.mapFailed"));
  }

  return (
    <Screen scroll>
      <AppBar title={t("tab.help")} subtitle={t("help.subtitle")} onRefresh={reload} />
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
                onPress={() => callFirst(contacts, false)}
              />
              <BigHelpButton
                icon="warning"
                label={t("help.emergency.label")}
                description={t("help.emergency.desc")}
                tone="danger"
                disabled={!hasPhone}
                onPress={() => callFirst(contacts, true)}
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
