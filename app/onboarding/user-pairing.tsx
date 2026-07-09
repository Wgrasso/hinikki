// app/onboarding/user-pairing.tsx — older adult: start on their own (show one code to share),
// or join their family by code and tap their name. Tapping a name that is already set up on
// another device MOVES it here after a confirmation (the join code is the trust boundary —
// this is the login-free device recovery the claim RPC was built for).
import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert } from "react-native";
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
  const [showJoinNew, setShowJoinNew] = useState(false);
  const [newName, setNewName] = useState("");
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
    if (!r.ok) {
      setError(
        r.message.includes("already set up as a different person")
          ? "This phone is already connected as someone else. Ask your family for help, or start fresh from the app settings."
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
      `Use Nikki as ${entry.displayName} on this phone?`,
      "This name is set up on another device. Moving it here will disconnect that other device.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Move to this phone", onPress: () => { void claimEntry(entry); } },
      ],
    );
  }

  async function joinNew(): Promise<void> {
    const name = newName.trim();
    if (name.length === 0) { setError("Please enter their name first."); return; }
    setBusy(true); setError(null);
    const r = await joinAsNewOlderAdult(entered.trim().toUpperCase(), name);
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
              onPress={() => confirmClaim(entry)}
              accessibilityLabel={entry.displayName}
            >
              <Stack direction="row" gap="md" align="center">
                <Stack flex gap="xs">
                  <Text variant="heading">{entry.displayName}</Text>
                  {entry.hasOwner ? (
                    <Text variant="body" tone="textSecondary">On another device — tap to move it to this phone</Text>
                  ) : null}
                </Stack>
                <Icon name="chevron" color="primary" size={theme.iconSize.md} />
              </Stack>
            </Card>
          ))}
          {error ? <Text variant="body" tone="danger">{error}</Text> : null}
          {showJoinNew ? (
            <Stack gap="md">
              <Field label="Their name" value={newName} onChangeText={setNewName} placeholder="e.g. Anna" autoCapitalize="words" />
              <Button label="Create this new person" icon="check" loading={busy} onPress={joinNew} />
            </Stack>
          ) : (
            <Button label="Someone new? Add them instead" variant="secondary" onPress={() => { setError(null); setShowJoinNew(true); }} />
          )}
        </Stack>
      ) : null}
    </Screen>
  );
}
