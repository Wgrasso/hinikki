// src/components/admin/SupportNotesSection.tsx — where family sees and edits the learned
// "how to support {name}" observations. Nikki proposes these from conversation (support_note
// proposals) and, once approved, they live in ai_memory_items and shape how she helps. Family can
// reword or remove any note here so the guidance always reflects what actually works.
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Card, Field, Icon, Stack, Text } from "../../primitives";
import SectionHeader from "./SectionHeader";
import BottomSheetModal from "../shared/BottomSheetModal";
import { useAsync } from "../../utils/useAsync";
import { deleteSupportNote, listSupportNotes, updateSupportNote } from "../../services/memoryService";

type Props = {
  olderAdultId: string;
  elderName: string;
};

type SupportNote = { id: string; content: string };

export default function SupportNotesSection({ olderAdultId, elderName }: Props): React.ReactElement {
  const { state, reload } = useAsync<SupportNote[]>(() => listSupportNotes(olderAdultId), [olderAdultId]);
  const notes = state.status === "loaded" ? state.data : [];

  const [editing, setEditing] = useState<SupportNote | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function openEdit(note: SupportNote): void {
    setEditing(note);
    setDraft(note.content);
    setError(null);
  }

  async function save(): Promise<void> {
    if (!editing) return;
    const text = draft.trim();
    if (text.length === 0) {
      setError("Please add a few words, or remove the note instead.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateSupportNote(editing.id, text);
      setEditing(null);
      reload();
    } catch {
      setError("We could not save just now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(note: SupportNote): Promise<void> {
    setRemovingId(note.id);
    try {
      await deleteSupportNote(note.id);
      reload();
    } catch {
      Alert.alert("We could not remove that", "Please try again in a moment.");
    } finally {
      setRemovingId(null);
    }
  }

  function confirmRemove(note: SupportNote): void {
    Alert.alert("Remove this note?", "Nikki will no longer use it to help.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void remove(note) },
    ]);
  }

  return (
    <View>
      <SectionHeader title={`How Nikki supports ${elderName}`} />
      {notes.length === 0 ? (
        <Text variant="body" tone="textSecondary">
          {`Nikki will learn how best to help ${elderName} as you talk, and you can adjust it here.`}
        </Text>
      ) : (
        <Stack gap="sm">
          {notes.map((note) => (
            <Card key={note.id} elevation="card">
              <Stack direction="row" gap="sm" align="center">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit this note"
                  onPress={() => openEdit(note)}
                  style={({ pressed }) => [styles.editRow, pressed ? styles.pressed : null]}
                >
                  <Text variant="body" style={styles.noteText}>
                    {note.content}
                  </Text>
                  <Icon name="edit" color="textTertiary" size={theme.iconSize.sm} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove this note"
                  onPress={() => confirmRemove(note)}
                  disabled={removingId === note.id}
                  hitSlop={10}
                  style={({ pressed }) => [styles.remove, pressed ? styles.pressed : null]}
                >
                  <Icon name="close" color="textTertiary" />
                </Pressable>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      <BottomSheetModal
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit note"
        subtitle={`How Nikki can best support ${elderName}.`}
      >
        <Field
          label="Note"
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. She feels calmer when you mention her garden"
          autoCapitalize="sentences"
          multiline
          error={error}
        />
        <Stack gap="sm" style={styles.actions}>
          <Button label="Save changes" icon="check" loading={saving} onPress={() => void save()} />
          <Button label="Cancel" variant="secondary" disabled={saving} onPress={() => setEditing(null)} />
        </Stack>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  editRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: 44 },
  noteText: { flex: 1 },
  remove: { minHeight: 44, minWidth: 32, alignItems: "center", justifyContent: "center" },
  actions: { marginTop: theme.spacing.sm },
  pressed: { opacity: 0.6 },
});
