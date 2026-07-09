// app/user/nikki.tsx — the older adult's home: a warm greeting, today's next thing, the weather, and
// the dominant Nikki chat. This screen serves the core value on first paint.
import React, { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { Icon, Screen, Stack, Text } from "../../src/primitives";
import NikkiCard from "../../src/components/user/NikkiCard";
import ChatBubble from "../../src/components/user/ChatBubble";
import QuickChips from "../../src/components/user/QuickChips";
import StateView from "../../src/components/shared/StateView";
import { useAsync } from "../../src/utils/useAsync";
import { theme } from "../../src/theme";
import { greeting, formatTime } from "../../src/utils/format";
import { getNextEvent } from "../../src/services/calendarService";
import { getWeather } from "../../src/services/weatherService";
import { getOlderAdult } from "../../src/services/profileService";
import { loadChat } from "../../src/services/chatService";
import { sendMessage } from "../../src/features/ai/nikki";
import { captureAndStoreLocation } from "../../src/features/safety/locationCapture";
import type { ChatMessage, WeatherSnapshot as Weather } from "../../src/types/domain";
import type { CalendarEvent, OlderAdultProfile } from "../../src/types/database";

const QUICK_ACTIONS = [
  "What am I doing today?",
  "Who is coming today?",
  "What is the weather?",
  "I am lost",
  "I need help",
];

type NikkiData = {
  adult: OlderAdultProfile | null;
  nextEvent: CalendarEvent | null;
  weather: Weather;
  chat: ChatMessage[];
};

export default function NikkiScreen(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const params = useLocalSearchParams<{ ask?: string }>();
  const initialAsk = typeof params.ask === "string" ? params.ask : null;

  const { state, reload } = useAsync<NikkiData>(async () => {
    const [adult, nextEvent, weather, chat] = await Promise.all([
      getOlderAdult(id),
      getNextEvent(id),
      getWeather(id),
      loadChat(id),
    ]);
    return { adult, nextEvent, weather, chat };
  }, [id]);

  return (
    <Screen padded={false}>
      <StateView state={state} onRetry={reload} loadingLabel="Waking Nikki up…">
        {(data) => <NikkiConversation id={id} data={data} initialAsk={initialAsk} onRefresh={reload} />}
      </StateView>
    </Screen>
  );
}

function NikkiConversation({ id, data, initialAsk, onRefresh }: { id: string; data: NikkiData; initialAsk: string | null; onRefresh: () => void }): React.ReactElement {
  const name = data.adult?.preferred_name ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>(data.chat);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const askedRef = useRef(false);

  async function send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setInput("");
    const prior = messages;
    setMessages([...prior, { id: `tmp-${prior.length}`, role: "user", text: trimmed, createdAt: 0 }]);
    try {
      const result = await sendMessage(id, name, trimmed, prior);
      setMessages(result.messages);
      if (result.safety !== "normal") {
        void captureAndStoreLocation(id, result.safety === "emergency");
      }
    } catch {
      setMessages((m) => [
        ...m,
        { id: `err-${m.length}`, role: "nikki", text: "I am having a little trouble right now. Please try again in a moment.", createdAt: 0 },
      ]);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (initialAsk && !askedRef.current) {
      askedRef.current = true;
      void send(initialAsk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAsk]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<NikkiHeader name={name} nextEvent={data.nextEvent} weather={data.weather} hasChat={messages.length > 0} onRefresh={onRefresh} />}
        renderItem={({ item }) => <ChatBubble message={item} />}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      />
      <View style={styles.dock}>
        <QuickChips items={QUICK_ACTIONS} onPick={send} />
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message Nikki…"
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            onSubmitEditing={() => send(input)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            onPress={() => send(input)}
            disabled={sending}
            style={({ pressed }) => [styles.send, pressed ? styles.pressed : null, sending ? styles.pressed : null]}
          >
            <Icon name="send" color="onPrimary" size={theme.iconSize.md} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function NikkiHeader({
  name,
  nextEvent,
  weather,
  hasChat,
  onRefresh,
}: {
  name: string | null;
  nextEvent: CalendarEvent | null;
  weather: Weather;
  hasChat: boolean;
  onRefresh: () => void;
}): React.ReactElement {
  const intro = name ? `${greeting()}, ${name}.` : `${greeting()}.`;
  const eventLine = nextEvent
    ? `Today at ${formatTime(nextEvent.start_at)}: ${nextEvent.user_friendly_summary ?? nextEvent.title}.`
    : "You have a calm, open day today.";

  return (
    <Stack gap="lg" style={styles.header}>
      <View style={styles.introRow}>
        <Text variant="display" style={styles.introText}>
          {intro}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          onPress={onRefresh}
          hitSlop={12}
          style={({ pressed }) => [styles.refreshBtn, pressed ? styles.pressed : null]}
        >
          <Icon name="refresh" color="primary" size={theme.iconSize.lg} />
        </Pressable>
      </View>
      <Stack direction="row" gap="md" wrap>
        <View style={styles.pill}>
          <Icon name="calendar" color="primary" size={theme.iconSize.sm} />
          <Text variant="caption" tone="textSecondary" style={styles.pillText}>
            {eventLine}
          </Text>
        </View>
        <View style={styles.pill}>
          <Icon name="weather" color="primary" size={theme.iconSize.sm} />
          <Text variant="caption" tone="textSecondary">
            {weather.temperatureC}°C · {weather.summary}
          </Text>
        </View>
      </Stack>
      {!hasChat ? (
        <NikkiCard message={`I am Nikki, and I am here for you${name ? `, ${name}` : ""}. Ask me anything — what you are doing today, about your family, or the weather.`} />
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg },
  header: { paddingTop: theme.spacing.md, paddingBottom: theme.spacing.lg },
  introRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: theme.spacing.md },
  introText: { flex: 1 },
  refreshBtn: { paddingTop: theme.spacing.xs },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    ...theme.shadows.sm,
  },
  pillText: { maxWidth: 200 },
  dock: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    gap: theme.spacing.sm,
  },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: theme.spacing.sm },
  input: {
    flex: 1,
    minHeight: 56,
    maxHeight: 120,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    color: theme.colors.textPrimary,
    fontFamily: theme.text.body.fontFamily,
    fontSize: theme.text.body.fontSize,
  },
  send: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.9 },
});
