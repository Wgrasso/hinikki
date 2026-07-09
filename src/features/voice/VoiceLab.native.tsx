// src/features/voice/VoiceLab.native.tsx — Phase 1 spike: proves the ElevenLabs RN SDK connects,
// streams audio both ways, and that we can read status/mode/transcript events on a dev build.
// Throwaway: reachable only via the hidden /voice-lab route, never linked from the UI.
// Talks to a PUBLIC test agent via EXPO_PUBLIC_ELEVENLABS_AGENT_ID; the production path
// (private agent + Edge-Function-minted conversation token) lives in useNikkiSession.
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ConversationProvider, useConversation } from "@elevenlabs/react-native";
import { Button, Screen, Stack, Text } from "../../primitives";
import { theme } from "../../theme";
import { ELEVENLABS_SPIKE_AGENT_ID } from "../../lib/constants";
import { ensureMicPermission } from "./micPermission";

type LogLine = { id: number; who: "user" | "agent" | "system"; text: string };

function VoiceLabInner(): React.ReactElement {
  const [log, setLog] = useState<LogLine[]>([]);
  const [starting, setStarting] = useState(false);

  const append = useCallback((who: LogLine["who"], text: string) => {
    setLog((prev) => [...prev, { id: prev.length, who, text }]);
  }, []);

  const conversation = useConversation({
    onConnect: ({ conversationId }) => append("system", `connected (${conversationId})`),
    onDisconnect: (details) => append("system", `disconnected (${details.reason})`),
    onError: (message) => append("system", `error: ${message}`),
    onMessage: ({ message, role }) => append(role, message),
  });

  const start = useCallback(async () => {
    if (!ELEVENLABS_SPIKE_AGENT_ID) {
      append("system", "EXPO_PUBLIC_ELEVENLABS_AGENT_ID is not set — create a public test agent and set it in .env");
      return;
    }
    setStarting(true);
    try {
      const granted = await ensureMicPermission();
      if (!granted) {
        append("system", "microphone permission denied");
        return;
      }
      conversation.startSession({
        agentId: ELEVENLABS_SPIKE_AGENT_ID,
        connectionType: "webrtc",
        dynamicVariables: { preferred_name: "Test" },
      });
    } finally {
      setStarting(false);
    }
  }, [append, conversation]);

  const connected = conversation.status === "connected";

  return (
    <Screen>
      <Stack gap="lg" style={styles.flex}>
        <Text variant="title">Voice lab (spike)</Text>
        <Text variant="body" tone="textSecondary">
          status: {conversation.status} · {conversation.isSpeaking ? "Nikki speaking" : "listening"}
        </Text>
        <ScrollView style={styles.log}>
          {log.map((line) => (
            <Text key={line.id} variant="caption" tone={line.who === "system" ? "textTertiary" : "textPrimary"}>
              [{line.who}] {line.text}
            </Text>
          ))}
        </ScrollView>
        <View>
          {connected ? (
            <Button label="End session" variant="danger" onPress={() => conversation.endSession()} />
          ) : (
            <Button label="Start session" onPress={() => void start()} loading={starting || conversation.status === "connecting"} />
          )}
        </View>
      </Stack>
    </Screen>
  );
}

export default function VoiceLab(): React.ReactElement {
  return (
    <ConversationProvider>
      <VoiceLabInner />
    </ConversationProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  log: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
});
