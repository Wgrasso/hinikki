// src/components/admin/ScheduleFormModal.tsx — add OR edit ONE calendar event or ONE reminder.
// The day is chosen with chips (Today / Tomorrow / Pick a day, plus Anytime for reminders); once
// "Pick a day" or a clock time is needed, DateTimePickerField opens the native date/time picker.
// Editing keeps the record's original date+time until the family member actually changes it, and
// never invents a clock time on an update.
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Icon, Stack, Text } from "../../primitives";
import BottomSheetModal from "../shared/BottomSheetModal";
import DateTimePickerField from "./DateTimePickerField";
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

const REPEATS_OPTIONS = [
  { value: "once", label: "Just once" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "custom", label: "Custom…" },
] as const;
type RepeatsMode = (typeof REPEATS_OPTIONS)[number]["value"];

// Local calendar-day key ("2026-07-09") so date comparisons ignore the time of day.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// What the date chips should show for an existing record: Today/Tomorrow when they match,
// otherwise "Pick a day" with the record's exact original date (including year) carried forward
// so editing only the time never silently re-dates the record.
function prefillDate(iso: string | null): { mode: DateMode; pickedDate: Date | null } {
  if (!iso) return { mode: "today", pickedDate: null };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { mode: "today", pickedDate: null };
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dayKey(d) === dayKey(today)) return { mode: "today", pickedDate: null };
  if (dayKey(d) === dayKey(tomorrow)) return { mode: "tomorrow", pickedDate: null };
  return { mode: "pick", pickedDate: d };
}

// The chosen calendar day, or null when "Pick a day" is selected but nothing has been picked yet.
function resolveChosenDay(mode: DateMode, pickedDate: Date | null): Date | null {
  if (mode === "today") return new Date();
  if (mode === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (mode === "pick") return pickedDate;
  return null;
}

// Default clock time for a brand-new record with no time picked: two hours from now, clamped to
// 23:59 so the record never rolls past midnight onto a day nobody chose.
function defaultClock(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0);
  const cap = new Date();
  cap.setHours(23, 59, 0, 0);
  return d > cap ? cap : d;
}

// The chosen calendar day at the given clock time.
function atClock(day: Date, clock: Date): Date {
  const d = new Date(day);
  d.setHours(clock.getHours(), clock.getMinutes(), 0, 0);
  return d;
}

// A saved recurrence_rule string back into a Repeats chip + any custom text it doesn't match.
function prefillRepeats(rule: string | null): { mode: RepeatsMode; custom: string } {
  if (!rule) return { mode: "once", custom: "" };
  if (rule === "Every day") return { mode: "daily", custom: "" };
  if (rule === "Every week") return { mode: "weekly", custom: "" };
  return { mode: "custom", custom: rule };
}

function repeatsToRule(mode: RepeatsMode, custom: string): string | null {
  if (mode === "once") return null;
  if (mode === "daily") return "Every day";
  if (mode === "weekly") return "Every week";
  return custom.trim() || null;
}

