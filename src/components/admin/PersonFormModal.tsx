// src/components/admin/PersonFormModal.tsx — add or edit a family person.
// Prefills on open (fast + correct for edit); the chosen photo shows immediately as a preview and
// uploads in the background so saving feels instant. Editing also shows the Connections section
// (family_relationships); on create it appears once the person is saved.
import React, { useEffect, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { theme } from "../../theme";
import { Button, Field, Icon, Stack, Text } from "../../primitives";
import { createPerson, listPeople, updatePerson, uploadPersonPhoto } from "../../services/peopleService";
import { getOlderAdult } from "../../services/profileService";
import { parseBirthday } from "../../utils/parseBirthday";
import ConnectionsEditor from "./ConnectionsEditor";
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
  const [elderName, setElderName] = useState("the person Nikki helps");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
      setError("Please enter a name.");
      return;
    }
    // The birthday is free text; never wipe a stored date because we could not read an edit.
    const dateOfBirth = parseBirthday(birthday);
    if (birthday.trim().length > 0 && dateOfBirth === null) {
      setBirthdayError("We could not read this date. Try e.g. 3 May 1952 or 1952-05-03.");
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
      setError(`We could not save just now. Please try again.${detail}`);
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
            <Text variant="title">{person ? "Edit person" : "Add a person"}</Text>
            <Text variant="body" tone="textSecondary">
              Tell Nikki who this is so they can help your loved one remember.
            </Text>

            {previewUri ? <Image source={{ uri: previewUri }} style={styles.photoPreview} /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={previewUri ? "Change photo" : "Add a photo"} onPress={pickPhoto} style={({ pressed }) => [styles.photoBtn, pressed ? styles.pressed : null]}>
              <Icon name="camera" color="primary" size={theme.iconSize.lg} />
              <Text variant="bodyStrong" tone="primary">
                {previewUri ? "Change photo" : "Add a photo"}
              </Text>
            </Pressable>

            <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="e.g. Sophie de Vries" autoCapitalize="words" error={error} />
            <Field label="What Nikki calls them" value={preferredName} onChangeText={setPreferredName} placeholder="e.g. Sophie" autoCapitalize="words" />
            <Field label="Relationship" value={relationship} onChangeText={setRelationship} placeholder="e.g. Daughter" autoCapitalize="words" />
            <Field label="How to say their name" value={pronunciation} onChangeText={setPronunciation} placeholder="e.g. so-FEE" autoCapitalize="none" />
            <Field
              label="Birthday"
              value={birthday}
              onChangeText={(text) => {
                setBirthday(text);
                setBirthdayError(null);
              }}
              placeholder="e.g. 3 May 1952 or 1952-05-03"
              autoCapitalize="none"
              error={birthdayError}
            />
            <Field label="Hometown" value={location} onChangeText={setLocation} placeholder="e.g. Amsterdam" />
            <Field label="How often they visit" value={visit} onChangeText={setVisit} placeholder="e.g. Usually on Thursdays" />
            <Field label="Important notes" value={notes} onChangeText={setNotes} placeholder="e.g. Brings fresh flowers and stays for lunch" multiline />
            <Field label="Conversation hints for Nikki" value={hints} onChangeText={setHints} placeholder="e.g. Loves to hear about the garden" multiline />
            <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="Optional" keyboardType="phone-pad" autoCapitalize="none" />

            <Pressable accessibilityRole="switch" accessibilityState={{ checked: emergency }} accessibilityLabel="Can be contacted in an emergency" onPress={() => setEmergency((e) => !e)} style={styles.toggleRow}>
              <Icon name={emergency ? "check" : "add"} color={emergency ? "success" : "textTertiary"} />
              <Text variant="body">Can be contacted in an emergency</Text>
            </Pressable>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: canBeCalled }} accessibilityLabel="This person may be called by Nikki" onPress={() => setCanBeCalled((v) => !v)} style={styles.toggleRow}>
              <Icon name={canBeCalled ? "check" : "add"} color={canBeCalled ? "success" : "textTertiary"} />
              <Text variant="body">This person may be called by Nikki</Text>
            </Pressable>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: canMention }} accessibilityLabel="Nikki may talk about this person" onPress={() => setCanMention((v) => !v)} style={styles.toggleRow}>
              <Icon name={canMention ? "check" : "add"} color={canMention ? "success" : "textTertiary"} />
              <Text variant="body">Nikki may talk about this person</Text>
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
                Save first to add connections.
              </Text>
            )}

            <Stack gap="sm" style={styles.actions}>
              <Button label={person ? "Save changes" : "Add person"} icon="check" loading={saving} onPress={save} />
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
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    maxHeight: "92%",
    paddingTop: theme.spacing.md,
  },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.border, marginBottom: theme.spacing.sm },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
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
