// app/admin/settings.tsx — about the elder, weather advice, dignified location sharing, family
// invites, and sign out.
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Card, Icon, Screen, Stack, Text } from "../../src/primitives";
import PairingCode from "../../src/components/shared/PairingCode";
import QuickAddModal from "../../src/components/admin/QuickAddModal";
import AboutFormModal from "../../src/components/admin/AboutFormModal";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { getWeatherAdvice, saveWeatherAdvice } from "../../src/services/weatherService";
import { getOlderAdult } from "../../src/services/profileService";
import { FEATURE_HELP_TAB } from "../../src/lib/constants";
import type { OlderAdultProfile } from "../../src/types/database";

export default function AdminSettings(): React.ReactElement {
  const { olderAdultId, joinCode, signOut } = useAppState();
  const id = olderAdultId ?? "";
  const router = useRouter();
  const [editingAdvice, setEditingAdvice] = useState(false);
  const [editingAbout, setEditingAbout] = useState(false);

  const { state, reload } = useAsync<string>(() => getWeatherAdvice(id), [id]);
  const advice = state.status === "loaded" ? state.data : "";

  const { state: profileState, reload: reloadProfile } = useAsync<OlderAdultProfile | null>(() => getOlderAdult(id), [id]);
  const profile = profileState.status === "loaded" ? profileState.data : null;
  const elderName = profile?.preferred_name ?? profile?.display_name ?? "your loved one";

  function reloadAll(): void {
    reload();
    reloadProfile();
  }

  // Refetch both loads on focus and on live changes; stale-while-refresh keeps it flicker-free.
  useFocusEffect(
    useCallback(() => {
      reload();
      reloadProfile();
    }, [reload, reloadProfile]),
  );
  useEffect(() => {
    if (!id) return;
    return subscribeLive(id, () => {
      reload();
      reloadProfile();
    });
  }, [id, reload, reloadProfile]);

  async function doSignOut(): Promise<void> {
    await signOut();
    router.replace("/");
  }

  return (
    <Screen scroll>
      <AppBar title="Settings" subtitle="Fine-tune how Nikki helps." onRefresh={reloadAll} />
      <Stack gap="lg">
        <InfoCard
          icon="heart"
          title={`About ${elderName}`}
          body="Their name, birthday, home address, and language — the little details that help Nikki greet them warmly."
          actionLabel="Edit details"
          onAction={() => setEditingAbout(true)}
        />

        <InfoCard
          icon="weather"
          title="Weather advice"
          body={advice ? advice : "Add a personal note Nikki uses, like “wear the brown winter coat under 8°C.”"}
          actionLabel={advice ? "Edit advice" : "Add advice"}
          onAction={() => setEditingAdvice(true)}
        />

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

      <QuickAddModal
        visible={editingAdvice}
        title="Weather advice"
        submitLabel="Save"
        initialValues={advice ? { advice } : undefined}
        fields={[{ key: "advice", label: "Advice for Nikki", placeholder: "e.g. Wear the brown coat under 8°C", required: true }]}
        onClose={() => setEditingAdvice(false)}
        onSubmit={async (v) => {
          await saveWeatherAdvice(id, v.advice);
          reload();
        }}
      />

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
  icon: "heart" | "weather" | "location";
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
