// src/components/admin/ScheduleFormModal.tsx — add OR edit ONE calendar event or ONE reminder.
// Dates are chosen with chips (Today / Tomorrow / Pick a day, plus Anytime for reminders) and a
// HH:MM time — no picker library. Editing keeps the record's original date until the family
// member actually changes it, and never invents a clock time on an update.
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Icon, Stack, Text } from "../../primitives";
import { createEvent, updateEvent } from "../../services/calendarService";
import { createReminder, updateReminder } from "../../services/reminderService";
import type { CalendarEvent, Reminder } from "../../types/database";

type Kind = "event" | "reminder";
type DateMode = "today" | "tomorrow" | "pick" | "anytime";

type Props = {
  visible: boolean;
  kind: Kind;
  olderAdultId: string;
  event?: CalendarEvent | null;
  reminder?: Reminder | null;
  onClose: () => void;
  onSaved: () => void;
};

const DATE_OPTIONS: { value: DateMode; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "pick", label: "Pick a day" },
];

// Reminders can also be "Anytime" — stored with scheduled_at null, no clock time at all.
const REMINDER_DATE_OPTIONS: { value: DateMode; label: string }[] = [
  ...DATE_OPTIONS,
  { value: "anytime", label: "Anytime" },
];

// The 5 reminder kinds Nikki understands (D15) — stored exactly as these strings.
const REMINDER_TYPE_OPTIONS = [
  { value: "routine", label: "Routine" },
  { value: "medication", label: "Medication" },
  { value: "appointment", label: "Appointment" },
  { value: "hydration", label: "Hydration" },
  { value: "visit", label: "Visit" },
] as const;
type ReminderType = (typeof REMINDER_TYPE_OPTIONS)[number]["value"];

// Local calendar-day key ("2026-07-09") so date comparisons ignore the time of day.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// What the date chips should show for an existing record: Today/Tomorrow when they match,
// otherwise "Pick a day" with the record's day+month prefilled. `base` keeps the record's EXACT
// original date (including year) so editing only the time never silently re-dates the record.
function prefillDate(iso: string | null): { mode: DateMode; day: string; month: string; base: string | null } {
  const blank = { mode: "today" as DateMode, day: "", month: "", base: null };
  if (!iso) return blank;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return blank;
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dayKey(d) === dayKey(today)) return { mode: "today", day: "", month: "", base: null };
  if (dayKey(d) === dayKey(tomorrow)) return { mode: "tomorrow", day: "", month: "", base: null };
  return { mode: "pick", day: String(d.getDate()), month: String(d.getMonth() + 1), base: dayKey(d) };
}

// The chosen calendar day, or null when the picked day/month cannot be read. A typed day+month
// assumes the current year and rolls to next year once the date has already passed.
function resolveDay(mode: DateMode, day: string, month: string, base: string | null): Date | null {
  const now = new Date();
  if (mode === "today") return now;
  if (mode === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (base) return new Date(`${base}T12:00:00`);
  const dayN = Number.parseInt(day.trim(), 10);
  const monthN = Number.parseInt(month.trim(), 10);
  if (!Number.isFinite(dayN) || !Number.isFinite(monthN)) return null;
  const candidate = new Date(now.getFullYear(), monthN - 1, dayN);
  // Date() normalizes overflow (e.g. 31 February) — reject anything that shifted.
  if (candidate.getMonth() !== monthN - 1 || candidate.getDate() !== dayN) return null;
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }
  return candidate;
}

type ClockTime = { hours: number; minutes: number };

