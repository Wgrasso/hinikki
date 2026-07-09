// src/components/user/VoiceExperience.native.tsx — the voice conversation surface on iOS/Android:
// ConversationProvider + the session hook + orb/captions. The session is scoped to this screen on
// purpose — leaving the Nikki tab says goodbye (predictable for the user, and live agent minutes
// are billed). Metro picks VoiceExperience.tsx on web, so the SDK import below never reaches web.
import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { ConversationProvider } from "@elevenlabs/react-native";
import { theme } from "../../theme";
import { Button, Stack, Text } from "../../primitives";
import { HAS_VOICE } from "../../lib/constants";
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
  if (!HAS_VOICE) {
    return (
      <NikkiCard message="Nikki's voice is not set up on this app yet. Your family can finish the setup, and then you can simply talk to me." />
    );
  }
  return (
    <ConversationProvider>
      <VoiceSession {...props} />
    </ConversationProvider>
  );
}

function VoiceSession({ olderAdultId, preferredName, initialAsk }: VoiceExperienceProps): React.ReactElement {
  const session = useNikkiSession(olderAdultId, preferredName);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    if (initialAsk && !autoStartedRef.current && session.phase === "idle") {
      autoStartedRef.current = true;
      void session.begin(initialAsk);
    }
  }, [initialAsk, session]);

  // End the session when the user leaves the screen — never leave a live call behind.
  const endRef = useRef(session.end);
  endRef.current = session.end;
  useEffect(() => () => endRef.current(), []);

  const live = session.phase === "live";
  const busy = session.phase === "preparing" || session.phase === "connecting";

  return (
    <Stack gap="xl" style={styles.wrap}>
      {session.phase === "idle" ? (
        <NikkiCard
          message={`I am Nikki, and I am here for you${preferredName ? `, ${preferredName}` : ""}. Tap the big button and just talk to me — about your day, your family, or the weather.`}
        />
      ) : null}
      {session.phase === "ended" ? (
        session.recap ? (
          <RecapCard summary={session.recap.summary} changes={session.recap.changes} />
        ) : (
          <NikkiCard message="It was lovely talking with you. Tap the button whenever you would like to talk again." />
        )
      ) : null}
      {session.phase === "error" && session.errorMessage ? <NikkiCard message={session.errorMessage} /> : null}

      <VoiceCaptions captions={session.captions} />

      <View style={styles.orbArea}>
        {live ? (
          <Stack gap="lg" style={styles.liveArea}>
            <VoiceOrb
              state={session.isSpeaking ? "speaking" : "listening"}
              label={session.isSpeaking ? "Nikki is speaking…" : "Nikki is listening — just talk"}
              onPress={() => undefined}
              disabled
            />
            <Button label="Goodbye Nikki" variant="secondary" onPress={session.end} />
          </Stack>
        ) : (
          <VoiceOrb
            state={busy ? "busy" : "idle"}
            label={busy ? "Waking Nikki up…" : "Talk to Nikki"}
            onPress={() => void session.begin()}
            disabled={busy}
          />
        )}
      </View>
    </Stack>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: theme.spacing.lg },
  orbArea: { alignItems: "center", paddingVertical: theme.spacing.xl },
  liveArea: { alignItems: "center", alignSelf: "stretch" },
});
