// src/components/user/VoiceExperience.native.tsx — the voice conversation surface on iOS/Android:
// ConversationProvider + the session hook + orb/captions. The session is scoped to this screen on
// purpose — leaving the Nikki tab says goodbye (predictable for the user, and live agent minutes
// are billed). Metro picks VoiceExperience.tsx on web, so the SDK import below never reaches web.
import React, { useCallback, useEffect, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ConversationProvider } from "@elevenlabs/react-native";
import { theme } from "../../theme";
import { Button, Stack, Text } from "../../primitives";
import { HAS_VOICE } from "../../lib/constants";
import { useT } from "../../i18n";
import { useNikkiSession } from "../../features/voice/useNikkiSession";
import VoiceOrb from "./VoiceOrb";
import VoiceCaptions from "./VoiceCaptions";
import NikkiCard from "./NikkiCard";

export type VoiceExperienceProps = {
  olderAdultId: string;
  preferredName: string | null;
  // A phrase spoken on the user's behalf right after connecting (Help's "I am lost",
  // People's "Who is Emma?"). Auto-starts the session.
  initialAsk: string | null;
};

export default function VoiceExperience(props: VoiceExperienceProps): React.ReactElement {
  const { t } = useT();
  if (!HAS_VOICE) {
    return <NikkiCard message={t("voice.notSetUp")} />;
  }
  // ONE ConversationProvider for the whole screen — never remounted. The SDK has no JS-level
  // singleton to reset (each startSession builds a fresh Room), and remounting only makes the old
  // provider's un-awaited endSession() call the process-global stopAudioSession() AFTER the new
  // session's startAudioSession(), killing the mic. Restart is handled inside the session hook
  // (settle delay + mic re-arm) instead.
  return (
    <ConversationProvider>
      <VoiceSession {...props} />
    </ConversationProvider>
  );
}

function VoiceSession({ olderAdultId, preferredName, initialAsk }: VoiceExperienceProps): React.ReactElement {
  const { t } = useT();
  const session = useNikkiSession(olderAdultId, preferredName);
  const autoStartedRef = useRef(false);

  // Auto-start once on entry when a phrase was handed in (Help's "I am lost" / People's "Who is Emma?").
  useEffect(() => {
    if (initialAsk && !autoStartedRef.current && session.phase === "idle") {
      autoStartedRef.current = true;
      void session.begin(initialAsk);
    }
  }, [initialAsk, session]);

  // "Talk" starts a conversation, and starts another after one has ended — the hook makes the
  // restart safe (waits out the old native teardown, then re-arms the mic).
  const onTalk = useCallback((): void => {
    void session.begin();
  }, [session]);

  // End the session when the user leaves the screen — never leave a live call behind.
  const endRef = useRef(session.end);
  endRef.current = session.end;
  useEffect(() => () => endRef.current(), []);

  const live = session.phase === "live";
  const busy = session.phase === "preparing" || session.phase === "connecting";

  // Auto-scroll the transcript so the newest line is always visible and older lines rise
  // out of the top — the orb below stays pinned and never drifts off-screen.
  const scrollRef = useRef<ScrollView>(null);
  const scrollToEnd = (): void => scrollRef.current?.scrollToEnd({ animated: true });

  return (
    <View style={styles.column}>
      <ScrollView
        ref={scrollRef}
        style={styles.transcript}
        contentContainerStyle={styles.transcriptContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToEnd}
        keyboardShouldPersistTaps="handled"
      >
        {session.phase === "idle" ? (
          <NikkiCard
            message={preferredName ? t("voice.idleNamed", { name: preferredName }) : t("voice.idlePlain")}
          />
        ) : null}
        {/* The elder sees a warm goodbye, never the recap — the recap is written quietly for the
            family and shown only on the admin Home screen. */}
        {session.phase === "ended" ? <NikkiCard message={t("voice.ended")} /> : null}
        {session.phase === "error" && session.errorMessage ? <NikkiCard message={session.errorMessage} /> : null}

        <VoiceCaptions captions={session.captions} />
      </ScrollView>

      <View style={styles.orbArea}>
        {live ? (
          <Stack gap="lg" style={styles.liveArea}>
            <VoiceOrb
              state={session.isSpeaking ? "speaking" : "listening"}
              label={session.isSpeaking ? t("voice.speaking") : t("voice.listening")}
              onPress={() => undefined}
              disabled
            />
            <Button label={t("voice.goodbye")} variant="secondary" onPress={session.end} />
          </Stack>
        ) : (
          <VoiceOrb
            state={busy ? "busy" : "idle"}
            label={busy ? t("nikki.wakingUp") : t("voice.talk")}
            onPress={onTalk}
            disabled={busy}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  transcript: { flex: 1 },
  transcriptContent: { gap: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg },
  orbArea: { alignItems: "center", paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md },
  liveArea: { alignItems: "center", alignSelf: "stretch" },
});
