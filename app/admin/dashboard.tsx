// app/admin/dashboard.tsx — the family's overview: where things stand and what still needs setup.
import React from "react";
import { StyleSheet, View } from "react-native";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Card, Icon, Screen, Stack, Text } from "../../src/primitives";
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
import type { CalendarEvent, EmergencyEvent, LocationUpdate, OlderAdultProfile, Reminder } from "../../src/types/database";
import type { SetupChecklistItem } from "../../src/types/domain";

type DashboardData = {
  adult: OlderAdultProfile | null;
  latest: LocationUpdate | null;
  today: CalendarEvent[];
  reminders: Reminder[];
  alerts: EmergencyEvent[];
  checklist: SetupChecklistItem[];
};

export default function AdminDashboard(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";

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
    return { adult, latest, today, reminders, alerts: alerts.filter((a) => a.status === "open"), checklist };
  }, [id]);

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
          </Stack>
        )}
      </StateView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  alert: { borderLeftWidth: 4, borderLeftColor: theme.colors.danger },
});
