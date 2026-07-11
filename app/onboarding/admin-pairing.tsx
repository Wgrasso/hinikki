// app/onboarding/admin-pairing.tsx — family/caregiver sets up the household: create a new one
// (and show the stable code to share) or join an existing one with a code.
import React, { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Card, Field, Icon, Screen, Stack, Text } from "../../src/primitives";
import PairingCode from "../../src/components/shared/PairingCode";
import { theme } from "../../src/theme";
import { adminCreateHousehold, joinGroupAsAdmin } from "../../src/services/groupService";
import { useT } from "../../src/i18n";

type View = "choose" | "create" | "created" | "join";

export default function AdminPairing(): React.ReactElement {
  const router = useRouter();
  const { t } = useT();
  const { completeSetupWithGroup } = useAppState();
  const [view, setView] = useState<View>("choose");
  const [name, setName] = useState("");
  const [entered, setEntered] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const created = useRef<{ olderAdultId: string; groupId: string; joinCode: string } | null>(null);

  async function createHousehold(): Promise<void> {
    if (name.trim().length === 0) { setError(t("adminPairing.error.nameRequired")); return; }
    setBusy(true); setError(null);
    try {
      const h = await adminCreateHousehold("Our family", name.trim());
      created.current = { olderAdultId: h.olderAdultId, groupId: h.groupId, joinCode: h.joinCode };
      setCode(h.joinCode);
      setView("created");
    } catch {
      setError(t("adminPairing.error.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function joinHousehold(): Promise<void> {
    setBusy(true); setError(null);
    const r = await joinGroupAsAdmin(entered.trim().toUpperCase());
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    const joinCode = entered.trim().toUpperCase();
    await completeSetupWithGroup("admin", r.value.olderAdultId, r.value.groupId, joinCode);
    router.replace("/admin/dashboard");
  }

  async function finish(): Promise<void> {
    const h = created.current;
    if (!h) return;
    await completeSetupWithGroup("admin", h.olderAdultId, h.groupId, h.joinCode);
    router.replace("/admin/dashboard");
  }

  return (
    <Screen scroll>
      <AppBar title={t("adminPairing.title")} onBack={() => (view === "choose" ? router.back() : setView("choose"))} />

      {view === "choose" ? (
        <Stack gap="lg">
          <Card elevation="card" onPress={() => setView("create")} accessibilityLabel={t("adminPairing.choose.create.a11y")}>
            <Stack direction="row" gap="lg" align="center">
              <Icon name="add" color="primary" size={theme.iconSize.lg} />
              <Stack flex gap="xs">
                <Text variant="heading">{t("adminPairing.choose.create.title")}</Text>
                <Text variant="body" tone="textSecondary">
                  {t("adminPairing.choose.create.body")}
                </Text>
              </Stack>
            </Stack>
          </Card>
          <Card elevation="card" onPress={() => setView("join")} accessibilityLabel={t("adminPairing.choose.join.a11y")}>
            <Stack direction="row" gap="lg" align="center">
              <Icon name="people" color="primary" size={theme.iconSize.lg} />
              <Stack flex gap="xs">
                <Text variant="heading">{t("adminPairing.choose.join.title")}</Text>
                <Text variant="body" tone="textSecondary">
                  {t("adminPairing.choose.join.body")}
                </Text>
              </Stack>
            </Stack>
          </Card>
        </Stack>
      ) : null}

      {view === "create" ? (
        <Stack gap="lg">
          <Field label={t("adminPairing.create.nameLabel")} value={name} onChangeText={setName} placeholder={t("adminPairing.create.namePlaceholder")} autoCapitalize="words" error={error} />
          <Button label={t("adminPairing.create.submit")} icon="check" loading={busy} onPress={createHousehold} />
        </Stack>
      ) : null}

      {view === "created" ? (
        <Stack gap="lg">
          <PairingCode code={code} />
          <Text variant="body" tone="textSecondary">
            {t("adminPairing.created.share", { name: name || t("adminPairing.created.shareFallbackName") })}
          </Text>
          <Card elevation="card">
            <Stack gap="xs">
              <Text variant="bodyStrong">{t("adminPairing.created.reminderTitle")}</Text>
              <Text variant="body" tone="textSecondary">{t("adminPairing.created.reminderLanguage")}</Text>
              <Text variant="body" tone="textSecondary">{t("adminPairing.created.reminderAddress")}</Text>
              <Text variant="body" tone="textSecondary">{t("adminPairing.created.reminderPhone")}</Text>
              <Text variant="caption" tone="textSecondary">{t("adminPairing.created.reminderHint")}</Text>
            </Stack>
          </Card>
          <Button label={t("adminPairing.created.finish")} icon="check" onPress={finish} />
        </Stack>
      ) : null}

      {view === "join" ? (
        <Stack gap="lg">
          <Field label={t("adminPairing.join.codeLabel")} value={entered} onChangeText={setEntered} placeholder={t("adminPairing.join.codePlaceholder")} autoCapitalize="none" error={error} />
          <Button label={t("adminPairing.join.submit")} icon="check" loading={busy} onPress={joinHousehold} />
        </Stack>
      ) : null}
    </Screen>
  );
}