function CheckRow({ label, value, onChange, caption }: { label: string; value: boolean; onChange: (v: boolean) => void; caption?: string }): React.ReactElement {
  return (
    <View>
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
      {caption ? (
        <Text variant="caption" tone="textSecondary" style={styles.toggleCaption}>
          {caption}
        </Text>
      ) : null}
    </View>
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
  const [pickedDate, setPickedDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  // Event
  const [place, setPlace] = useState("");
  const [withSomeone, setWithSomeone] = useState(false);
  const [companion, setCompanion] = useState("");
  const [transport, setTransport] = useState("");
  const [leadMinutes, setLeadMinutes] = useState("");
  const [whatToBring, setWhatToBring] = useState("");
  const [endTime, setEndTime] = useState<Date | null>(null);
  // Reminder
  const [repeatsMode, setRepeatsMode] = useState<RepeatsMode>("once");
  const [customFrequency, setCustomFrequency] = useState("");
  const [nikkiMessage, setNikkiMessage] = useState("");
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  // Prefill from the record each time the sheet opens (add = blank, edit = existing values).
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setDateError(null);
    const prefill = prefillDate(kind === "event" ? event?.start_at ?? null : reminder?.scheduled_at ?? null);
    // A reminder saved without a set time starts out on the "Anytime" chip.
    const startedUnscheduled = kind === "reminder" && Boolean(reminder) && !reminder?.scheduled_at;
    setDateMode(startedUnscheduled ? "anytime" : prefill.mode);
    setPickedDate(prefill.pickedDate);
    if (kind === "event" && event) {
      setTitle(event.title);
      setStartTime(new Date(event.start_at));
      setPlace(event.location_name ?? "");
      setWithSomeone(Boolean(event.companion));
      setCompanion(event.companion ?? "");
      setTransport(event.transport_notes ?? "");
      setLeadMinutes(event.announce_lead_minutes != null ? String(event.announce_lead_minutes) : "");
      setWhatToBring(event.what_to_bring ?? "");
      setEndTime(event.end_at ? new Date(event.end_at) : null);
    } else if (kind === "reminder" && reminder) {
      setTitle(reminder.title);
      setStartTime(reminder.scheduled_at ? new Date(reminder.scheduled_at) : null);
      const repeats = prefillRepeats(reminder.recurrence_rule);
      setRepeatsMode(repeats.mode);
      setCustomFrequency(repeats.custom);
      setNikkiMessage(reminder.nikki_message ?? reminder.instructions ?? "");
      setRequiresConfirmation(reminder.requires_confirmation);
    } else {
      setTitle("");
      setStartTime(null);
      setPlace("");
      setWithSomeone(false);
      setCompanion("");
      setTransport("");
      setLeadMinutes("");
      setWhatToBring("");
      setEndTime(null);
      setRepeatsMode("once");
      setCustomFrequency("");
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
    // A reminder stays unscheduled (scheduled_at null) only when the Anytime chip is chosen.
    const unscheduled = kind === "reminder" && dateMode === "anytime";
    const chosenDay = unscheduled ? null : resolveChosenDay(dateMode, pickedDate);
    if (!unscheduled && !chosenDay) {
      setDateError("Please choose a date.");
      return;
    }
    const startAt = chosenDay ? atClock(chosenDay, startTime ?? defaultClock()) : null;
    setSaving(true);
    setError(null);
    setDateError(null);
    try {
      if (kind === "event" && chosenDay && startAt) {
        const lead = leadMinutes.trim() ? Number.parseInt(leadMinutes.trim(), 10) : null;
        let endAt: Date | null = null;
        if (endTime) {
          endAt = atClock(chosenDay, endTime);
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
          recurrence_rule: repeatsToRule(repeatsMode, customFrequency),
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
    <BottomSheetModal visible={visible} onClose={onClose} title={heading}>
      <Field label="Title" value={title} onChangeText={setTitle} placeholder={kind === "event" ? "e.g. Doctor appointment" : "e.g. Water the plants"} autoCapitalize="sentences" error={error} />

      <ChipRow label="Which day" options={kind === "reminder" ? REMINDER_DATE_OPTIONS : DATE_OPTIONS} value={dateMode} onChange={setDateMode} />
      {dateMode === "pick" ? (
        <DateTimePickerField
          label="Date"
          mode="date"
          value={pickedDate}
          initialValue={pickedDate ?? new Date()}
          placeholder="Choose a date"
          error={dateError}
          onChange={(d) => {
            setPickedDate(d);
            setDateError(null);
          }}
        />
      ) : null}

      {dateMode === "anytime" ? null : (
        <View style={styles.timeRow}>
          <View style={styles.timeField}>
            <DateTimePickerField
              label="Start time"
              mode="time"
              value={startTime}
              initialValue={startTime ?? defaultClock()}
              placeholder="Choose a time"
              onChange={setStartTime}
            />
          </View>
          {kind === "event" ? (
            <View style={styles.timeField}>
              <DateTimePickerField
                label="End time (optional)"
                mode="time"
                value={endTime}
                initialValue={endTime ?? startTime ?? defaultClock()}
                placeholder="No end time"
                onChange={setEndTime}
                onClear={() => setEndTime(null)}
              />
            </View>
          ) : null}
        </View>
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
        </>
      ) : (
        <>
          <ChipRow label="Repeats" options={REPEATS_OPTIONS} value={repeatsMode} onChange={setRepeatsMode} />
          {repeatsMode === "custom" ? (
            <Field label="How often it repeats" value={customFrequency} onChangeText={setCustomFrequency} placeholder="e.g. Every other day" />
          ) : null}
          <Field label="What Nikki should say" value={nikkiMessage} onChangeText={setNikkiMessage} placeholder="e.g. Time to water the plants on the windowsill" multiline />
          <CheckRow
            label="Ask later if it was done"
            value={requiresConfirmation}
            onChange={setRequiresConfirmation}
            caption="Nikki will check in about it, and you'll see the answer here."
          />
        </>
      )}

      <Stack gap="sm" style={styles.actions}>
        <Button label={isEditing ? "Save changes" : "Save"} icon="check" loading={saving} onPress={save} />
        <Button label="Cancel" variant="secondary" onPress={onClose} />
      </Stack>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  actions: { marginTop: theme.spacing.sm },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: 48, paddingVertical: theme.spacing.sm },
  toggleCaption: { marginLeft: theme.spacing.xl + theme.spacing.md },
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
  timeRow: { flexDirection: "row", gap: theme.spacing.md },
  timeField: { flex: 1 },
});
