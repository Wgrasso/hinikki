// src/components/user/VoiceExperience.native.tsx — the voice conversation surface on iOS/Android:
// ConversationProvider + the session hook + orb/captions. The session is scoped to this screen on
// purpose — leaving the Nikki tab says goodbye (predictable for the user, and live agent minutes
// are billed). Metro picks VoiceExperience.tsx on web, so the SDK import below never reaches web.
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import RecapCard from "./RecapCard";

export type VoiceExperienceProps = {
  olderAdultId: string;
  preferredName: string | null;
  // A phrase spoken on the user's behalf right after connecting (Help's "I am lost",
  // People's "Who is Emma?"). Auto-starts the session.
  initialAsk: string | null;
};

export default function VoiceExperience(props: VoiceExperienceProps): React.ReactElement {
  const { t } = useT();
  // Each conversation runs inside a FRESH ConversationProvider. The SDK starts/stops the native
  // AudioSession per session, and reusing one provider across goodbye→restart leaves the mic
  // capture stale — the second conversation would connect but hear nothing. Remounting on a new
  // generation guarantees a clean room + audio session every time. begin()'s async preamble
  // (mic check, token, variables) runs well after the old provider's teardown, so there's no
  // start/stop race on the audio session.
  const [generation, setGeneration] = useState(0);
  const startFresh = useCallback(() => setGeneration((g) => g + 1), []);

  if (!HAS_VOICE) {
    return <NikkiCard message={t("voice.notSetUp")} />;
  }
  return (
    <ConversationProvider key={generation}>
      <VoiceSession {...props} generation={generation} onRequestRestart={startFresh} />
    </ConversationProvider>
  );
}

function VoiceSession({
  olderAdultId,
  preferredName,
  initialAsk,
  generation,
  onRequestRestart,
}: VoiceExperienceProps & { generation: number; onRequestRestart: () => void }): React.ReactElement {
  const { t } = useT();
  const session = useNikkiSession(olderAdultId, preferredName);
  const autoStartedRef = useRef(false);

  // Auto-begin on mount when this is a restart (a fresh generation), or on first entry when a
  // phrase was handed in (Help's "I am lost" / People's "Who is Emma?"). Runs once per mount.
  useEffect(() => {
    if (autoStartedRef.current || session.phase !== "idle") return;
    if (generation > 0) {
      autoStartedRef.current = true;
      void session.begin();
    } else if (initialAsk) {
      autoStartedRef.current = true;
      void session.begin(initialAsk);
    }
  }, [generation, initialAsk, session]);

  // "Talk" starts the first conversation of this mount; once one has ended, tapping asks the
  // host for a brand-new provider (which auto-begins) rather than restarting the stale one.
  const onTalk = useCallback((): void => {
    if (session.phase === "ended" || session.phase === "error") onRequestRestart();
    else void session.begin();
  }, [session, onRequestRestart]);

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
        {session.phase === "ended" ? (
          session.recap ? (
            <RecapCard summary={session.recap.summary} changes={session.recap.changes} />
          ) : (
            <NikkiCard message={t("voice.ended")} />
          )
        ) : null}
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
