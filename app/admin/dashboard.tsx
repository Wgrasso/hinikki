// app/admin/dashboard.tsx — the family's overview: where things stand and what still needs setup.
import React, { useEffect, useState } from "react";
import { Alert, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Card, Icon, Screen, Stack, Text } from "../../src/primitives";
import SetupChecklist from "../../src/components/admin/SetupChecklist";
import SectionHeader from "../../src/components/admin/SectionHeader";
import ListRow from "../../src/components/shared/ListRow";
import StateView from "../../src/components/shared/StateView";
import { useAsync } from "../../src/utils/useAsync";
import { theme } from "../../src/theme";
import { formatTime, relativeTimeLabel } from "../../src/utils/format";
import { getOlderAdult } from "../../src/services/profileService";
import { listEvents, listTodayEvents } from "../../src/services/calendarService";
import { listReminders } from "../../src/services/reminderService";
import { getLatestLocation, listSafeLocations } from "../../src/services/locationService";
import { listEmergencyContacts, listEmergencyEvents } from "../../src/services/emergencyService";
import { listPeople } from "../../src/services/peopleService";
import { registerForPush, sendPush } from "../../src/features/notifications/push";
import type { CalendarEvent, EmergencyEvent, FamilyPerson, LocationUpdate, OlderAdultProfile, Reminder } from "../../src/types/database";
import type { SetupChecklistItem } from "../../src/types/domain";

type DashboardData = {
  adult: OlderAdultProfile | null;
  latest: LocationUpdate | null;
  today: CalendarEvent[];
  reminders: Reminder[];
  alerts: EmergencyEvent[];
  people: FamilyPerson[];
  checklist: SetupChecklistItem[];
};

export default function AdminDashboard(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    void registerForPush().then(setPushToken);
  }, []);

  const { state, reload } = useAsync<DashboardData>(async () => {
    const [adult, latest, today, reminders, alerts, people, events, safe, contacts] = await Promise.all([
      getOlderAdult(id),
      getLatestLocation(id),
      listTodayEvents(id),
      listReminders(id),
      listEmergencyEvents(id),
      listPeople(id),
      listEvents(id),
      listSafeLocations(id),
      listEmergencyContacts(id),
    ]);
    const checklist: SetupChecklistItem[] = [
      { key: "people", label: "Add family & friends", done: people.length > 0 },
      { key: "schedule", label: "Add a calendar event", done: events.length > 0 },
      { key: "safe", label: "Add a safe place", done: safe.length > 0 },
      { key: "contacts", label: "Add an emergency contact", done: contacts.length > 0 },
    ];
    return { adult, latest, today, reminders, alerts: alerts.filter((a) => a.status === "open"), people, checklist };
  }, [id]);

  async function notify(person: FamilyPerson): Promise<void> {
    setPickerOpen(false);
    if (!pushToken) {
      Alert.alert(
        "Push notifications",
        Platform.OS === "web"
          ? "Push notifications only work in the installed app (TestFlight) on a real device, not in the web preview."
          : "Please allow notifications for HiNikki in your device settings, then try again.",
      );
      return;
    }
    const r = await sendPush(pushToken, "HiNikki", `Test notification for ${person.full_name}.`);
    Alert.alert(
      r.ok ? "Notification sent" : "Could not send",
      r.ok ? `A test notification for ${person.full_name} was sent to this device.` : r.message,
    );
  }

  return (
    <Screen scroll>
      <StateView state={state} onRetry={reload} loadingLabel="Loading the dashboard…">
        {(data) => (
          <Stack gap="lg">
            <AppBar title={`${data.adult?.preferred_name ?? data.adult?.display_name ?? "Your"}${data.adult?.preferred_name ? "'s" : ""} day`} subtitle="Everything Nikki is helping with today." onRefresh={reload} />

            {data.alerts.length > 0 ? (
              <Card tone="surface" elevation="lg" style={styles.alert}>
                <Stack direction="row" gap="md" align="center">
                  <Icon name="warning" color="danger" size={theme.iconSize.lg} />
                  <Stack flex gap="xs">
                    <Text variant="bodyStrong" tone="danger">
                      {data.alerts.length} alert{data.alerts.length === 1 ? "" : "s"} need attention
                    </Text>
                    <Text variant="body" tone="textSecondary">
                      {data.adult?.preferred_name ?? "They"} may need help. Open the Safety tab for details.
                    </Text>
                  </Stack>
                </Stack>
              </Card>
            ) : null}

            <Card elevation="card">
              <Stack direction="row" gap="md" align="center">
                <Icon name="location" color="primary" size={theme.iconSize.lg} />
                <Stack flex gap="xs">
                  <Text variant="overline" tone="textSecondary">
                    LAST KNOWN LOCATION
                  </Text>
                  <Text variant="bodyStrong">
                    {data.latest ? `Seen ${relativeTimeLabel(data.latest.created_at)}` : "Not shared yet"}
                  </Text>
                </Stack>
              </Stack>
            </Card>

            <SetupChecklist items={data.checklist} />

            <View>
              <SectionHeader title="Today" />
              {data.today.length === 0 ? (
                <Card bordered elevation="none">
                  <Text variant="body" tone="textSecondary">
                    No events today. Add one in the Schedule tab so Nikki can prepare them.
                  </Text>
                </Card>
              ) : (
                <Stack gap="sm">
                  {data.today.map((e) => (
                    <ListRow key={e.id} title={e.user_friendly_summary ?? e.title} subtitle={formatTime(e.start_at)} showChevron={false} />
                  ))}
                </Stack>
              )}
            </View>

            <View>
              <SectionHeader title="Reminders" />
              {data.reminders.length === 0 ? (
                <Card bordered elevation="none">
                  <Text variant="body" tone="textSecondary">
                    No reminders yet.
                  </Text>
                </Card>
              ) : (
                <Stack gap="sm">
                  {data.reminders.map((r) => (
                    <ListRow key={r.id} title={r.title} subtitle={r.scheduled_at ? formatTime(r.scheduled_at) : "Anytime"} showChevron={false} />
                  ))}
                </Stack>
              )}
            </View>

            <View>
              <SectionHeader title="Notifications" />
              <Button label="Test push notification" icon="send" variant="secondary" onPress={() => setPickerOpen(true)} />
            </View>
          </Stack>
        )}
      </StateView>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text variant="title">Send a test notification</Text>
              <Text variant="body" tone="textSecondary">
                Choose someone in the family. A test push notification will be sent to this device.
              </Text>
              {state.status === "loaded" && state.data.people.length > 0 ? (
                <Stack gap="sm">
                  {state.data.people.map((p) => (
                    <ListRow key={p.id} title={p.full_name} subtitle={p.relationship_label ?? "Family"} onPress={() => notify(p)} />
                  ))}
                </Stack>
              ) : (
                <Text variant="body" tone="textSecondary">
                  Add people first, then you can send them a notification.
                </Text>
              )}
              <Button label="Cancel" variant="secondary" onPress={() => setPickerOpen(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  alert: { borderLeftWidth: 4, borderLeftColor: theme.colors.danger },
  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.background, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, maxHeight: "80%", paddingTop: theme.spacing.md },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.border, marginBottom: theme.spacing.sm },
  sheetContent: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
});
