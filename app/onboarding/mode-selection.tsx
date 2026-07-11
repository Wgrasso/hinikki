// app/onboarding/mode-selection.tsx — the one first-run question: who is this for?
import React from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { Card, Icon, Reveal, Screen, Stack, Text } from "../../src/primitives";
import { theme } from "../../src/theme";
import { useT } from "../../src/i18n";

export default function ModeSelection(): React.ReactElement {
  const router = useRouter();
  const { chooseMode } = useAppState();
  const { t } = useT();

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
              {t("onboarding.mode.welcome")}
            </Text>
            <Text variant="display">{t("onboarding.mode.title")}</Text>
          </Stack>
        </Reveal>

        <Reveal delay={theme.motion.durationFast}>
          <Card elevation="card" onPress={() => pick("user")} accessibilityLabel={t("onboarding.mode.user.title")}>
            <View style={styles.choice}>
              <View style={styles.iconWrap}>
                <Icon name="heart" color="onPrimary" size={theme.iconSize.lg} />
              </View>
              <View style={styles.choiceText}>
                <Text variant="heading">{t("onboarding.mode.user.title")}</Text>
                <Text variant="body" tone="textSecondary">
                  {t("onboarding.mode.user.subtitle")}
                </Text>
              </View>
              <Icon name="chevron" color="textTertiary" />
            </View>
          </Card>
        </Reveal>

        <Reveal delay={theme.motion.durationBase}>
          <Card elevation="card" onPress={() => pick("admin")} accessibilityLabel={t("onboarding.mode.family.title")}>
            <View style={styles.choice}>
              <View style={[styles.iconWrap, styles.accentWrap]}>
                <Icon name="people" color="onPrimary" size={theme.iconSize.lg} />
              </View>
              <View style={styles.choiceText}>
                <Text variant="heading">{t("onboarding.mode.family.title")}</Text>
                <Text variant="body" tone="textSecondary">
                  {t("onboarding.mode.family.subtitle")}
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
