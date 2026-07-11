// src/components/admin/MemoryFormModal.tsx — add a life memory Nikki can gently bring up.
// "Roughly when" is deliberately free text ('the 1970s', 'her wedding day') — memories rarely
// have exact dates. The person link is an optional single-select chip row (tap again to unselect).
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Icon, Stack, Text } from "../../primitives";
import BottomSheetModal from "../shared/BottomSheetModal";
import { createMemory, deleteMemory, updateMemory } from "../../services/memoryService";
import { useT } from "../../i18n";
import type { FamilyPerson, PersonMemory } from "../../types/database";

type Props = {
  visible: boolean;
  olderAdultId: string;
  people: FamilyPerson[];
  memory?: PersonMemory | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function MemoryFormModal({ visible, olderAdultId, people, memory, onClose, onSaved }: Props): React.ReactElement {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [approximateDate, setApproximateDate] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [canMention, setCanMention] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the record each time the sheet opens (add = blank, edit = existing values).
  useEffect(() => {
    if (!visible) return;
    setTitle(memory?.title ?? "");
    setDescription(memory?.description ?? "");
    setApproximateDate(memory?.approximate_date ?? "");
    setPersonId(memory?.person_id ?? null);
    setCanMention(memory?.can_nikki_mention ?? true);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function save(): Promise<void> {
    if (title.trim().length === 0) {
      setError(t("adminForms.memory.titleRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patch = {
        person_id: personId,
        title: title.trim(),
        description: description.trim() || null,
        approximate_date: approximateDate.trim() || null,
        can_nikki_mention: canMention,
      };
      if (memory) await updateMemory(memory.id, patch);
      else await createMemory(olderAdultId, patch);
      onSaved();
      onClose();
    } catch {
      setError(t("adminForms.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (!memory) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMemory(memory.id);
      onSaved();
      onClose();
    } catch {
      setError(t("adminForms.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  function confirmDelete(): void {
    Alert.alert(t("adminForms.memory.deleteConfirmTitle"), t("adminForms.deleteUndone"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: remove },
    ]);
  }

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title={memory ? t("adminForms.memory.editTitle") : t("adminForms.memory.addTitle")}
      subtitle={t("adminForms.memory.subtitle")}
    >
      <Field label={t("adminForms.titleField")} value={title} onChangeText={setTitle} placeholder={t("adminForms.memory.titlePlaceholder")} autoCapitalize="sentences" error={error} />
      <Field label={t("adminForms.memory.story")} value={description} onChangeText={setDescription} placeholder={t("adminForms.memory.storyPlaceholder")} multiline />
      <Field label={t("adminForms.memory.when")} value={approximateDate} onChangeText={setApproximateDate} placeholder={t("adminForms.memory.whenPlaceholder")} autoCapitalize="none" />

      {people.length > 0 ? (
        <View style={styles.personSection}>
          <Text variant="caption" tone="textSecondary">
            {t("adminForms.memory.aboutWho")}
          </Text>
          <View style={styles.chipRow}>
            {people.map((p) => {
              const selected = personId === p.id;
              const name = p.preferred_name ?? p.full_name;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={name}
                  onPress={() => setPersonId(selected ? null : p.id)}
                  style={({ pressed }) => [styles.chip, selected ? styles.chipSelected : null, pressed ? styles.pressed : null]}
                >
                  <Text variant="bodyStrong" tone={selected ? "onPrimary" : "textSecondary"}>
                    {name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <Pressable accessibilityRole="switch" accessibilityState={{ checked: canMention }} accessibilityLabel={t("adminForms.memory.mentionToggle")} onPress={() => setCanMention((v) => !v)} style={styles.toggleRow}>
        <Icon name={canMention ? "check" : "add"} color={canMention ? "success" : "textTertiary"} />
        <Text variant="body">{t("adminForms.memory.mentionToggle")}</Text>
      </Pressable>

      <Stack gap="sm" style={styles.actions}>
        <Button label={memory ? t("common.saveChanges") : t("adminForms.memory.addButton")} icon="check" loading={saving} disabled={deleting} onPress={save} />
        <Button label={t("common.cancel")} variant="secondary" disabled={saving || deleting} onPress={onClose} />
        {memory ? (
          <Button label={t("adminForms.memory.deleteButton")} variant="danger" loading={deleting} disabled={saving} onPress={confirmDelete} />
        ) : null}
      </Stack>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  personSection: { gap: theme.spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  chip: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    minHeight: 44,
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: theme.colors.primary },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: 48, paddingVertical: theme.spacing.sm },
  actions: { marginTop: theme.spacing.sm },
  pressed: { opacity: 0.9 },
});
