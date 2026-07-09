// src/components/admin/PersonFormModal.tsx — add or edit a family person.
// Prefills on open (fast + correct for edit); the chosen photo shows immediately as a preview and
// uploads in the background so saving feels instant.
import React, { useEffect, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { theme } from "../../theme";
import { Button, Field, Icon, Stack, Text } from "../../primitives";
import { createPerson, updatePerson, uploadPersonPhoto } from "../../services/peopleService";
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
  const [relationship, setRelationship] = useState("");
  const [location, setLocation] = useState("");
  const [visit, setVisit] = useState("");
  const [hints, setHints] = useState("");
  const [phone, setPhone] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [canBeCalled, setCanBeCalled] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFullName(person?.full_name ?? "");
    setRelationship(person?.relationship_label ?? "");
    setLocation(person?.location_description ?? "");
    setVisit(person?.visit_frequency ?? "");
    setHints(person?.conversation_hints ?? "");
    setPhone(person?.phone ?? "");
    setEmergency(person?.can_contact_in_emergency ?? false);
    setCanBeCalled(person?.can_be_called_by_nikki ?? false);
    setPhotoUri(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
    setSaving(true);
    setError(null);
    try {
      const patch = {
        full_name: fullName.trim(),
        relationship_label: relationship.trim() || null,
        location_description: location.trim() || null,
        visit_frequency: visit.trim() || null,
        conversation_hints: hints.trim() || null,
        phone: phone.trim() || null,
        can_contact_in_emergency: emergency,
        can_nikki_mention: true,
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
            <Field label="Relationship" value={relationship} onChangeText={setRelationship} placeholder="e.g. Daughter" autoCapitalize="words" />
            <Field label="Hometown" value={location} onChangeText={setLocation} placeholder="e.g. Amsterdam" />
            <Field label="How often they visit" value={visit} onChangeText={setVisit} placeholder="e.g. Usually on Thursdays" />
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
