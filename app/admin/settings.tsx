// app/admin/settings.tsx — about the elder, dignified location sharing, family invites, and
// sign out.
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Card, Icon, Screen, Stack, Text } from "../../src/primitives";
import { useT } from "../../src/i18n";
import type { Lang } from "../../src/i18n";
import PairingCode from "../../src/components/shared/PairingCode";
import AboutFormModal from "../../src/components/admin/AboutFormModal";
import SupportNotesSection from "../../src/components/admin/SupportNotesSection";
import { SetupMark } from "../../src/components/admin/SectionHeader";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { getOlderAdult } from "../../src/services/profileService";
import type { OlderAdultProfile } from "../../src/types/database";

const LANGUAGE_OPTIONS: Lang[] = ["en", "nl"];

export default function AdminSettings(): React.ReactElement {
  const { olderAdultId, joinCode, signOut } = useAppState();
  const { t, lang, setAppLanguage } = useT();
  const id = olderAdultId ?? "";
  const router = useRouter();
  const [editingAbout, setEditingAbout] = useState(false);

  const { state: profileState, reload: reloadProfile } = useAsync<OlderAdultProfile | null>(() => getOlderAdult(id), [id]);
  const profile = profileState.status === "loaded" ? profileState.data : null;
  const elderName = profile?.preferred_name ?? profile?.display_name ?? t("settings.elderFallback");

  // Refetch on focus and on live changes; stale-while-refresh keeps it flicker-free.
  useFocusEffect(
    useCallback(() => {
      reloadProfile();
    }, [reloadProfile]),
  );
  useEffect(() => {
    if (!id) return;
    return subscribeLive(id, () => reloadProfile());
  }, [id, reloadProfile]);

  async function doSignOut(): Promise<void> {
    await signOut();
    router.replace("/");
  }

  return (
    <Screen scroll>
      <AppBar title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <Stack gap="lg">
        <InfoCard
          icon="heart"
          title={t("settings.about.title", { name: elderName })}
          body={t("settings.about.body")}
          actionLabel={t("settings.about.action")}
          onAction={() => setEditingAbout(true)}
        />

        {id ? <SupportNotesSection olderAdultId={id} elderName={elderName} /> : null}

        <Card elevation="card">
          <Stack gap="md">
            <Stack direction="row" gap="md" align="center">
              <Icon name="people" color="primary" size={theme.iconSize.lg} />
              <Stack flex gap="xs">
                <Text variant="heading">{t("settings.familyCode.title")}</Text>
                <Text variant="body" tone="textSecondary">{t("settings.familyCode.body")}</Text>
              </Stack>
            </Stack>
            {joinCode ? <PairingCode code={joinCode} /> : null}
          </Stack>
        </Card>

        <Card elevation="card">
          <Stack gap="md">
            <Text variant="heading">{t("settings.language.title")}</Text>
            <View style={styles.langRow}>
              {LANGUAGE_OPTIONS.map((option) => {
                const selected = lang === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t(`settings.language.${option}`)}
                    onPress={() => void setAppLanguage(option)}
                    style={({ pressed }) => [styles.langChip, selected ? styles.langChipSelected : null, pressed ? styles.pressed : null]}
                  >
                    <Text variant="bodyStrong" tone={selected ? "onPrimary" : "textSecondary"}>
                      {t(`settings.language.${option}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Stack>
        </Card>

        <View style={styles.signOut}>
          <Button label={t("settings.signOut")} variant="secondary" onPress={doSignOut} />
        </View>
      </Stack>

      <AboutFormModal
        visible={editingAbout}
        profile={profile}
        onClose={() => setEditingAbout(false)}
        onSaved={reloadProfile}
      />
    </Screen>
  );
}

function InfoCard({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  needsSetup,
  needsSetupLabel,
}: {
  icon: "heart" | "location";
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  needsSetup?: boolean;
  needsSetupLabel?: string;
}): React.ReactElement {
  return (
    <Card elevation="card" style={needsSetup ? styles.missing : undefined}>
      <Stack gap="md">
        <Stack direction="row" gap="md" align="center">
          <Icon name={icon} color="primary" size={theme.iconSize.lg} />
          <Stack flex gap="xs">
            <Stack direction="row" gap="sm" align="center">
              <Text variant="heading">{title}</Text>
              {needsSetup ? <SetupMark label={needsSetupLabel} /> : null}
            </Stack>
            <Text variant="body" tone="textSecondary">
              {body}
            </Text>
          </Stack>
        </Stack>
        {actionLabel && onAction ? <Button label={actionLabel} variant="secondary" onPress={onAction} /> : null}
      </Stack>
    </Card>
  );
}

const styles = StyleSheet.create({
  missing: { borderWidth: 2, borderColor: theme.colors.accent },
  signOut: { marginTop: theme.spacing.md },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  langChip: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    minHeight: 44,
    justifyContent: "center",
  },
  langChipSelected: { backgroundColor: theme.colors.primary },
  pressed: { opacity: 0.9 },
});
