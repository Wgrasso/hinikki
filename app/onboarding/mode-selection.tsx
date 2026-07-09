// app/onboarding/mode-selection.tsx — the one first-run question: who is this for?
import React from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { Card, Icon, Reveal, Screen, Stack, Text } from "../../src/primitives";
import { theme } from "../../src/theme";

export default function ModeSelection(): React.ReactElement {
  const router = useRouter();
  const { chooseMode } = useAppState();

  async function pick(mode: "user" | "admin"): Promise<void> {
    await chooseMode(mode);
    router.push(mode === "user" ? "/onboarding/user-pairing" : "/onboarding/admin-auth");
  }

  return (
    <Screen scroll>
      <Stack gap="xl" style={styles.top}>
        <Reveal>
          <Stack gap="sm">
            <Text variant="overline" tone="primary">
              WELCOME TO HINIKKI
            </Text>
            <Text variant="display">Who are you{"\n"}setting up Nikki for?</Text>
          </Stack>
        </Reveal>

        <Reveal delay={theme.motion.durationFast}>
          <Card elevation="card" onPress={() => pick("user")} accessibilityLabel="I am using Nikki">
            <View style={styles.choice}>
              <View style={styles.iconWrap}>
                <Icon name="heart" color="onPrimary" size={theme.iconSize.lg} />
              </View>
              <View style={styles.choiceText}>
                <Text variant="heading">I am using Nikki</Text>
                <Text variant="body" tone="textSecondary">
                  Set up Nikki for yourself.
                </Text>
              </View>
              <Icon name="chevron" color="textTertiary" />
            </View>
          </Card>
        </Reveal>

        <Reveal delay={theme.motion.durationBase}>
          <Card elevation="card" onPress={() => pick("admin")} accessibilityLabel="I am family or caregiver">
            <View style={styles.choice}>
              <View style={[styles.iconWrap, styles.accentWrap]}>
                <Icon name="people" color="onPrimary" size={theme.iconSize.lg} />
              </View>
              <View style={styles.choiceText}>
                <Text variant="heading">I am family / caregiver</Text>
                <Text variant="body" tone="textSecondary">
                  Help set up and look after someone.
                </Text>
              </View>
              <Icon name="chevron" color="textTertiary" />
            </View>
          </Card>
        </Reveal>
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: theme.spacing.xxl },
  choice: { flexDirection: "row", alignItems: "center", gap: theme.spacing.lg },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  accentWrap: { backgroundColor: theme.colors.accent },
  choiceText: { flex: 1, gap: theme.spacing.xs },
});
