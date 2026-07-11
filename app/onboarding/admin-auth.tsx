// app/onboarding/admin-auth.tsx — family/caregiver sign up or sign in (Supabase email/password).
import React, { useState } from "react";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Field, Screen, Stack, Text } from "../../src/primitives";
import { adminSignIn, adminSignUp } from "../../src/services/profileService";
import { getMyGroup } from "../../src/services/groupService";
import { useT } from "../../src/i18n";

export default function AdminAuth(): React.ReactElement {
  const router = useRouter();
  const { t } = useT();
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
      <AppBar title={signUp ? t("adminAuth.title.signUp") : t("adminAuth.title.signIn")} onBack={() => router.back()} />
      <Stack gap="lg">
        <Text variant="body" tone="textSecondary">
          {t("adminAuth.intro")}
        </Text>
        {signUp ? (
          <Field label={t("adminAuth.name.label")} value={name} onChangeText={setName} placeholder={t("adminAuth.name.placeholder")} autoCapitalize="words" />
        ) : null}
        <Field
          label={t("adminAuth.email.label")}
          value={email}
          onChangeText={setEmail}
          placeholder={t("adminAuth.email.placeholder")}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field label={t("adminAuth.password.label")} value={password} onChangeText={setPassword} placeholder={t("adminAuth.password.placeholder")} secureTextEntry error={error} />
        <Button label={signUp ? t("adminAuth.submit.signUp") : t("adminAuth.submit.signIn")} icon="check" loading={busy} onPress={submit} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={signUp ? t("adminAuth.toggle.toSignIn") : t("adminAuth.toggle.toSignUp")}
          onPress={() => {
            setSignUp((s) => !s);
            setError(null);
          }}
        >
          <Text variant="bodyStrong" tone="primary" center>
            {signUp ? t("adminAuth.toggle.toSignIn") : t("adminAuth.toggle.toSignUp")}
          </Text>
        </Pressable>
      </Stack>
    </Screen>
  );
}
