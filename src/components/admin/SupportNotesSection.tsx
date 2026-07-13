// src/components/admin/SupportNotesSection.tsx — where family sees and edits the learned
// "how to support {name}" observations. Nikki proposes these from conversation (support_note
// proposals) and, once approved, they live in ai_memory_items and shape how she helps. Family can
// reword or remove any note here so the guidance always reflects what actually works.
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Card, Field, Icon, Stack, Text } from "../../primitives";
import { useT } from "../../i18n";
import SectionHeader from "./SectionHeader";
import BottomSheetModal from "../shared/BottomSheetModal";
import { useAsync } from "../../utils/useAsync";
import { createSupportNote, deleteSupportNote, listSupportNotes, updateSupportNote } from "../../services/memoryService";

type Props = {
  olderAdultId: string;
  elderName: string;
};

type SupportNote = { id: string; content: string };

export default function SupportNotesSection({ olderAdultId, elderName }: Props): React.ReactElement {
  const { t } = useT();
  const { state, reload } = useAsync<SupportNote[]>(() => listSupportNotes(olderAdultId), [olderAdultId]);
  const notes = state.status === "loaded" ? state.data : [];

  const [editing, setEditing] = useState<SupportNote | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const sheetOpen = editing !== null || creating;

  function openEdit(note: SupportNote): void {
    setEditing(note);
    setCreating(false);
    setDraft(note.content);
    setError(null);
  }

  function openCreate(): void {
    setEditing(null);
    setCreating(true);
    setDraft("");
    setError(null);
  }

  function closeSheet(): void {
    setEditing(null);
    setCreating(false);
  }

  async function save(): Promise<void> {
    const text = draft.trim();
    if (text.length === 0) {
      setError(t("support.errEmpty"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateSupportNote(editing.id, text);
      } else {
        await createSupportNote(olderAdultId, text);
      }
      closeSheet();
      reload();
    } catch {
      setError(t("support.errSave"));
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
      Alert.alert(t("support.removeFailTitle"), t("common.tryAgainMoment"));
    } finally {
      setRemovingId(null);
    }
  }

  function confirmRemove(note: SupportNote): void {
    Alert.alert(t("support.confirmTitle"), t("support.confirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.remove"), style: "destructive", onPress: () => void remove(note) },
    ]);
  }

  return (
    <View>
      <SectionHeader
        title={t("support.title", { name: elderName })}
        actionLabel={t("support.addButton")}
        onAction={openCreate}
      />
      {notes.length === 0 ? (
        <Card elevation="card">
          <Stack gap="sm">
            <Text variant="body" tone="textSecondary">
              {t("support.empty", { name: elderName })}
            </Text>
            <Button label={t("support.addFirst")} icon="add" variant="secondary" onPress={openCreate} />
          </Stack>
        </Card>
      ) : (
        <Stack gap="sm">
          {notes.map((note) => (
            <Card key={note.id} elevation="card">
              <Stack direction="row" gap="sm" align="center">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("support.editA11y")}
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
                  accessibilityLabel={t("support.removeA11y")}
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
        visible={sheetOpen}
        onClose={closeSheet}
        title={creating ? t("support.addTitle") : t("support.editTitle")}
        subtitle={t("support.editSubtitle", { name: elderName })}
      >
        <Field
          label={t("support.noteLabel")}
          value={draft}
          onChangeText={setDraft}
          placeholder={t("support.placeholder")}
          autoCapitalize="sentences"
          multiline
          error={error}
        />
        <Stack gap="sm" style={styles.actions}>
          <Button label={t("common.saveChanges")} icon="check" loading={saving} onPress={() => void save()} />
          <Button label={t("common.cancel")} variant="secondary" disabled={saving} onPress={closeSheet} />
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
