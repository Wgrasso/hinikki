// src/components/admin/ScheduleFormModal.tsx — add OR edit a calendar event or a reminder, including
// the gentle words Nikki should say.
import React, { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Stack, Text } from "../../primitives";
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

export default function ScheduleFormModal({ visible, kind, olderAdultId, event, reminder, onClose, onSaved }: Props): React.ReactElement {
  const isEditing = kind === "event" ? Boolean(event) : Boolean(reminder);

  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [detail, setDetail] = useState("");
  const [nikkiMessage, setNikkiMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the record each time the sheet opens (add = blank, edit = existing values).
  useEffect(() => {
    if (!visible) return;
    if (kind === "event" && event) {
      setTitle(event.title);
      setTime(isoToTime(event.start_at));
      setDetail(event.what_to_bring ?? "");
      setNikkiMessage(event.nikki_before_event_message ?? "");
    } else if (kind === "reminder" && reminder) {
      setTitle(reminder.title);
      setTime(isoToTime(reminder.scheduled_at));
      setDetail(reminder.instructions ?? "");
      setNikkiMessage(reminder.nikki_message ?? "");
    } else {
      setTitle("");
      setTime("");
      setDetail("");
      setNikkiMessage("");
    }
    setError(null);
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
        if (event) {
          await updateEvent(event.id, {
            title: title.trim(),
            start_at: startAt,
            what_to_bring: detail.trim() || null,
            nikki_before_event_message: nikkiMessage.trim() || null,
            user_friendly_summary: title.trim(),
          });
        } else {
          await createEvent(olderAdultId, {
            title: title.trim(),
            start_at: startAt,
            what_to_bring: detail.trim() || null,
            nikki_before_event_message: nikkiMessage.trim() || null,
            user_friendly_summary: title.trim(),
            priority_level: "normal",
          });
        }
      } else if (reminder) {
        await updateReminder(reminder.id, {
          title: title.trim(),
          scheduled_at: startAt,
          instructions: detail.trim() || null,
          nikki_message: nikkiMessage.trim() || null,
        });
      } else {
        await createReminder(olderAdultId, {
          title: title.trim(),
          scheduled_at: startAt,
          instructions: detail.trim() || null,
          nikki_message: nikkiMessage.trim() || null,
          reminder_type: "routine",
        });
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
            <Field label={kind === "event" ? "What to bring" : "Instructions"} value={detail} onChangeText={setDetail} placeholder="Optional" multiline />
            <Field label="What Nikki should say" value={nikkiMessage} onChangeText={setNikkiMessage} placeholder="A calm, warm message" multiline />
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
});
