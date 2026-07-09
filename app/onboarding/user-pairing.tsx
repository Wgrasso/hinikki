// app/onboarding/user-pairing.tsx — older adult: start on their own (show one code to share),
// or join their family by code and tap their name (which recovers their profile on any device).
import React, { useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Card, Field, Icon, Screen, Stack, Text } from "../../src/primitives";
import PairingCode from "../../src/components/shared/PairingCode";
import { theme } from "../../src/theme";
import { startSoloOlderAdult, getGroupRoster, claimOlderAdult, joinAsNewOlderAdult, RosterEntry } from "../../src/services/groupService";

type View = "choose" | "show" | "enter" | "pick";

export default function UserPairing(): React.ReactElement {
  const router = useRouter();
  const { completeSetupWithGroup } = useAppState();
  const [view, setView] = useState<View>("choose");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [entered, setEntered] = useState("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<{ groupId: string; joinCode: string } | null>(null);
  const soloOlderAdultId = useRef<string | null>(null);

  async function showMyCode(): Promise<void> {
    setView("show"); setBusy(true); setError(null);
    try {
      const h = await startSoloOlderAdult();
      soloOlderAdultId.current = h.olderAdultId;
      handle.current = { groupId: h.groupId, joinCode: h.joinCode };
      setCode(h.joinCode);
    } catch {
      setError("We could not create your code just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function finishSolo(): Promise<void> {
    const id = soloOlderAdultId.current;
    const h = handle.current;
    if (!id || !h) return;
    await completeSetupWithGroup("user", id, h.groupId, h.joinCode);
    router.replace("/user/nikki");
  }

  async function loadRoster(): Promise<void> {
    setBusy(true); setError(null);
    const r = await getGroupRoster(entered.trim().toUpperCase());
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    handle.current = { groupId: r.value.groupId, joinCode: entered.trim().toUpperCase() };
    setRoster(r.value.olderAdults);
    setView("pick");
  }

  async function claimEntry(entry: RosterEntry): Promise<void> {
    setBusy(true); setError(null);
    const r = await claimOlderAdult(entered.trim().toUpperCase(), entry.id);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    const h = handle.current;
    await completeSetupWithGroup("user", r.value.olderAdultId, h?.groupId ?? "", h?.joinCode ?? entered.trim().toUpperCase());
    router.replace("/user/nikki");
  }

  async function joinNew(): Promise<void> {
    setBusy(true); setError(null);
    const r = await joinAsNewOlderAdult(entered.trim().toUpperCase(), "My profile");
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    const h = handle.current;
    await completeSetupWithGroup("user", r.value.olderAdultId, h?.groupId ?? "", h?.joinCode ?? entered.trim().toUpperCase());
    router.replace("/user/nikki");
  }

  return (
    <Screen scroll>
      <AppBar title="Connect with family" onBack={() => (view === "choose" ? router.back() : setView("choose"))} />

      {view === "choose" ? (
        <Stack gap="lg">
          <Card elevation="card" onPress={showMyCode} accessibilityLabel="Start on my own">
            <Stack direction="row" gap="lg" align="center">
              <Icon name="sparkle" color="primary" size={theme.iconSize.lg} />
              <Stack flex gap="xs">
                <Text variant="heading">Start on my own</Text>
                <Text variant="body" tone="textSecondary">Get one code to give your family so they can help.</Text>
              </Stack>
            </Stack>
          </Card>
          <Card elevation="card" onPress={() => setView("enter")} accessibilityLabel="Enter a code from family">
            <Stack direction="row" gap="lg" align="center">
              <Icon name="people" color="primary" size={theme.iconSize.lg} />
              <Stack flex gap="xs">
                <Text variant="heading">Enter a code from family</Text>
                <Text variant="body" tone="textSecondary">Your family already set things up for you.</Text>
              </Stack>
            </Stack>
          </Card>
        </Stack>
      ) : null}

      {view === "show" ? (
        <Stack gap="lg">
          {busy ? (
            <Stack align="center" gap="md" padding="xl">
              <ActivityIndicator color={theme.colors.primary} size="large" />
              <Text variant="body" tone="textSecondary">Creating your code…</Text>
            </Stack>
          ) : error ? (
            <Stack gap="md">
              <Text variant="body" tone="danger">{error}</Text>
              <Button label="Try again" onPress={showMyCode} />
            </Stack>
          ) : (
            <>
              <PairingCode code={code} />
              <Text variant="body" tone="textSecondary">Give this one code to your family. Then tap below to start.</Text>
              <Button label="I'm ready to start" icon="check" onPress={finishSolo} />
            </>
          )}
        </Stack>
      ) : null}

      {view === "enter" ? (
        <Stack gap="lg">
          <Field label="Code from family" value={entered} onChangeText={setEntered} placeholder="8-character code" autoCapitalize="none" error={error} />
          <Button label="Continue" icon="check" loading={busy} onPress={loadRoster} />
        </Stack>
      ) : null}

      {view === "pick" ? (
        <Stack gap="lg">
          <Text variant="body" tone="textSecondary">Who are you? Tap your name to connect.</Text>
          {roster.map((entry) => (
            <Card
              key={entry.id}
              elevation="card"
              onPress={entry.hasOwner ? undefined : () => { void claimEntry(entry); }}
              accessibilityLabel={entry.displayName}
            >
              <Stack direction="row" gap="md" align="center">
                <Stack flex gap="xs">
                  <Text variant="heading">{entry.displayName}</Text>
                  {entry.hasOwner ? (
                    <Text variant="body" tone="textSecondary">Already set up on another device</Text>
                  ) : null}
                </Stack>
                {!entry.hasOwner ? <Icon name="chevron" color="primary" size={theme.iconSize.md} /> : null}
              </Stack>
            </Card>
          ))}
          {error ? <Text variant="body" tone="danger">{error}</Text> : null}
          <Button label="Join as a new person" variant="secondary" loading={busy} onPress={joinNew} />
        </Stack>
      ) : null}
    </Screen>
  );
}
