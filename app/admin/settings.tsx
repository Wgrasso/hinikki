// app/admin/settings.tsx — about the elder, dignified location sharing, family invites, and
// sign out.
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Card, Icon, Screen, Stack, Text } from "../../src/primitives";
import PairingCode from "../../src/components/shared/PairingCode";
import AboutFormModal from "../../src/components/admin/AboutFormModal";
import SupportNotesSection from "../../src/components/admin/SupportNotesSection";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { getOlderAdult } from "../../src/services/profileService";
import { FEATURE_HELP_TAB } from "../../src/lib/constants";
import type { OlderAdultProfile } from "../../src/types/database";

export default function AdminSettings(): React.ReactElement {
  const { olderAdultId, joinCode, signOut } = useAppState();
  const id = olderAdultId ?? "";
  const router = useRouter();
  const [editingAbout, setEditingAbout] = useState(false);

  const { state: profileState, reload: reloadProfile } = useAsync<OlderAdultProfile | null>(() => getOlderAdult(id), [id]);
  const profile = profileState.status === "loaded" ? profileState.data : null;
  const elderName = profile?.preferred_name ?? profile?.display_name ?? "your loved one";

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
      <AppBar title="Settings" subtitle="Fine-tune how Nikki helps." onRefresh={reloadProfile} />
      <Stack gap="lg">
        <InfoCard
          icon="heart"
          title={`About ${elderName}`}
          body="Their name, birthday, home address, and language — the little details that help Nikki greet them warmly."
          actionLabel="Edit details"
          onAction={() => setEditingAbout(true)}
        />

        {id ? <SupportNotesSection olderAdultId={id} elderName={elderName} /> : null}

        {FEATURE_HELP_TAB ? (
          <InfoCard
            icon="location"
            title="Location sharing"
            body="Location is shared with trusted family for safety, and only foreground location is used. Your loved one is always told their family can see it."
          />
        ) : null}

        <Card elevation="card">
          <Stack gap="md">
            <Stack direction="row" gap="md" align="center">
              <Icon name="people" color="primary" size={theme.iconSize.lg} />
              <Stack flex gap="xs">
                <Text variant="heading">Your family code</Text>
                <Text variant="body" tone="textSecondary">Share this one code with anyone who should help. It never expires.</Text>
              </Stack>
            </Stack>
            {joinCode ? <PairingCode code={joinCode} /> : null}
          </Stack>
        </Card>

        <View style={styles.signOut}>
          <Button label="Sign out" variant="secondary" onPress={doSignOut} />
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
}: {
  icon: "heart" | "location";
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.ReactElement {
  return (
    <Card elevation="card">
      <Stack gap="md">
        <Stack direction="row" gap="md" align="center">
          <Icon name={icon} color="primary" size={theme.iconSize.lg} />
          <Stack flex gap="xs">
            <Text variant="heading">{title}</Text>
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
  signOut: { marginTop: theme.spacing.md },
});
