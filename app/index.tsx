// app/index.tsx — boot router: restore state, then send the person to the right home.
import React from "react";
import { ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useAppState } from "../src/auth/appState";
import { Screen, Stack, Text } from "../src/primitives";
import { theme } from "../src/theme";

export default function Index(): React.ReactElement {
  const { status, mode } = useAppState();

  if (status === "loading") {
    return (
      <Screen>
        <Stack flex align="center" justify="center" gap="md">
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text variant="body" tone="textSecondary">
            Getting things ready…
          </Text>
        </Stack>
      </Screen>
    );
  }

  if (status === "onboarding") {
    return <Redirect href="/onboarding/mode-selection" />;
  }

  return <Redirect href={mode === "admin" ? "/admin/dashboard" : "/user/nikki"} />;
}
