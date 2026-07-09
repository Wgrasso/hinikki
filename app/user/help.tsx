// app/user/help.tsx — the simplest, most reachable screen: big help actions that always work.
import React, { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Screen, Stack, Text } from "../../src/primitives";
import BigHelpButton from "../../src/components/user/BigHelpButton";
import StateView from "../../src/components/shared/StateView";
import { useAsync } from "../../src/utils/useAsync";
import { theme } from "../../src/theme";
import { createEmergencyEvent, listEmergencyContacts } from "../../src/services/emergencyService";
import { captureAndStoreLocation } from "../../src/features/safety/locationCapture";
import type { EmergencyContact } from "../../src/types/database";

export default function HelpScreen(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);

  const { state, reload } = useAsync<EmergencyContact[]>(() => listEmergencyContacts(id), [id]);

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

  return (
    <Screen scroll>
      <AppBar title="Help" subtitle="Tap any button. I am here to help." />
      <StateView state={state} onRetry={reload} loadingLabel="Getting help ready…">
        {(contacts) => (
          <Stack gap="md">
            <BigHelpButton
              icon="location"
              label="I am lost"
              description="I will help you find your way home."
              onPress={() => router.push({ pathname: "/user/nikki", params: { ask: "I am lost" } })}
            />
            <BigHelpButton
              icon="phone"
              label="Call family"
              description="Phone someone who can help."
              onPress={() => callFirst(contacts, false)}
            />
            <BigHelpButton
              icon="help"
              label="I need help"
              description="Tell Nikki what is wrong."
              onPress={() => router.push({ pathname: "/user/nikki", params: { ask: "I need help" } })}
            />
            <BigHelpButton
              icon="warning"
              label="Emergency"
              description="Call family right away and share where you are."
              tone="danger"
              onPress={() => callFirst(contacts, true)}
            />
            {note ? (
              <View style={styles.note}>
                <Text variant="body" tone="textSecondary" center>
                  {note}
                </Text>
              </View>
            ) : null}
          </Stack>
        )}
      </StateView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { paddingTop: theme.spacing.md },
});
