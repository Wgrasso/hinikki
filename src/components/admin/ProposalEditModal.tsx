// src/components/admin/ProposalEditModal.tsx — check & edit a Nikki proposal before adding it.
// A generic payload editor (plan §4.3): every string in the payload becomes a Field, booleans
// become the house check-row, anything else shows read-only. Save runs the same guarded
// apply path as a plain approve, just with the corrected values (edit-then-approve, FR-7).
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Icon, Stack, Text } from "../../primitives";
import { approveAndApply } from "../../services/proposalService";
import type { NikkiProposal } from "../../types/database";

type Props = {
  visible: boolean;
  proposal: NikkiProposal | null;
  onClose: () => void;
  onChanged: () => void;
};

// Friendly labels for the keys Nikki commonly proposes; anything unknown is humanized.
const KEY_LABELS: Record<string, string> = {
  full_name: "Name",
  preferred_name: "Goes by",
  relationship_label: "Relationship",
  date_of_birth: "Birthday",
  pronunciation_help: "How to say their name",
  location_description: "Where they live",
  visit_frequency: "How often they visit",
  important_notes: "Good to know",
  conversation_hints: "Things to talk about",
  approximate_date: "Roughly when",
  home_address: "Home address",
  primary_language: "Language",
  location_name: "Where",
  what_to_bring: "What to bring",
  transport_notes: "Getting there",
  nikki_message: "What Nikki says",
  can_nikki_mention: "Nikki may bring this up",
  requires_confirmation: "Ask them to confirm",
};

export function humanizeKey(key: string): string {
  const known = KEY_LABELS[key];
  if (known) return known;
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function ProposalEditModal({ visible, proposal, onClose, onChanged }: Props): React.ReactElement {
  const [values, setValues] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the editable fields from the payload each time the sheet opens.
  useEffect(() => {
    if (!visible || !proposal) return;
    const strings: Record<string, string> = {};
    const booleans: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(proposal.payload ?? {})) {
      if (typeof value === "string") strings[key] = value;
      else if (typeof value === "boolean") booleans[key] = value;
    }
    setValues(strings);
    setFlags(booleans);
    setError(null);
  }, [visible, proposal]);

  const readOnly = Object.entries(proposal?.payload ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && typeof value !== "string" && typeof value !== "boolean",
  );

  async function save(): Promise<void> {
    if (!proposal) return;
    setSaving(true);
    setError(null);
    const edited: Record<string, unknown> = { ...proposal.payload };
    for (const [key, value] of Object.entries(values)) edited[key] = value.trim();
    for (const [key, value] of Object.entries(flags)) edited[key] = value;
    const result = await approveAndApply(proposal, edited);
    setSaving(false);
    if (!result.ok) {
      setError(`We could not add this — ${result.error ?? "please try again"}.`);
      return;
    }
    onChanged();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text variant="title">Check & edit</Text>
            <Text variant="body" tone="textSecondary">
              Fix anything Nikki misheard, then add it.
            </Text>
            {proposal?.source_quote ? (
              <Text variant="caption" tone="textSecondary" style={styles.quote}>
                {`“${proposal.source_quote}”`}
              </Text>
            ) : null}

            {Object.keys(values).map((key) => (
              <Field
                key={key}
                label={humanizeKey(key)}
                value={values[key]}
                onChangeText={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
                autoCapitalize="sentences"
              />
            ))}

            {Object.keys(flags).map((key) => (
              <Pressable
                key={key}
                accessibilityRole="switch"
                accessibilityState={{ checked: flags[key] }}
                accessibilityLabel={humanizeKey(key)}
                onPress={() => setFlags((prev) => ({ ...prev, [key]: !prev[key] }))}
                style={styles.toggleRow}
              >
                <Icon name={flags[key] ? "check" : "add"} color={flags[key] ? "success" : "textTertiary"} />
                <Text variant="body">{humanizeKey(key)}</Text>
              </Pressable>
            ))}

            {readOnly.map(([key, value]) => (
              <View key={key} style={styles.readOnlyRow}>
                <Text variant="overline" tone="textSecondary">
                  {humanizeKey(key).toUpperCase()}
                </Text>
                <Text variant="body" tone="textSecondary">
                  {typeof value === "number" ? String(value) : JSON.stringify(value)}
                </Text>
              </View>
            ))}

            {error ? (
              <Text variant="caption" tone="danger">
                {error}
              </Text>
            ) : null}

            <Stack gap="sm" style={styles.actions}>
              <Button label="Add this" icon="check" loading={saving} onPress={() => void save()} />
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
  quote: { fontStyle: "italic" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: 48, paddingVertical: theme.spacing.sm },
  readOnlyRow: { gap: theme.spacing.xs },
  actions: { marginTop: theme.spacing.sm },
});
