// src/components/admin/AboutFormModal.tsx — edit the little details Nikki uses to greet warmly:
// preferred name, birthday, home address, and language. Birthday is free text (no date picker);
// we store an ISO date when we can read one; unreadable text shows an inline error instead of
// silently wiping the stored date. An empty field clears it.
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Stack, Text } from "../../primitives";
import BottomSheetModal from "../shared/BottomSheetModal";
import { updateOlderAdultProfile } from "../../services/profileService";
import { parseBirthday } from "../../utils/parseBirthday";
import type { OlderAdultProfile } from "../../types/database";

type Props = {
  visible: boolean;
  profile: OlderAdultProfile | null;
  onClose: () => void;
  onSaved: () => void;
};

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "nl", label: "Nederlands (u)" },
  { code: "nl-informal", label: "Nederlands (je)" },
] as const;

export default function AboutFormModal({ visible, profile, onClose, onSaved }: Props): React.ReactElement {
  const [preferredName, setPreferredName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  // Null until an explicit choice is made — the admin must pick the language Nikki speaks.
  const [language, setLanguage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [birthdayError, setBirthdayError] = useState<string | null>(null);
  const [languageError, setLanguageError] = useState<string | null>(null);

  // Prefill from the profile each time the sheet opens, so edits always start from what is saved.
  useEffect(() => {
    if (!visible) return;
    setPreferredName(profile?.preferred_name ?? "");
    setBirthday(profile?.date_of_birth ?? "");
    setHomeAddress(profile?.home_address ?? "");
    setLanguage(profile?.primary_language ?? null);
    setError(null);
    setBirthdayError(null);
    setLanguageError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function save(): Promise<void> {
    if (!profile) return;
    // The birthday is free text; never wipe a stored date because we could not read an edit.
    const dateOfBirth = parseBirthday(birthday);
    if (birthday.trim().length > 0 && dateOfBirth === null) {
      setBirthdayError("We could not read this date. Try e.g. 3 May 1942 or 1942-05-03.");
      return;
    }
    // Language drives both her app and Nikki's spoken language — it must be chosen.
    if (language === null) {
      setLanguageError("Please choose the language Nikki will speak.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateOlderAdultProfile(profile.id, {
        preferred_name: preferredName.trim() || null,
        date_of_birth: dateOfBirth,
        home_address: homeAddress.trim() || null,
        primary_language: language,
      });
      onSaved();
      onClose();
    } catch {
      setError("We could not save just now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const name = profile?.preferred_name ?? profile?.display_name ?? "them";

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title={`About ${name}`} subtitle="The little details that help Nikki greet your loved one warmly.">
      <Field label="What Nikki calls them" value={preferredName} onChangeText={setPreferredName} placeholder="e.g. Anna" autoCapitalize="words" error={error} />

      <Field
        label="Birthday"
        value={birthday}
        onChangeText={(text) => {
          setBirthday(text);
          setBirthdayError(null);
        }}
        placeholder="e.g. 3 May 1942"
        autoCapitalize="none"
        error={birthdayError}
      />

      <Stack gap="xs">
        <Field label="Home address" value={homeAddress} onChangeText={setHomeAddress} placeholder="e.g. Lindenstraat 12, Amsterdam" multiline />
        <Text variant="caption" tone="textSecondary" style={styles.helper}>
          Only used by the Help screen — Nikki never speaks the street address.
        </Text>
      </Stack>

      <Stack gap="xs">
        <Text variant="overline" tone="textSecondary" style={styles.helper}>
          LANGUAGE
        </Text>
        <View style={styles.chipRow}>
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = language === option.code;
            return (
              <Pressable
                key={option.code}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                onPress={() => {
                  setLanguage(option.code);
                  setLanguageError(null);
                }}
                style={({ pressed }) => [styles.chip, selected ? styles.chipSelected : null, pressed ? styles.pressed : null]}
              >
                <Text variant="bodyStrong" tone={selected ? "onPrimary" : "textSecondary"}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {languageError ? (
          <Text variant="caption" tone="danger" style={styles.helper}>
            {languageError}
          </Text>
        ) : null}
        <Text variant="caption" tone="textSecondary" style={styles.helper}>
          In Dutch, “u” is the gentle, formal way to say “you”; “je” is the familiar one. Pick whichever feels natural to them.
        </Text>
      </Stack>

      <Stack gap="sm" style={styles.actions}>
        <Button label="Save" icon="check" loading={saving} onPress={save} />
        <Button label="Cancel" variant="secondary" onPress={onClose} />
      </Stack>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  helper: { marginLeft: theme.spacing.xs },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  chip: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  actions: { marginTop: theme.spacing.sm },
  pressed: { opacity: 0.9 },
});
