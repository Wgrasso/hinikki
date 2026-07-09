// app/onboarding/admin-auth.tsx — family/caregiver sign up or sign in (Supabase email/password).
import React, { useState } from "react";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Field, Screen, Stack, Text } from "../../src/primitives";
import { adminSignIn, adminSignUp } from "../../src/services/profileService";
import { getMyGroup } from "../../src/services/groupService";

export default function AdminAuth(): React.ReactElement {
  const router = useRouter();
  const { completeSetupWithGroup } = useAppState();
  const [signUp, setSignUp] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = signUp ? await adminSignUp(email.trim(), password, name.trim() || "Family") : await adminSignIn(email.trim(), password);
    if (!result.ok) { setBusy(false); setError(result.message); return; }
    const mine = await getMyGroup();
    setBusy(false);
    if (mine && mine.olderAdultId) {
      await completeSetupWithGroup("admin", mine.olderAdultId, mine.groupId, mine.joinCode);
      router.replace("/admin/dashboard");
      return;
    }
    router.push("/onboarding/admin-pairing");
  }

  return (
    <Screen scroll>
      <AppBar title={signUp ? "Create your account" : "Welcome back"} onBack={() => router.back()} />
      <Stack gap="lg">
        <Text variant="body" tone="textSecondary">
          You will use this to keep Nikki up to date for the person you care for.
        </Text>
        {signUp ? (
          <Field label="Your name" value={name} onChangeText={setName} placeholder="e.g. Sophie" autoCapitalize="words" />
        ) : null}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry error={error} />
        <Button label={signUp ? "Create account" : "Sign in"} icon="check" loading={busy} onPress={submit} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={signUp ? "I already have an account" : "Create a new account"}
          onPress={() => {
            setSignUp((s) => !s);
            setError(null);
          }}
        >
          <Text variant="bodyStrong" tone="primary" center>
            {signUp ? "I already have an account" : "Create a new account"}
          </Text>
        </Pressable>
      </Stack>
    </Screen>
  );
}
