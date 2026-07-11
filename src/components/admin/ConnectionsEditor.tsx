// src/components/admin/ConnectionsEditor.tsx — view, add and remove one person's connections
// to the other people around the same older adult (family_relationships, D5 vocabulary).
// Direction convention: a stored row reads "person_a is <type> person_b" (Tom child_of Mark;
// Els carer_of Anna = Els cares for Anna). The chips read from the edited person's perspective,
// so "cared for by" saves the OTHER person as person_a (the carer). Each pick saves immediately.
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Icon, Text } from "../../primitives";
import { useT } from "../../i18n";
import { RELATIONSHIP_TYPES, createRelationship, deleteRelationship, listRelationships, updatePerson } from "../../services/peopleService";
import type { RelationshipType } from "../../services/peopleService";
import type { FamilyPerson, FamilyRelationship } from "../../types/database";

type Props = {
  olderAdultId: string;
  olderAdultName: string;
  personId: string;
  people: FamilyPerson[];
  // The person's relationship TO the older adult lives in relationship_label (the elder is
  // not a family_people row, so it can't be a family_relationships edge). Choosing the elder
  // as a connection target writes this instead — kept in sync with the form's field.
  relationshipLabel: string;
  onRelationshipLabelChange: (label: string | null) => void;
};

// One chip per D5 type, phrased as "{edited person} is <label> {picked person}".
// editedIs says which side of the stored row the edited person takes.
type ChipOption = { labelKey: string; type: RelationshipType; editedIs: "a" | "b" };

const CHIP_OPTIONS: ChipOption[] = [
  { labelKey: "connections.chip.child_of", type: "child_of", editedIs: "a" },
  { labelKey: "connections.chip.carer_of", type: "carer_of", editedIs: "b" },
  { labelKey: "connections.chip.spouse_of", type: "spouse_of", editedIs: "a" },
  { labelKey: "connections.chip.sibling_of", type: "sibling_of", editedIs: "a" },
  { labelKey: "connections.chip.friend_of", type: "friend_of", editedIs: "a" },
  { labelKey: "connections.chip.neighbour_of", type: "neighbour_of", editedIs: "a" },
];

// When the connection target is the older adult, the D5 type becomes the person's
// relationship_label (their relation TO the elder), e.g. friend_of → "friend".
const ELDER_LABEL: Record<RelationshipType, string> = {
  child_of: "child",
  carer_of: "carer",
  spouse_of: "spouse",
  sibling_of: "sibling",
  friend_of: "friend",
  neighbour_of: "neighbour",
};

