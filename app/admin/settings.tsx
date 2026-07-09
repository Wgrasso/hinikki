// app/admin/settings.tsx — weather advice, dignified location sharing, family invites, and sign out.
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Card, Icon, Screen, Stack, Text } from "../../src/primitives";
import PairingCode from "../../src/components/shared/PairingCode";
import QuickAddModal from "../../src/components/admin/QuickAddModal";
import { theme } from "../../src/theme";
import { saveWeatherAdvice } from "../../src/services/weatherService";

export default function AdminSettings(): React.ReactElement {
  const { olderAdultId, joinCode, signOut } = useAppState();
  const id = olderAdultId ?? "";
  const router = useRouter();
  const [editingAdvice, setEditingAdvice] = useState(false);

  async function doSignOut(): Promise<void> {
    await signOut();
    router.replace("/");
  }

  return (
    <Screen scroll>
      <AppBar title="Settings" subtitle="Fine-tune how Nikki helps." />
      <Stack gap="lg">
        <InfoCard
          icon="weather"
          title="Weather advice"
          body="Add a personal note Nikki uses, like “wear the brown winter coat under 8°C.”"
          actionLabel="Edit advice"
          onAction={() => setEditingAdvice(true)}
        />

        <InfoCard
          icon="location"
          title="Location sharing"
          body="Location is shared with trusted family for safety, and only foreground location is used. Your loved one is always told their family can see it."
        />

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
        fields={[{ key: "advice", label: "Advice for Nikki", placeholder: "e.g. Wear the brown coat under 8°C", required: true }]}
        onClose={() => setEditingAdvice(false)}
        onSubmit={async (v) => {
          await saveWeatherAdvice(id, v.advice);
        }}
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
  icon: "weather" | "location";
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
