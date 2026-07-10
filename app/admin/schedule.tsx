// app/admin/schedule.tsx — calendar events and reminders, as two segments of one screen.
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Card, Screen, Text } from "../../src/primitives";
import ListRow from "../../src/components/shared/ListRow";
import StateView from "../../src/components/shared/StateView";
import ScheduleFormModal from "../../src/components/admin/ScheduleFormModal";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { formatTime } from "../../src/utils/format";
import { listEvents } from "../../src/services/calendarService";
import { listLatestConfirmations, listReminders, type LatestConfirmation } from "../../src/services/reminderService";
import type { CalendarEvent, Reminder } from "../../src/types/database";

type Segment = "events" | "reminders";
type ScheduleData = {
  events: CalendarEvent[];
  reminders: Reminder[];
  confirmations: Record<string, LatestConfirmation>;
};

// "Confirmed 5:32 pm by voice" — the quiet line under reminders the elder has confirmed.
function confirmationLine(conf: LatestConfirmation): string {
  const method = conf.confirmation_method === "voice" ? " by voice" : conf.confirmation_method === "tap" ? " in the app" : "";
  return `Confirmed ${formatTime(conf.confirmed_at)}${method}`;
}

export default function AdminSchedule(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const [segment, setSegment] = useState<Segment>("events");
  const [adding, setAdding] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);

  const { state, reload } = useAsync<ScheduleData>(async () => {
    const [events, reminders, confirmations] = await Promise.all([
      listEvents(id),
      listReminders(id),
      listLatestConfirmations(id),
    ]);
    return { events, reminders, confirmations };
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

  const kind = segment === "events" ? "event" : "reminder";
  const formVisible = adding || editEvent !== null || editReminder !== null;

  function closeForm(): void {
    setAdding(false);
    setEditEvent(null);
    setEditReminder(null);
  }

  return (
    <Screen padded={false}>
      <View style={styles.bar}>
        <AppBar title="Schedule" subtitle="What's coming up, in Nikki's words." rightLabel="Add" onRightPress={() => setAdding(true)} onRefresh={reload} />
        <View style={styles.segments}>
          {(["events", "reminders"] as Segment[]).map((seg) => (
            <Pressable
              key={seg}
              accessibilityRole="tab"
              accessibilityState={{ selected: segment === seg }}
              accessibilityLabel={seg === "events" ? "Events" : "Reminders"}
              onPress={() => setSegment(seg)}
              style={[styles.segment, segment === seg ? styles.segmentActive : null]}
            >
              <Text variant="bodyStrong" tone={segment === seg ? "onPrimary" : "textSecondary"}>
                {seg === "events" ? "Events" : "Reminders"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <StateView state={state} onRetry={reload} loadingLabel="Loading the schedule…">
        {(data) =>
          segment === "events" ? (
            <FlatList
              data={data.events}
              keyExtractor={(e) => e.id}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              ListEmptyComponent={<EmptyHint text="No events yet. Add one so Nikki can prepare your loved one calmly." />}
              renderItem={({ item }) => (
                <ListRow
                  title={item.user_friendly_summary ?? item.title}
                  subtitle={`${formatTime(item.start_at)}${item.what_to_bring ? ` · bring ${item.what_to_bring}` : ""}`}
                  onPress={() => setEditEvent(item)}
                  accessibilityLabel={`Edit ${item.title}`}
                />
              )}
            />
          ) : (
            <FlatList
              data={data.reminders}
              keyExtractor={(r) => r.id}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              ListEmptyComponent={<EmptyHint text="No reminders yet. Add routine, hydration or visit reminders." />}
              renderItem={({ item }) => {
                const conf = item.requires_confirmation ? data.confirmations[item.id] : undefined;
                return (
                  <View>
                    <ListRow
                      title={item.title}
                      subtitle={item.scheduled_at ? formatTime(item.scheduled_at) : "Anytime"}
                      onPress={() => setEditReminder(item)}
                      accessibilityLabel={`Edit ${item.title}`}
                    />
                    {conf ? (
                      <Text variant="caption" tone="success" style={styles.confirmed}>
                        {confirmationLine(conf)}
                      </Text>
                    ) : null}
                  </View>
                );
              }}
            />
          )
        }
      </StateView>

      <ScheduleFormModal
        visible={formVisible}
        kind={kind}
        olderAdultId={id}
        event={editEvent}
        reminder={editReminder}
        onClose={closeForm}
        onSaved={reload}
      />
    </Screen>
  );
}

function EmptyHint({ text }: { text: string }): React.ReactElement {
  return (
    <Card bordered elevation="none">
      <Text variant="body" tone="textSecondary">
        {text}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: theme.spacing.lg },
  segments: { flexDirection: "row", gap: theme.spacing.sm, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, padding: theme.spacing.xs, marginBottom: theme.spacing.md },
  segment: { flex: 1, alignItems: "center", paddingVertical: theme.spacing.md, borderRadius: theme.radius.pill },
  segmentActive: { backgroundColor: theme.colors.primary },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  sep: { height: theme.spacing.sm },
  confirmed: { marginTop: theme.spacing.xs, marginLeft: theme.spacing.lg },
});