export default function ConnectionsEditor({
  olderAdultId,
  olderAdultName,
  personId,
  people,
  relationshipLabel,
  onRelationshipLabelChange,
}: Props): React.ReactElement {
  const { t } = useT();
  const [connections, setConnections] = useState<FamilyRelationship[]>([]);
  const [pending, setPending] = useState<ChipOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await listRelationships(olderAdultId);
      setConnections(all.filter((r) => r.person_a_id === personId || r.person_b_id === personId));
    } catch {
      // keep whatever we had; the next successful load repaints
    }
  }, [olderAdultId, personId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = useCallback(
    (id: string): string => {
      const p = people.find((x) => x.id === id);
      return p ? (p.preferred_name ?? p.full_name) : t("connections.someone");
    },
    [people, t],
  );

  const editedName = nameOf(personId);
  const others = people.filter((p) => p.id !== personId);

  // "Tom — child of Marieke" style: the other person's name, then how the two relate.
  function describe(rel: FamilyRelationship): string {
    const editedIsA = rel.person_a_id === personId;
    const other = nameOf(editedIsA ? rel.person_b_id : rel.person_a_id);
    const params = { other, name: editedName };
    switch (rel.relationship_type) {
      case "child_of":
        return editedIsA ? t("connections.describe.parentOf", params) : t("connections.describe.childOf", params);
      case "carer_of":
        return editedIsA ? t("connections.describe.caredForBy", params) : t("connections.describe.caresFor", params);
      case "spouse_of":
        return t("connections.describe.spouseOf", params);
      case "sibling_of":
        return t("connections.describe.siblingOf", params);
      case "friend_of":
        return t("connections.describe.friendOf", params);
      case "neighbour_of":
        return t("connections.describe.neighbourOf", params);
      default:
        return t("connections.describe.connectedTo", params);
    }
  }

  // Connecting the person to the OLDER ADULT: store it as their relationship_label
  // (immediate save, like every other action here), and sync the form's field.
  async function addToElder(): Promise<void> {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const label = ELDER_LABEL[pending.type];
      await updatePerson(personId, { relationship_label: label });
      onRelationshipLabelChange(label);
      setPending(null);
    } catch {
      setError(t("connections.errSave"));
    } finally {
      setBusy(false);
    }
  }

  async function clearElder(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await updatePerson(personId, { relationship_label: null });
      onRelationshipLabelChange(null);
    } catch {
      setError(t("connections.errRemove"));
    } finally {
      setBusy(false);
    }
  }

  async function add(other: FamilyPerson): Promise<void> {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const a = pending.editedIs === "a" ? personId : other.id;
      const b = pending.editedIs === "a" ? other.id : personId;
      // createRelationship stores symmetric pairs with ids ascending, so compare the same
      // canonical ordering here; directional edges compare exactly a→b.
      const symmetric = (RELATIONSHIP_TYPES.symmetric as readonly string[]).includes(pending.type);
      const [wantA, wantB] = symmetric && b < a ? [b, a] : [a, b];
      const exists = connections.some(
        (r) => r.relationship_type === pending.type && r.person_a_id === wantA && r.person_b_id === wantB,
      );
      if (exists) {
        setNotice(t("connections.alreadyConnected"));
        setPending(null);
        return;
      }
      await createRelationship(olderAdultId, a, b, pending.type);
      setPending(null);
      await load();
    } catch {
      setError(t("connections.errSave"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(rel: FamilyRelationship): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await deleteRelationship(rel.id);
      await load();
    } catch {
      setError(t("connections.errRemove"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text variant="overline" tone="textSecondary" style={styles.label}>
        {t("connections.title")}
      </Text>

      {connections.length === 0 && !relationshipLabel ? (
        <Text variant="caption" tone="textTertiary">
          {t("connections.empty", { name: editedName, elder: olderAdultName })}
        </Text>
      ) : null}

      {relationshipLabel ? (
        <View style={styles.row}>
          <Text variant="body" style={styles.rowLabel}>
            {t("connections.elderRow", { elder: olderAdultName, label: relationshipLabel, name: editedName })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("connections.removeElderA11y", { name: editedName, elder: olderAdultName, label: relationshipLabel })}
            onPress={() => void clearElder()}
            hitSlop={10}
            style={({ pressed }) => [pressed ? styles.pressed : null]}
          >
            <Icon name="close" color="textTertiary" size={theme.iconSize.sm} />
          </Pressable>
        </View>
      ) : null}

      {connections.map((rel) => (
        <View key={rel.id} style={styles.row}>
          <Text variant="body" style={styles.rowLabel}>
            {describe(rel)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("connections.removeA11y", { desc: describe(rel) })}
            onPress={() => void remove(rel)}
            hitSlop={10}
            style={({ pressed }) => [pressed ? styles.pressed : null]}
          >
            <Icon name="close" color="textTertiary" size={theme.iconSize.sm} />
          </Pressable>
        </View>
      ))}

      <Text variant="caption" tone="textSecondary">
        {pending
          ? t("connections.isDoing", { name: editedName, label: t(pending.labelKey) })
          : t("connections.addPrompt", { name: editedName })}
      </Text>
      {pending == null ? (
        <View style={styles.chipRow}>
          {CHIP_OPTIONS.map((opt) => (
            <Pressable
              key={opt.type}
              accessibilityRole="button"
              accessibilityLabel={t(opt.labelKey)}
              onPress={() => setPending(opt)}
              style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}
            >
              <Text variant="bodyStrong" tone="textSecondary">
                {t(opt.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.chipRow}>
          {/* The older adult is always a valid target — this is the "friend of {elder}" case. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("connections.elderA11y", { elder: olderAdultName })}
            onPress={() => void addToElder()}
            style={({ pressed }) => [styles.chip, styles.chipElder, pressed ? styles.pressed : null]}
          >
            <Text variant="bodyStrong" tone="onPrimary">
              {t("connections.elderChip", { elder: olderAdultName })}
            </Text>
          </Pressable>
          {others.map((p) => {
            const name = p.preferred_name ?? p.full_name;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={name}
                onPress={() => void add(p)}
                style={({ pressed }) => [styles.chip, styles.chipPerson, pressed ? styles.pressed : null]}
              >
                <Text variant="bodyStrong" tone="onPrimary">
                  {name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("connections.neverMindA11y")}
            onPress={() => setPending(null)}
            style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}
          >
            <Text variant="bodyStrong" tone="textSecondary">
              {t("connections.neverMind")}
            </Text>
          </Pressable>
        </View>
      )}

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}

      {notice ? (
        <Text variant="caption" tone="textTertiary">
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  label: { marginLeft: theme.spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    minHeight: 48,
  },
  rowLabel: { flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  chip: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    minHeight: 44,
    justifyContent: "center",
  },
  chipPerson: { backgroundColor: theme.colors.primary },
  chipElder: { backgroundColor: theme.colors.accent },
  pressed: { opacity: 0.9 },
});
