// src/components/admin/ScheduleFormModal.tsx — add OR edit ONE calendar event or ONE reminder.
// Same single item as before, only with more input fields. No new/alarm feature: the "announce X
// minutes before" is just an input on the event that tells Nikki when to mention it.
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Icon, Stack, Text } from "../../primitives";
import { createEvent, updateEvent } from "../../services/calendarService";
import { createReminder, updateReminder } from "../../services/reminderService";
import type { CalendarEvent, Reminder } from "../../types/database";

type Kind = "event" | "reminder";

type Props = {
  visible: boolean;
  kind: Kind;
  olderAdultId: string;
  event?: CalendarEvent | null;
  reminder?: Reminder | null;
  onClose: () => void;
  onSaved: () => void;
};

function parseTimeToday(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  const d = new Date();
  if (match) {
    d.setHours(Math.min(23, Number(match[1])), Math.min(59, Number(match[2])), 0, 0);
  } else {
    d.setHours(d.getHours() + 2, 0, 0, 0);
  }
  return d.toISOString();
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

export default function ScheduleFormModal({ visible, kind, olderAdultId, event, reminder, onClose, onSaved }: Props): React.ReactElement {
  const isEditing = kind === "event" ? Boolean(event) : Boolean(reminder);

  // Common
  const [title, setTitle] = useState("");
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
  const [frequency, setFrequency] = useState("");
  const [instructions, setInstructions] = useState("");
  const [nikkiMessage, setNikkiMessage] = useState("");
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the record each time the sheet opens (add = blank, edit = existing values).
  useEffect(() => {
    if (!visible) return;
    setError(null);
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
      setFrequency(reminder.reminder_type ?? "");
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
    setSaving(true);
    setError(null);
    try {
      const startAt = parseTimeToday(time);
      if (kind === "event") {
        const lead = leadMinutes.trim() ? Number.parseInt(leadMinutes.trim(), 10) : null;
        const patch = {
          title: title.trim(),
          start_at: startAt,
          end_at: endTime.trim() ? parseTimeToday(endTime) : null,
          location_name: place.trim() || null,
          companion: withSomeone ? companion.trim() || null : null,
          transport_notes: transport.trim() || null,
          announce_lead_minutes: lead != null && Number.isFinite(lead) ? lead : null,
          what_to_bring: whatToBring.trim() || null,
          user_friendly_summary: title.trim(),
        };
        if (event) await updateEvent(event.id, patch);
        else await createEvent(olderAdultId, patch);
      } else {
        const patch = {
          title: title.trim(),
          scheduled_at: startAt,
          reminder_type: frequency.trim() || null,
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
            <Field label="Time (today)" value={time} onChangeText={setTime} placeholder="e.g. 11:30" keyboardType="numbers-and-punctuation" autoCapitalize="none" />

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
                <Field label="End time (optional)" value={endTime} onChangeText={setEndTime} placeholder="e.g. 12:30" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
              </>
            ) : (
              <>
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
});
