// src/components/admin/MemoryFormModal.tsx — add a life memory Nikki can gently bring up.
// "Roughly when" is deliberately free text ('the 1970s', 'her wedding day') — memories rarely
// have exact dates. The person link is an optional single-select chip row (tap again to unselect).
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Icon, Stack, Text } from "../../primitives";
import { createMemory } from "../../services/memoryService";
import type { FamilyPerson } from "../../types/database";

type Props = {
  visible: boolean;
  olderAdultId: string;
  people: FamilyPerson[];
  onClose: () => void;
  onSaved: () => void;
};

export default function MemoryFormModal({ visible, olderAdultId, people, onClose, onSaved }: Props): React.ReactElement {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [approximateDate, setApproximateDate] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [canMention, setCanMention] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to a blank form each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setTitle("");
    setDescription("");
    setApproximateDate("");
    setPersonId(null);
    setCanMention(true);
    setError(null);
  }, [visible]);

  async function save(): Promise<void> {
    if (title.trim().length === 0) {
      setError("Please give the memory a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createMemory(olderAdultId, {
        person_id: personId,
        title: title.trim(),
        description: description.trim() || null,
        approximate_date: approximateDate.trim() || null,
        can_nikki_mention: canMention,
      });
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
            <Text variant="title">Add a memory</Text>
            <Text variant="body" tone="textSecondary">
              A cherished story Nikki can bring up in conversation.
            </Text>

            <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. The bakery in Jordaan" autoCapitalize="sentences" error={error} />
            <Field label="The story" value={description} onChangeText={setDescription} placeholder="What happened, and why it matters" multiline />
            <Field label="Roughly when" value={approximateDate} onChangeText={setApproximateDate} placeholder="e.g. the 1970s, or her wedding day" autoCapitalize="none" />

            {people.length > 0 ? (
              <View style={styles.personSection}>
                <Text variant="caption" tone="textSecondary">
                  Who this memory is about (optional)
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

            <Pressable accessibilityRole="switch" accessibilityState={{ checked: canMention }} accessibilityLabel="Nikki may bring this up" onPress={() => setCanMention((v) => !v)} style={styles.toggleRow}>
              <Icon name={canMention ? "check" : "add"} color={canMention ? "success" : "textTertiary"} />
              <Text variant="body">Nikki may bring this up</Text>
            </Pressable>

            <Stack gap="sm" style={styles.actions}>
              <Button label="Save memory" icon="check" loading={saving} onPress={save} />
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
