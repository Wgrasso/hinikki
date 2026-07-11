// src/components/admin/ProposalEditModal.tsx — check & edit a Nikki proposal before adding it.
// A generic payload editor (plan §4.3): every string in the payload becomes a Field, booleans
// become the house check-row, anything else shows read-only. Save runs the same guarded
// apply path as a plain approve, just with the corrected values (edit-then-approve, FR-7).
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Icon, Stack, Text } from "../../primitives";
import { useT } from "../../i18n";
import BottomSheetModal from "../shared/BottomSheetModal";
import { approveAndApply } from "../../services/proposalService";
import type { NikkiProposal } from "../../types/database";

type Props = {
  visible: boolean;
  proposal: NikkiProposal | null;
  onClose: () => void;
  onChanged: () => void;
};

type TFn = (key: string, params?: Record<string, string | number>) => string;

// The keys Nikki commonly proposes have friendly labels in the dict; anything unknown is humanized.
const KNOWN_KEYS = new Set([
  "full_name",
  "preferred_name",
  "relationship_label",
  "date_of_birth",
  "pronunciation_help",
  "location_description",
  "visit_frequency",
  "important_notes",
  "conversation_hints",
  "approximate_date",
  "home_address",
  "primary_language",
  "location_name",
  "what_to_bring",
  "transport_notes",
  "nikki_message",
  "can_nikki_mention",
  "requires_confirmation",
]);

export function humanizeKey(key: string, t: TFn): string {
  if (KNOWN_KEYS.has(key)) return t(`review.field.${key}`);
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function ProposalEditModal({ visible, proposal, onClose, onChanged }: Props): React.ReactElement {
  const { t } = useT();
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
      setError(t("review.error.couldNotAdd", { error: result.error ?? t("review.error.pleaseTryAgain") }));
      return;
    }
    onChanged();
    onClose();
  }

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title={t("review.checkEdit")} subtitle={t("review.editSubtitle")}>
      {proposal?.source_quote ? (
        <Text variant="caption" tone="textSecondary" style={styles.quote}>
          {`“${proposal.source_quote}”`}
        </Text>
      ) : null}

      {Object.keys(values).map((key) => (
        <Field
          key={key}
          label={humanizeKey(key, t)}
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
          accessibilityLabel={humanizeKey(key, t)}
          onPress={() => setFlags((prev) => ({ ...prev, [key]: !prev[key] }))}
          style={styles.toggleRow}
        >
          <Icon name={flags[key] ? "check" : "add"} color={flags[key] ? "success" : "textTertiary"} />
          <Text variant="body">{humanizeKey(key, t)}</Text>
        </Pressable>
      ))}

      {readOnly.map(([key, value]) => (
        <View key={key} style={styles.readOnlyRow}>
          <Text variant="overline" tone="textSecondary">
            {humanizeKey(key, t).toUpperCase()}
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
        <Button label={t("review.addThis")} icon="check" loading={saving} onPress={() => void save()} />
        <Button label={t("common.cancel")} variant="secondary" onPress={onClose} />
      </Stack>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  quote: { fontStyle: "italic" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: 48, paddingVertical: theme.spacing.sm },
  readOnlyRow: { gap: theme.spacing.xs },
  actions: { marginTop: theme.spacing.sm },
});
