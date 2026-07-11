// app/onboarding/user-pairing.tsx — older adult: join the family your admin already set up.
// Enter the code they gave you, then tap your name. Tapping a name that is already set up on
// another device MOVES it here after a confirmation (the join code is the trust boundary —
// this is the login-free device recovery the claim RPC was built for).
import React, { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Card, Field, Icon, Screen, Stack, Text } from "../../src/primitives";
import { theme } from "../../src/theme";
import { getGroupRoster, claimOlderAdult, RosterEntry } from "../../src/services/groupService";
import { useT } from "../../src/i18n";

type View = "enter" | "pick";

export default function UserPairing(): React.ReactElement {
  const router = useRouter();
  const { code: codeParam } = useLocalSearchParams<{ code?: string }>();
  const { completeSetupWithGroup } = useAppState();
  const { t } = useT();
  const [view, setView] = useState<View>("enter");
  const [busy, setBusy] = useState(false);
  const [entered, setEntered] = useState("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<{ groupId: string; joinCode: string } | null>(null);

  async function loadRoster(codeOverride?: string): Promise<void> {
    const joinCode = (codeOverride ?? entered).trim().toUpperCase();
    setBusy(true); setError(null);
    const r = await getGroupRoster(joinCode);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    handle.current = { groupId: r.value.groupId, joinCode };
    setRoster(r.value.olderAdults);
    setView("pick");
  }

  // Arriving with ?code= (e.g. from the dev switcher's re-pair path) skips the typing:
  // straight to "who are you?" for that family.
  const autoloadedRef = useRef(false);
  useEffect(() => {
    if (typeof codeParam === "string" && codeParam.length > 0 && !autoloadedRef.current) {
      autoloadedRef.current = true;
      setEntered(codeParam.toUpperCase());
      setView("enter");
      void loadRoster(codeParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeParam]);

  async function claimEntry(entry: RosterEntry): Promise<void> {
    setBusy(true); setError(null);
    const r = await claimOlderAdult(entered.trim().toUpperCase(), entry.id);
    setBusy(false);
    if (!r.ok) {
      setError(
        r.message.includes("already set up as a different person")
          ? t("onboarding.pairing.alreadyOther")
          : r.message,
      );
      return;
    }
    const h = handle.current;
    await completeSetupWithGroup("user", r.value.olderAdultId, h?.groupId ?? "", h?.joinCode ?? entered.trim().toUpperCase());
    router.replace("/user/nikki");
  }

  // Tapping a name that lives on another device moves it HERE — confirmed first, because
  // the other device is disconnected by the move.
  function confirmClaim(entry: RosterEntry): void {
    if (!entry.hasOwner) { void claimEntry(entry); return; }
    Alert.alert(
      t("onboarding.pairing.moveTitle", { name: entry.displayName }),
      t("onboarding.pairing.moveBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("onboarding.pairing.moveConfirm"), onPress: () => { void claimEntry(entry); } },
      ],
    );
  }

  return (
    <Screen scroll>
      <AppBar title={t("onboarding.pairing.title")} onBack={() => (view === "enter" ? router.back() : setView("enter"))} />

      {view === "enter" ? (
        <Stack gap="lg">
          <Card elevation="card">
            <Stack direction="row" gap="lg" align="center">
              <Icon name="people" color="primary" size={theme.iconSize.lg} />
              <Stack flex gap="xs">
                <Text variant="heading">{t("onboarding.pairing.introTitle")}</Text>
                <Text variant="body" tone="textSecondary">{t("onboarding.pairing.introBody")}</Text>
              </Stack>
            </Stack>
          </Card>
          <Field label={t("onboarding.pairing.codeLabel")} value={entered} onChangeText={setEntered} placeholder={t("onboarding.pairing.codePlaceholder")} autoCapitalize="none" error={error} />
          <Button label={t("onboarding.pairing.continue")} icon="check" loading={busy} onPress={() => { void loadRoster(); }} />
        </Stack>
      ) : null}

      {view === "pick" ? (
        <Stack gap="lg">
          <Text variant="body" tone="textSecondary">{t("onboarding.pairing.pickName")}</Text>
          {roster.map((entry) => (
            <Card
              key={entry.id}
              elevation="card"
              onPress={() => confirmClaim(entry)}
              accessibilityLabel={entry.displayName}
            >
              <Stack direction="row" gap="md" align="center">
                <Stack flex gap="xs">
                  <Text variant="heading">{entry.displayName}</Text>
                  {entry.hasOwner ? (
                    <Text variant="body" tone="textSecondary">{t("onboarding.pairing.onAnotherDevice")}</Text>
                  ) : null}
                </Stack>
                <Icon name="chevron" color="primary" size={theme.iconSize.md} />
              </Stack>
            </Card>
          ))}
          {error ? <Text variant="body" tone="danger">{error}</Text> : null}
        </Stack>
      ) : null}
    </Screen>
  );
}
