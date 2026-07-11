// src/components/admin/PersonFormModal.tsx — add or edit a family person.
// Prefills on open (fast + correct for edit); the chosen photo shows immediately as a preview and
// uploads in the background so saving feels instant. Editing also shows the Connections section
// (family_relationships); on create it appears once the person is saved.
import React, { useEffect, useState } from "react";
import { Alert, Image, Pressable, StyleSheet } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { theme } from "../../theme";
import { Button, Field, Icon, Stack, Text } from "../../primitives";
import BottomSheetModal from "../shared/BottomSheetModal";
import { createPerson, deletePerson, listPeople, updatePerson, uploadPersonPhoto } from "../../services/peopleService";
import { getOlderAdult } from "../../services/profileService";
import { parseBirthday } from "../../utils/parseBirthday";
import ConnectionsEditor from "./ConnectionsEditor";
import { useT } from "../../i18n";
import type { FamilyPerson } from "../../types/database";

type Props = {
  visible: boolean;
  olderAdultId: string;
  person?: FamilyPerson | null;
  initialPhotoUrl?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function PersonFormModal({ visible, olderAdultId, person, initialPhotoUrl, onClose, onSaved }: Props): React.ReactElement {
  const { t } = useT();
  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [pronunciation, setPronunciation] = useState("");
  const [birthday, setBirthday] = useState("");
  const [location, setLocation] = useState("");
  const [visit, setVisit] = useState("");
  const [notes, setNotes] = useState("");
  const [hints, setHints] = useState("");
  const [phone, setPhone] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [canBeCalled, setCanBeCalled] = useState(false);
  const [canMention, setCanMention] = useState(true);
  const [people, setPeople] = useState<FamilyPerson[]>([]);
  const [elderName, setElderName] = useState(t("adminForms.person.elderFallback"));
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [birthdayError, setBirthdayError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFullName(person?.full_name ?? "");
    setPreferredName(person?.preferred_name ?? "");
    setRelationship(person?.relationship_label ?? "");
    setPronunciation(person?.pronunciation_help ?? "");
    setBirthday(person?.date_of_birth ?? "");
    setLocation(person?.location_description ?? "");
    setVisit(person?.visit_frequency ?? "");
    setNotes(person?.important_notes ?? "");
    setHints(person?.conversation_hints ?? "");
    setPhone(person?.phone ?? "");
    setEmergency(person?.can_contact_in_emergency ?? false);
    setCanBeCalled(person?.can_be_called_by_nikki ?? false);
    setCanMention(person?.can_nikki_mention ?? true);
    setPhotoUri(null);
    setError(null);
    setBirthdayError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // The Connections editor needs everyone's names; load them only when editing (create has no id yet).
  useEffect(() => {
    if (!visible || !person) return;
    let cancelled = false;
    void listPeople(olderAdultId)
      .then((rows) => {
        if (!cancelled) setPeople(rows);
      })
      .catch(() => {
        // names fall back to "Someone" inside the editor
      });
    void getOlderAdult(olderAdultId)
      .then((oa) => {
        if (!cancelled && oa) setElderName(oa.preferred_name ?? oa.display_name);
      })
      .catch(() => {
        // keep the neutral fallback name
      });
    return () => {
      cancelled = true;
    };
  }, [visible, person, olderAdultId]);

  const previewUri = photoUri ?? initialPhotoUrl ?? null;

  async function pickPhoto(): Promise<void> {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  async function save(): Promise<void> {
    if (fullName.trim().length === 0) {
      setError(t("adminForms.person.nameRequired"));
      return;
    }
    // The birthday is free text; never wipe a stored date because we could not read an edit.
    const dateOfBirth = parseBirthday(birthday);
    if (birthday.trim().length > 0 && dateOfBirth === null) {
      setBirthdayError(t("adminForms.birthdayParseError"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patch = {
        full_name: fullName.trim(),
        preferred_name: preferredName.trim() || null,
        relationship_label: relationship.trim() || null,
        pronunciation_help: pronunciation.trim() || null,
        date_of_birth: dateOfBirth,
        location_description: location.trim() || null,
        visit_frequency: visit.trim() || null,
        important_notes: notes.trim() || null,
        conversation_hints: hints.trim() || null,
        phone: phone.trim() || null,
        can_contact_in_emergency: emergency,
        // Written from the toggle, never forced true: Nikki's never-raise list relies on it.
        can_nikki_mention: canMention,
        can_be_called_by_nikki: canBeCalled,
      };
      let personId = person?.id;
      if (person) {
        await updatePerson(person.id, patch);
      } else {
        const created = await createPerson(olderAdultId, patch);
        personId = created.id;
      }
      const localPhoto = photoUri;
      onSaved();
      onClose();
      // Upload the photo in the background so saving feels instant; refresh again when it lands.
      if (localPhoto && personId) {
        void uploadPersonPhoto(olderAdultId, personId, localPhoto).then((ok) => {
          if (ok) onSaved();
        });
      }
    } catch (e) {
      // Dev builds show the underlying cause — a swallowed RLS/foreign-key message cost
      // us a debugging session once; release keeps the warm copy.
      const detail = __DEV__ && e instanceof Error ? ` (${e.message})` : "";
      setError(`${t("adminForms.saveFailed")}${detail}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (!person) return;
    setDeleting(true);
    setError(null);
    try {
      await deletePerson(person.id);
      onSaved();
      onClose();
    } catch {
      setError(t("adminForms.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  function confirmDelete(): void {
    Alert.alert(
      t("adminForms.person.deleteConfirmTitle"),
      t("adminForms.person.deleteConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: remove },
      ],
    );
  }

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title={person ? t("adminForms.person.editTitle") : t("adminForms.person.addTitle")}
      subtitle={t("adminForms.person.subtitle")}
    >
      {previewUri ? <Image source={{ uri: previewUri }} style={styles.photoPreview} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={previewUri ? t("adminForms.person.changePhoto") : t("adminForms.person.addPhoto")} onPress={pickPhoto} style={({ pressed }) => [styles.photoBtn, pressed ? styles.pressed : null]}>
        <Icon name="camera" color="primary" size={theme.iconSize.lg} />
        <Text variant="bodyStrong" tone="primary">
          {previewUri ? t("adminForms.person.changePhoto") : t("adminForms.person.addPhoto")}
        </Text>
      </Pressable>

      <Field label={t("adminForms.person.fullName")} value={fullName} onChangeText={setFullName} placeholder={t("adminForms.person.fullNamePlaceholder")} autoCapitalize="words" error={error} />
      <Field label={t("adminForms.person.calledName")} value={preferredName} onChangeText={setPreferredName} placeholder={t("adminForms.person.calledNamePlaceholder")} autoCapitalize="words" />
      <Field label={t("adminForms.person.relationship")} value={relationship} onChangeText={setRelationship} placeholder={t("adminForms.person.relationshipPlaceholder")} autoCapitalize="words" />
      <Field label={t("adminForms.person.pronunciation")} value={pronunciation} onChangeText={setPronunciation} placeholder={t("adminForms.person.pronunciationPlaceholder")} autoCapitalize="none" />
      <Field
        label={t("adminForms.person.birthday")}
        value={birthday}
        onChangeText={(text) => {
          setBirthday(text);
          setBirthdayError(null);
        }}
        placeholder={t("adminForms.person.birthdayPlaceholder")}
        autoCapitalize="none"
        error={birthdayError}
      />
      <Field label={t("adminForms.person.hometown")} value={location} onChangeText={setLocation} placeholder={t("adminForms.person.hometownPlaceholder")} />
      <Field label={t("adminForms.person.visit")} value={visit} onChangeText={setVisit} placeholder={t("adminForms.person.visitPlaceholder")} />
      <Field label={t("adminForms.person.notes")} value={notes} onChangeText={setNotes} placeholder={t("adminForms.person.notesPlaceholder")} multiline />
      <Field label={t("adminForms.person.hints")} value={hints} onChangeText={setHints} placeholder={t("adminForms.person.hintsPlaceholder")} multiline />
      <Field label={t("adminForms.person.phone")} value={phone} onChangeText={setPhone} placeholder={t("common.optional")} keyboardType="phone-pad" autoCapitalize="none" />

      <Pressable accessibilityRole="switch" accessibilityState={{ checked: emergency }} accessibilityLabel={t("adminForms.person.emergencyToggle")} onPress={() => setEmergency((e) => !e)} style={styles.toggleRow}>
        <Icon name={emergency ? "check" : "add"} color={emergency ? "success" : "textTertiary"} />
        <Text variant="body">{t("adminForms.person.emergencyToggle")}</Text>
      </Pressable>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: canBeCalled }} accessibilityLabel={t("adminForms.person.canBeCalledToggle")} onPress={() => setCanBeCalled((v) => !v)} style={styles.toggleRow}>
        <Icon name={canBeCalled ? "check" : "add"} color={canBeCalled ? "success" : "textTertiary"} />
        <Text variant="body">{t("adminForms.person.canBeCalledToggle")}</Text>
      </Pressable>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: canMention }} accessibilityLabel={t("adminForms.person.canMentionToggle")} onPress={() => setCanMention((v) => !v)} style={styles.toggleRow}>
        <Icon name={canMention ? "check" : "add"} color={canMention ? "success" : "textTertiary"} />
        <Text variant="body">{t("adminForms.person.canMentionToggle")}</Text>
      </Pressable>

      {person ? (
        <ConnectionsEditor
          olderAdultId={olderAdultId}
          olderAdultName={elderName}
          personId={person.id}
          people={people}
          relationshipLabel={relationship}
          onRelationshipLabelChange={(label) => setRelationship(label ?? "")}
        />
      ) : (
        <Text variant="caption" tone="textTertiary">
          {t("adminForms.person.saveFirst")}
        </Text>
      )}

      <Stack gap="sm" style={styles.actions}>
        <Button label={person ? t("common.saveChanges") : t("adminForms.person.addButton")} icon="check" loading={saving} disabled={deleting} onPress={save} />
        <Button label={t("common.cancel")} variant="secondary" disabled={saving || deleting} onPress={onClose} />
        {person ? (
          <Button label={t("adminForms.person.deleteButton")} variant="danger" loading={deleting} disabled={saving} onPress={confirmDelete} />
        ) : null}
      </Stack>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  photoPreview: { width: 104, height: 104, borderRadius: theme.radius.pill, alignSelf: "center", backgroundColor: theme.colors.surfaceAlt },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    justifyContent: "center",
  },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: 48, paddingVertical: theme.spacing.sm },
  actions: { marginTop: theme.spacing.sm },
  pressed: { opacity: 0.9 },
});
