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
import type { EmergencyContact } from "../../src/types/database";

// The Help screen leans on two things: who to call (emergency contacts) and where home is
// (the elder's saved address). Load them together so every button knows if it can safely act.
type HelpData = { contacts: EmergencyContact[]; homeAddress: string | null };

export default function HelpScreen(): React.ReactElement {
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
      setNote("There is no family phone number saved yet. Your family can add one for you.");
      return;
    }
    setNote(`Calling ${contact.name}…`);
    Linking.openURL(`tel:${contact.phone.replace(/\s/g, "")}`).catch(() =>
      setNote("I could not start the call. Please try again."),
    );
  }

  // Open the phone's own maps app with turn-by-turn directions to the saved home address.
  async function goHome(homeAddress: string): Promise<void> {
    setNote("Opening the map to guide you home…");
    const ok = await openMapDirections(homeAddress);
    if (!ok) setNote("I could not open the map. Please try again.");
  }

  return (
    <Screen scroll>
      <AppBar title="Help" subtitle="Tap any button. I am here to help." onRefresh={reload} />
      <StateView state={state} onRetry={reload} loadingLabel="Getting help ready…">
        {({ contacts, homeAddress }) => {
          const hasPhone = contacts.some((c) => c.phone);
          const hasHome = Boolean(homeAddress && homeAddress.trim().length > 0);
          return (
            <Stack gap="md">
              <BigHelpButton
                icon="location"
                label="I am lost"
                description={hasHome ? "I will show you the way home." : "Your family needs to add your home address first."}
                disabled={!hasHome}
                onPress={() => goHome(homeAddress as string)}
              />
              <BigHelpButton
                icon="phone"
                label="Call family"
                description="Phone someone who can help."
                disabled={!hasPhone}
                onPress={() => callFirst(contacts, false)}
              />
              <BigHelpButton
                icon="warning"
                label="Emergency"
                description="Call family right away and share where you are."
                tone="danger"
                disabled={!hasPhone}
                onPress={() => callFirst(contacts, true)}
              />
              {!hasPhone ? (
                <View style={styles.note}>
                  <Text variant="body" tone="textSecondary" center>
                    Your family needs to add a phone number first.
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
