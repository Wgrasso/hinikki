// app/admin/schedule.tsx — calendar events and reminders, stacked as two sections of one screen.
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Card, Icon, Screen, Stack, Text } from "../../src/primitives";
import ListRow from "../../src/components/shared/ListRow";
import StateView from "../../src/components/shared/StateView";
import ScheduleFormModal from "../../src/components/admin/ScheduleFormModal";
import SectionHeader from "../../src/components/admin/SectionHeader";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { formatTime } from "../../src/utils/format";
import { listEvents } from "../../src/services/calendarService";
import { listLatestConfirmations, listReminders, type LatestConfirmation } from "../../src/services/reminderService";
import type { CalendarEvent, Reminder } from "../../src/types/database";

type ScheduleData = {
  events: CalendarEvent[];
  reminders: Reminder[];
  confirmations: Record<string, LatestConfirmation>;
};

const PAST_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Buckets items into "current" (today or later, plus anything undated) and "past" (before
// today, within the review window) so a caregiver can still check recent history without the
// list growing forever — anything older than the window is dropped, not archived.
function splitByRecency<T>(items: T[], dateOf: (item: T) => string | null, now: Date): { current: T[]; past: T[] } {
  const todayStart = startOfDay(now);
  const cutoff = todayStart - PAST_WINDOW_DAYS * DAY_MS;
  const current: T[] = [];
  const past: T[] = [];
  for (const item of items) {
    const iso = dateOf(item);
    if (!iso) {
      current.push(item);
      continue;
    }
    const t = new Date(iso).getTime();
    if (t >= todayStart) current.push(item);
    else if (t >= cutoff) past.push(item);
  }
  return { current, past: past.reverse() }; // most-recently-past first
}

// "Confirmed 5:32 pm by voice" — the quiet line under reminders the elder has confirmed.
function confirmationLine(conf: LatestConfirmation): string {
  const method = conf.confirmation_method === "voice" ? " by voice" : conf.confirmation_method === "tap" ? " in the app" : "";
  return `Confirmed ${formatTime(conf.confirmed_at)}${method}`;
}

// A collapsed-by-default "Past …" drawer nested under a section, so recent history is one
// tap away without cluttering the default view.
function PastSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <View style={styles.past}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${count} item${count === 1 ? "" : "s"}`}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.pastHeader, pressed ? styles.pressed : null]}
      >
        <Text variant="bodyStrong" tone="textSecondary">
          {title} ({count})
        </Text>
        <View style={open ? styles.chevronOpen : undefined}>
          <Icon name="chevron" color="textTertiary" size={theme.iconSize.sm} />
        </View>
      </Pressable>
      {open ? (
        <Stack gap="sm" style={styles.pastBody}>
          {children}
        </Stack>
      ) : null}
    </View>
  );
}

export default function AdminSchedule(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const [addingKind, setAddingKind] = useState<"event" | "reminder" | null>(null);
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

  const kind = addingKind ?? (editReminder ? "reminder" : "event");
  const formVisible = addingKind !== null || editEvent !== null || editReminder !== null;

  function closeForm(): void {
    setAddingKind(null);
    setEditEvent(null);
    setEditReminder(null);
  }

  return (
    <Screen scroll>
      <StateView state={state} onRetry={reload} loadingLabel="Loading the schedule…">
        {(data) => {
          const now = new Date();
          const { current: upcomingEvents, past: pastEvents } = splitByRecency(data.events, (e) => e.start_at, now);
          // Recurring and "Anytime" reminders apply every day, so only one-off (no
          // recurrence_rule) reminders ever move into the past drawer.
          const oneOffReminders = data.reminders.filter((r) => !r.recurrence_rule && r.scheduled_at);
          const standingReminders = data.reminders.filter((r) => r.recurrence_rule || !r.scheduled_at);
          const { current: currentOneOff, past: pastReminders } = splitByRecency(oneOffReminders, (r) => r.scheduled_at, now);
          const currentReminders = [...standingReminders, ...currentOneOff].sort((a, b) =>
            (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""),
          );

          return (
            <Stack gap="lg">
              <AppBar title="Schedule" subtitle="What's coming up, in Nikki's words." onRefresh={reload} />

              <View>
                <SectionHeader title="Events" actionLabel="Add an event" onAction={() => setAddingKind("event")} />
                {upcomingEvents.length === 0 ? (
                  <EmptyHint text="No events yet. Add one so Nikki can prepare your loved one calmly." />
                ) : (
                  <Stack gap="sm">
                    {upcomingEvents.map((item) => (
                      <ListRow
                        key={item.id}
                        title={item.user_friendly_summary ?? item.title}
                        subtitle={`${formatTime(item.start_at)}${item.what_to_bring ? ` · bring ${item.what_to_bring}` : ""}`}
                        onPress={() => setEditEvent(item)}
                        accessibilityLabel={`Edit ${item.title}`}
                      />
                    ))}
                  </Stack>
                )}
                <PastSection title="Past events" count={pastEvents.length}>
                  {pastEvents.map((item) => (
                    <ListRow
                      key={item.id}
                      title={item.user_friendly_summary ?? item.title}
                      subtitle={formatTime(item.start_at)}
                      onPress={() => setEditEvent(item)}
                      accessibilityLabel={`Edit ${item.title}`}
                    />
                  ))}
                </PastSection>
              </View>

              <View>
                <SectionHeader title="Reminders" actionLabel="Add a reminder" onAction={() => setAddingKind("reminder")} />
                {currentReminders.length === 0 ? (
                  <EmptyHint text="No reminders yet. Add routine, hydration or visit reminders." />
                ) : (
                  <Stack gap="sm">
                    {currentReminders.map((item) => (
                      <ReminderRow key={item.id} item={item} confirmations={data.confirmations} onPress={() => setEditReminder(item)} />
                    ))}
                  </Stack>
                )}
                <PastSection title="Past reminders" count={pastReminders.length}>
                  {pastReminders.map((item) => (
                    <ReminderRow key={item.id} item={item} confirmations={data.confirmations} onPress={() => setEditReminder(item)} />
                  ))}
                </PastSection>
              </View>
            </Stack>
          );
        }}
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

function ReminderRow({
  item,
  confirmations,
  onPress,
}: {
  item: Reminder;
  confirmations: Record<string, LatestConfirmation>;
  onPress: () => void;
}): React.ReactElement {
  const conf = item.requires_confirmation ? confirmations[item.id] : undefined;
  return (
    <View>
      <ListRow
        title={item.title}
        subtitle={item.scheduled_at ? formatTime(item.scheduled_at) : "Anytime"}
        onPress={onPress}
        accessibilityLabel={`Edit ${item.title}`}
      />
      {conf ? (
        <Text variant="caption" tone="success" style={styles.confirmed}>
          {confirmationLine(conf)}
        </Text>
      ) : null}
    </View>
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
  confirmed: { marginTop: theme.spacing.xs, marginLeft: theme.spacing.lg },
  past: { marginTop: theme.spacing.sm },
  pastHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
  },
  pastBody: { marginTop: theme.spacing.xs },
  pressed: { opacity: 0.6 },
  chevronOpen: { transform: [{ rotate: "90deg" }] },
});
