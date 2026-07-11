// app/onboarding/admin-pairing.tsx — family/caregiver sets up the household: create a new one
// (and show the stable code to share) or join an existing one with a code.
import React, { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Card, Field, Icon, Screen, Stack, Text } from "../../src/primitives";
import PairingCode from "../../src/components/shared/PairingCode";
import { theme } from "../../src/theme";
import { adminCreateHousehold, joinGroupAsAdmin } from "../../src/services/groupService";

type View = "choose" | "create" | "created" | "join";

export default function AdminPairing(): React.ReactElement {
  const router = useRouter();
  const { completeSetupWithGroup } = useAppState();
  const [view, setView] = useState<View>("choose");
  const [name, setName] = useState("");
  const [entered, setEntered] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const created = useRef<{ olderAdultId: string; groupId: string; joinCode: string } | null>(null);

  async function createHousehold(): Promise<void> {
    if (name.trim().length === 0) { setError("Please enter a name."); return; }
    setBusy(true); setError(null);
    try {
      const h = await adminCreateHousehold("Our family", name.trim());
      created.current = { olderAdultId: h.olderAdultId, groupId: h.groupId, joinCode: h.joinCode };
      setCode(h.joinCode);
      setView("created");
    } catch {
      setError("We could not create the household just now. Please try again.");
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
      <AppBar title="Set up your household" onBack={() => (view === "choose" ? router.back() : setView("choose"))} />

      {view === "choose" ? (
        <Stack gap="lg">
          <Card elevation="card" onPress={() => setView("create")} accessibilityLabel="Create a new household">
            <Stack direction="row" gap="lg" align="center">
              <Icon name="add" color="primary" size={theme.iconSize.lg} />
              <Stack flex gap="xs">
                <Text variant="heading">Create a household</Text>
                <Text variant="body" tone="textSecondary">
                  Start fresh — you will get a code to share with everyone.
                </Text>
              </Stack>
            </Stack>
          </Card>
          <Card elevation="card" onPress={() => setView("join")} accessibilityLabel="Join an existing household">
            <Stack direction="row" gap="lg" align="center">
              <Icon name="people" color="primary" size={theme.iconSize.lg} />
              <Stack flex gap="xs">
                <Text variant="heading">Join an existing household</Text>
                <Text variant="body" tone="textSecondary">
                  Someone already set things up — enter the family code.
                </Text>
              </Stack>
            </Stack>
          </Card>
        </Stack>
      ) : null}

      {view === "create" ? (
        <Stack gap="lg">
          <Field label="Who are you caring for?" value={name} onChangeText={setName} placeholder="e.g. Anna" autoCapitalize="words" error={error} />
          <Button label="Create our family" icon="check" loading={busy} onPress={createHousehold} />
        </Stack>
      ) : null}

      {view === "created" ? (
        <Stack gap="lg">
          <PairingCode code={code} />
          <Text variant="body" tone="textSecondary">
            Share this one code with {name || "your family"} and with the person using Nikki. Everyone enters the same code to connect — it never expires.
          </Text>
          <Card elevation="card">
            <Stack gap="xs">
              <Text variant="bodyStrong">Before you share this code, please set up:</Text>
              <Text variant="body" tone="textSecondary">• Your loved one's language</Text>
              <Text variant="body" tone="textSecondary">• Their home address</Text>
              <Text variant="body" tone="textSecondary">• At least one family phone number to call</Text>
              <Text variant="caption" tone="textSecondary">You can do all of this from the app.</Text>
            </Stack>
          </Card>
          <Button label="Go to dashboard" icon="check" onPress={finish} />
        </Stack>
      ) : null}

      {view === "join" ? (
        <Stack gap="lg">
          <Field label="Family code" value={entered} onChangeText={setEntered} placeholder="8-character code" autoCapitalize="none" error={error} />
          <Button label="Connect" icon="check" loading={busy} onPress={joinHousehold} />
        </Stack>
      ) : null}
    </Screen>
  );
}
