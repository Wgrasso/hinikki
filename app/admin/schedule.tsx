// app/admin/schedule.tsx — calendar events and reminders, stacked as two sections of one screen.
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Card, Screen, Stack, Text } from "../../src/primitives";
import ListRow from "../../src/components/shared/ListRow";
import StateView from "../../src/components/shared/StateView";
import ScheduleFormModal from "../../src/components/admin/ScheduleFormModal";
import SectionHeader from "../../src/components/admin/SectionHeader";
import DateNavigator from "../../src/components/admin/DateNavigator";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { formatTime } from "../../src/utils/format";
import { listEvents } from "../../src/services/calendarService";
import { listLatestConfirmations, listReminders, type LatestConfirmation } from "../../src/services/reminderService";
import { useT } from "../../src/i18n";
import type { CalendarEvent, Reminder } from "../../src/types/database";

type TFn = (key: string, params?: Record<string, string | number>) => string;

type ScheduleData = {
  events: CalendarEvent[];
  reminders: Reminder[];
  confirmations: Record<string, LatestConfirmation>;
};

// True when an ISO timestamp falls on the same calendar day as `day` (local time).
function sameLocalDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
}

// "Confirmed 5:32 pm by voice" — the quiet line under reminders the elder has confirmed.
function confirmationLine(conf: LatestConfirmation, t: TFn): string {
  const time = formatTime(conf.confirmed_at);
  if (conf.confirmation_method === "voice") return t("adminSchedule.confirmedByVoice", { time });
  if (conf.confirmation_method === "tap") return t("adminSchedule.confirmedInApp", { time });
  return t("adminSchedule.confirmed", { time });
}

export default function AdminSchedule(): React.ReactElement {
  const { t } = useT();
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const [addingKind, setAddingKind] = useState<"event" | "reminder" | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

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
      <StateView state={state} onRetry={reload} loadingLabel={t("adminSchedule.loading")}>
        {(data) => {
          // Only what's planned for the CHOSEN day. Events match the day; reminders that
          // recur or are "Anytime" apply every day, so they show whichever day you're on;
          // one-off reminders only show on their day.
          const dayEvents = data.events
            .filter((e) => e.start_at && sameLocalDay(e.start_at, selectedDate))
            .sort((a, b) => a.start_at.localeCompare(b.start_at));
          const dayReminders = data.reminders
            .filter((r) => r.recurrence_rule || !r.scheduled_at || sameLocalDay(r.scheduled_at, selectedDate))
            .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));

          return (
            <Stack gap="lg">
              <AppBar title={t("adminSchedule.title")} subtitle={t("adminSchedule.subtitle")} />

              <DateNavigator date={selectedDate} onChange={setSelectedDate} />

              <View>
                <SectionHeader title={t("adminSchedule.events")} actionLabel={t("adminSchedule.addEvent")} onAction={() => setAddingKind("event")} />
                {dayEvents.length === 0 ? (
                  <EmptyHint text={t("adminSchedule.noEventsDay")} />
                ) : (
                  <Stack gap="sm">
                    {dayEvents.map((item) => (
                      <ListRow
                        key={item.id}
                        title={item.user_friendly_summary ?? item.title}
                        subtitle={`${formatTime(item.start_at)}${item.what_to_bring ? ` ${t("adminSchedule.bring", { item: item.what_to_bring })}` : ""}`}
                        onPress={() => setEditEvent(item)}
                        accessibilityLabel={t("admin.editName", { name: item.title })}
                      />
                    ))}
                  </Stack>
                )}
              </View>

              <View>
                <SectionHeader title={t("admin.reminders")} actionLabel={t("adminSchedule.addReminder")} onAction={() => setAddingKind("reminder")} />
                {dayReminders.length === 0 ? (
                  <EmptyHint text={t("adminSchedule.noRemindersDay")} />
                ) : (
                  <Stack gap="sm">
                    {dayReminders.map((item) => (
                      <ReminderRow key={item.id} item={item} confirmations={data.confirmations} onPress={() => setEditReminder(item)} />
                    ))}
                  </Stack>
                )}
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
  const { t } = useT();
  const conf = item.requires_confirmation ? confirmations[item.id] : undefined;
  return (
    <View>
      <ListRow
        title={item.title}
        subtitle={item.scheduled_at ? formatTime(item.scheduled_at) : t("admin.anytime")}
        onPress={onPress}
        accessibilityLabel={t("admin.editName", { name: item.title })}
      />
      {conf ? (
        <Text variant="caption" tone="success" style={styles.confirmed}>
          {confirmationLine(conf, t)}
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
});
