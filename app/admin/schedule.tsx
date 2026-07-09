// app/admin/schedule.tsx — calendar events and reminders, as two segments of one screen.
import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Card, Screen, Stack, Text } from "../../src/primitives";
import ListRow from "../../src/components/shared/ListRow";
import StateView from "../../src/components/shared/StateView";
import ScheduleFormModal from "../../src/components/admin/ScheduleFormModal";
import { useAsync } from "../../src/utils/useAsync";
import { theme } from "../../src/theme";
import { formatTime } from "../../src/utils/format";
import { listEvents } from "../../src/services/calendarService";
import { listReminders } from "../../src/services/reminderService";
import type { CalendarEvent, Reminder } from "../../src/types/database";

type Segment = "events" | "reminders";
type ScheduleData = { events: CalendarEvent[]; reminders: Reminder[] };

export default function AdminSchedule(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const [segment, setSegment] = useState<Segment>("events");
  const [adding, setAdding] = useState(false);

  const { state, reload } = useAsync<ScheduleData>(async () => {
    const [events, reminders] = await Promise.all([listEvents(id), listReminders(id)]);
    return { events, reminders };
  }, [id]);

  return (
    <Screen padded={false}>
      <View style={styles.bar}>
        <AppBar title="Schedule" subtitle="What's coming up, in Nikki's words." rightLabel="Add" onRightPress={() => setAdding(true)} />
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
                <ListRow title={item.user_friendly_summary ?? item.title} subtitle={`${formatTime(item.start_at)}${item.what_to_bring ? ` · bring ${item.what_to_bring}` : ""}`} showChevron={false} />
              )}
            />
          ) : (
            <FlatList
              data={data.reminders}
              keyExtractor={(r) => r.id}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              ListEmptyComponent={<EmptyHint text="No reminders yet. Add medication, hydration or visit reminders." />}
              renderItem={({ item }) => <ListRow title={item.title} subtitle={item.scheduled_at ? formatTime(item.scheduled_at) : "Anytime"} showChevron={false} />}
            />
          )
        }
      </StateView>

      <ScheduleFormModal visible={adding} kind={segment === "events" ? "event" : "reminder"} olderAdultId={id} onClose={() => setAdding(false)} onSaved={reload} />
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
});
