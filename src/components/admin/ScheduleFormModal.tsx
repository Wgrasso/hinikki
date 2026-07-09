// src/components/admin/ScheduleFormModal.tsx — add a calendar event or a reminder, including the
// gentle words Nikki should say.
import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Stack, Text } from "../../primitives";
import { createEvent } from "../../services/calendarService";
import { createReminder } from "../../services/reminderService";

type Kind = "event" | "reminder";

type Props = {
  visible: boolean;
  kind: Kind;
  olderAdultId: string;
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

export default function ScheduleFormModal({ visible, kind, olderAdultId, onClose, onSaved }: Props): React.ReactElement {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [detail, setDetail] = useState("");
  const [nikkiMessage, setNikkiMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset(): void {
    setTitle("");
    setTime("");
    setDetail("");
    setNikkiMessage("");
    setError(null);
  }

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
        await createEvent(olderAdultId, {
          title: title.trim(),
          start_at: startAt,
          what_to_bring: detail.trim() || null,
          nikki_before_event_message: nikkiMessage.trim() || null,
          user_friendly_summary: title.trim(),
          priority_level: "normal",
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
      reset();
      onSaved();
      onClose();
    } catch {
      setError("We could not save just now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text variant="title">{kind === "event" ? "Add an event" : "Add a reminder"}</Text>
            <Field label="Title" value={title} onChangeText={setTitle} placeholder={kind === "event" ? "e.g. Doctor appointment" : "e.g. Morning medication"} autoCapitalize="sentences" error={error} />
            <Field label="Time (today)" value={time} onChangeText={setTime} placeholder="e.g. 11:30" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
            <Field label={kind === "event" ? "What to bring" : "Instructions"} value={detail} onChangeText={setDetail} placeholder="Optional" multiline />
            <Field label="What Nikki should say" value={nikkiMessage} onChangeText={setNikkiMessage} placeholder="A calm, warm message" multiline />
            <Stack gap="sm" style={styles.actions}>
              <Button label="Save" icon="check" loading={saving} onPress={save} />
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