// "HH:MM" → clock time, or null when the text is not a readable time of day.
function parseTime(text: string): ClockTime | null {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

// Default for a brand-new record with no time typed: two hours from now, clamped to 23:59 so
// the record never rolls past midnight onto a day nobody chose.
function defaultClock(): ClockTime {
  const hours = new Date().getHours() + 2;
  return hours > 23 ? { hours: 23, minutes: 59 } : { hours, minutes: 0 };
}

// The chosen calendar day at the given clock time.
function atTime(day: Date, clock: ClockTime): Date {
  const d = new Date(day);
  d.setHours(clock.hours, clock.minutes, 0, 0);
  return d;
}

function isoToTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function CheckRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={styles.toggleRow}
    >
      <Icon name={value ? "check" : "add"} color={value ? "success" : "textTertiary"} />
      <Text variant="body">{label}</Text>
    </Pressable>
  );
}

function ChipRow<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}): React.ReactElement {
  return (
    <View style={styles.chipWrap}>
      <Text variant="overline" tone="textSecondary" style={styles.chipLabel}>
        {label.toUpperCase()}
      </Text>
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={opt.label}
              onPress={() => onChange(opt.value)}
              style={[styles.chip, active ? styles.chipActive : null]}
            >
              <Text variant="bodyStrong" tone={active ? "onPrimary" : "textSecondary"}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ScheduleFormModal({ visible, kind, olderAdultId, event, reminder, onClose, onSaved }: Props): React.ReactElement {
  const isEditing = kind === "event" ? Boolean(event) : Boolean(reminder);

  // Common
  const [title, setTitle] = useState("");
  const [dateMode, setDateMode] = useState<DateMode>("today");
  const [pickDay, setPickDay] = useState("");
  const [pickMonth, setPickMonth] = useState("");
  // The record's exact original date; cleared as soon as the day/month is typed over.
  const [pickBase, setPickBase] = useState<string | null>(null);
  const [time, setTime] = useState("");
  // Event
  const [place, setPlace] = useState("");
  const [withSomeone, setWithSomeone] = useState(false);
  const [companion, setCompanion] = useState("");
  const [transport, setTransport] = useState("");
  const [leadMinutes, setLeadMinutes] = useState("");
  const [whatToBring, setWhatToBring] = useState("");
  const [endTime, setEndTime] = useState("");
  // Reminder
  const [reminderType, setReminderType] = useState<ReminderType>("routine");
  const [frequency, setFrequency] = useState("");
  const [instructions, setInstructions] = useState("");
  const [nikkiMessage, setNikkiMessage] = useState("");
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [endTimeError, setEndTimeError] = useState<string | null>(null);

  // Prefill from the record each time the sheet opens (add = blank, edit = existing values).
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setDateError(null);
    setTimeError(null);
    setEndTimeError(null);
    const prefill = prefillDate(kind === "event" ? event?.start_at ?? null : reminder?.scheduled_at ?? null);
    // A reminder saved without a set time starts out on the "Anytime" chip.
    const startedUnscheduled = kind === "reminder" && Boolean(reminder) && !reminder?.scheduled_at;
    setDateMode(startedUnscheduled ? "anytime" : prefill.mode);
    setPickDay(prefill.day);
    setPickMonth(prefill.month);
    setPickBase(prefill.base);
    if (kind === "event" && event) {
      setTitle(event.title);
      setTime(isoToTime(event.start_at));
      setPlace(event.location_name ?? "");
      setWithSomeone(Boolean(event.companion));
      setCompanion(event.companion ?? "");
      setTransport(event.transport_notes ?? "");
      setLeadMinutes(event.announce_lead_minutes != null ? String(event.announce_lead_minutes) : "");
      setWhatToBring(event.what_to_bring ?? "");
      setEndTime(isoToTime(event.end_at));
    } else if (kind === "reminder" && reminder) {
      setTitle(reminder.title);
      setTime(isoToTime(reminder.scheduled_at));
      const known = REMINDER_TYPE_OPTIONS.find((o) => o.value === reminder.reminder_type);
      setReminderType(known ? known.value : "routine");
      setFrequency(reminder.recurrence_rule ?? "");
      setInstructions(reminder.instructions ?? "");
      setNikkiMessage(reminder.nikki_message ?? "");
      setRequiresConfirmation(reminder.requires_confirmation);
    } else {
      setTitle("");
      setTime("");
      setPlace("");
      setWithSomeone(false);
      setCompanion("");
      setTransport("");
      setLeadMinutes("");
      setWhatToBring("");
      setEndTime("");
      setReminderType("routine");
      setFrequency("");
      setInstructions("");
      setNikkiMessage("");
      setRequiresConfirmation(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function save(): Promise<void> {
    if (title.trim().length === 0) {
      setError("Please enter a title.");
      return;
    }
    // A reminder stays unscheduled (scheduled_at null) when the Anytime chip is chosen, or when
    // an existing reminder is saved with the time left empty — an update never invents a time.
    const unscheduled = kind === "reminder" && (dateMode === "anytime" || (Boolean(reminder) && time.trim().length === 0));
    const chosenDay = unscheduled ? null : resolveDay(dateMode, pickDay, pickMonth, pickBase);
    if (!unscheduled && !chosenDay) {
      setDateError("Please enter the day and month as numbers, like 14 and 7.");
      return;
    }
    const startClock = time.trim() ? parseTime(time) : null;
    if (!unscheduled && time.trim().length > 0 && !startClock) {
      setTimeError("Please use a time like 14:30.");
      return;
    }
    const endClock = endTime.trim() ? parseTime(endTime) : null;
    if (kind === "event" && endTime.trim().length > 0 && !endClock) {
      setEndTimeError("Please use a time like 14:30.");
      return;
    }
    // The clock time to save: the typed time, else (editing an event) the event's original
    // clock time, else — only on a create — the two-hours-from-now default.
    const eventClock = kind === "event" && event ? parseTime(isoToTime(event.start_at)) : null;
    const startAt = chosenDay ? atTime(chosenDay, startClock ?? eventClock ?? defaultClock()) : null;
    setSaving(true);
    setError(null);
    setDateError(null);
    setTimeError(null);
    setEndTimeError(null);
    try {
      if (kind === "event" && chosenDay && startAt) {
        const lead = leadMinutes.trim() ? Number.parseInt(leadMinutes.trim(), 10) : null;
        let endAt: Date | null = null;
        if (endClock) {
          endAt = atTime(chosenDay, endClock);
          // An end earlier than the start ("22:00 to 01:00") runs past midnight: next day.
          if (endAt < startAt) endAt.setDate(endAt.getDate() + 1);
        }
        const patch = {
          title: title.trim(),
          start_at: startAt.toISOString(),
          end_at: endAt ? endAt.toISOString() : null,
          location_name: place.trim() || null,
          companion: withSomeone ? companion.trim() || null : null,
          transport_notes: transport.trim() || null,
          announce_lead_minutes: lead != null && Number.isFinite(lead) ? lead : null,
          what_to_bring: whatToBring.trim() || null,
          user_friendly_summary: title.trim(),
        };
        if (event) await updateEvent(event.id, patch);
        else await createEvent(olderAdultId, patch);
      } else if (kind === "reminder") {
        const patch = {
          title: title.trim(),
          scheduled_at: startAt ? startAt.toISOString() : null,
          reminder_type: reminderType,
          recurrence_rule: frequency.trim() || null,
          instructions: instructions.trim() || null,
          nikki_message: nikkiMessage.trim() || null,
          requires_confirmation: requiresConfirmation,
        };
        if (reminder) await updateReminder(reminder.id, patch);
        else await createReminder(olderAdultId, patch);
      }
      onSaved();
      onClose();
    } catch {
      setError("We could not save just now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const heading =
    kind === "event" ? (isEditing ? "Edit event" : "Add an event") : isEditing ? "Edit reminder" : "Add a reminder";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text variant="title">{heading}</Text>

            <Field label="Title" value={title} onChangeText={setTitle} placeholder={kind === "event" ? "e.g. Doctor appointment" : "e.g. Morning medication"} autoCapitalize="sentences" error={error} />

            <ChipRow label="Which day" options={kind === "reminder" ? REMINDER_DATE_OPTIONS : DATE_OPTIONS} value={dateMode} onChange={setDateMode} />
            {dateMode === "pick" ? (
              <View style={styles.dayMonthRow}>
                <View style={styles.dayMonthField}>
                  <Field
                    label="Day"
                    value={pickDay}
                    onChangeText={(v) => {
                      setPickDay(v);
                      setPickBase(null);
                      setDateError(null);
                    }}
                    placeholder="e.g. 14"
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    error={dateError}
                  />
                </View>
                <View style={styles.dayMonthField}>
                  <Field
                    label="Month"
                    value={pickMonth}
                    onChangeText={(v) => {
                      setPickMonth(v);
                      setPickBase(null);
                      setDateError(null);
                    }}
                    placeholder="e.g. 7"
                    keyboardType="number-pad"
                    autoCapitalize="none"
                  />
                </View>
              </View>
            ) : null}

            {dateMode === "anytime" ? null : (
              <Field
                label="Time"
                value={time}
                onChangeText={(v) => {
                  setTime(v);
                  setTimeError(null);
                }}
                placeholder="e.g. 11:30"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                error={timeError}
              />
            )}

            {kind === "event" ? (
              <>
                <Field label="Place" value={place} onChangeText={setPlace} placeholder="e.g. Dr. Jansen's practice" />
                <CheckRow label="Goes with someone" value={withSomeone} onChange={setWithSomeone} />
                {withSomeone ? (
                  <Field label="With whom (person or group)" value={companion} onChangeText={setCompanion} placeholder="e.g. Mark, or the walking group" />
                ) : null}
                <Field label="How they get there" value={transport} onChangeText={setTransport} placeholder="e.g. Mark picks them up" multiline />
                <Field label="Announce how many minutes before" value={leadMinutes} onChangeText={setLeadMinutes} placeholder="e.g. 30" keyboardType="number-pad" autoCapitalize="none" />
                <Field label="Notes for Nikki (preparation, clothing, things to bring)" value={whatToBring} onChangeText={setWhatToBring} placeholder="Optional" multiline />
                <Field
                  label="End time (optional)"
                  value={endTime}
                  onChangeText={(v) => {
                    setEndTime(v);
                    setEndTimeError(null);
                  }}
                  placeholder="e.g. 12:30"
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  error={endTimeError}
                />
              </>
            ) : (
              <>
                <ChipRow label="What kind of reminder" options={REMINDER_TYPE_OPTIONS} value={reminderType} onChange={setReminderType} />
                <Field label="How often it repeats" value={frequency} onChangeText={setFrequency} placeholder="e.g. Every morning" />
                <Field label="Instructions" value={instructions} onChangeText={setInstructions} placeholder="Optional" multiline />
                <Field label="What Nikki should say" value={nikkiMessage} onChangeText={setNikkiMessage} placeholder="A calm, warm message" multiline />
                <CheckRow label="Ask later if it was done" value={requiresConfirmation} onChange={setRequiresConfirmation} />
              </>
            )}

            <Stack gap="sm" style={styles.actions}>
              <Button label={isEditing ? "Save changes" : "Save"} icon="check" loading={saving} onPress={save} />
              <Button label="Cancel" variant="secondary" onPress={onClose} />
            </Stack>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.background, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, maxHeight: "92%", paddingTop: theme.spacing.md },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.border, marginBottom: theme.spacing.sm },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  actions: { marginTop: theme.spacing.sm },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: 48, paddingVertical: theme.spacing.sm },
  chipWrap: { alignSelf: "stretch", gap: theme.spacing.xs },
  chipLabel: { marginLeft: theme.spacing.xs },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  chip: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  dayMonthRow: { flexDirection: "row", gap: theme.spacing.md },
  dayMonthField: { flex: 1 },
});
