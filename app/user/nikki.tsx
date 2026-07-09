// app/user/nikki.tsx — the older adult's home: a warm greeting, today's next thing, the weather,
// and the voice conversation with Nikki (one big talk button; captions of what she says).
// The `ask` param (from Help's "I am lost" or People's "Who is …?") auto-starts the session
// and speaks that phrase on the user's behalf.
import React, { useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { Icon, Screen, Stack, Text } from "../../src/primitives";
import VoiceExperience from "../../src/components/user/VoiceExperience";
import StateView from "../../src/components/shared/StateView";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { greeting, formatTime } from "../../src/utils/format";
import { getNextEvent } from "../../src/services/calendarService";
import { getWeather } from "../../src/services/weatherService";
import { getOlderAdult } from "../../src/services/profileService";
import type { WeatherSnapshot as Weather } from "../../src/types/domain";
import type { CalendarEvent, OlderAdultProfile } from "../../src/types/database";

type NikkiData = {
  adult: OlderAdultProfile | null;
  nextEvent: CalendarEvent | null;
  weather: Weather;
};

export default function NikkiScreen(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const params = useLocalSearchParams<{ ask?: string }>();
  const initialAsk = typeof params.ask === "string" ? params.ask : null;

  const { state, reload } = useAsync<NikkiData>(async () => {
    const [adult, nextEvent, weather] = await Promise.all([
      getOlderAdult(id),
      getNextEvent(id),
      getWeather(id),
    ]);
    return { adult, nextEvent, weather };
  }, [id]);

  // Refetch on focus and on live changes; stale-while-refresh keeps it flicker-free.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  useEffect(() => {
    if (!id) return;
    return subscribeLive(id, () => reload());
  }, [id, reload]);

  return (
    <Screen scroll>
      <StateView state={state} onRetry={reload} loadingLabel="Waking Nikki up…">
        {(data) => {
          const name = data.adult?.preferred_name ?? null;
          return (
            <Stack gap="lg">
              <NikkiHeader name={name} nextEvent={data.nextEvent} weather={data.weather} />
              <VoiceExperience olderAdultId={id} preferredName={name} initialAsk={initialAsk} />
            </Stack>
          );
        }}
      </StateView>
    </Screen>
  );
}

function NikkiHeader({
  name,
  nextEvent,
  weather,
}: {
  name: string | null;
  nextEvent: CalendarEvent | null;
  weather: Weather;
}): React.ReactElement {
  const intro = name ? `${greeting()}, ${name}.` : `${greeting()}.`;
  const eventLine = nextEvent
    ? `Today at ${formatTime(nextEvent.start_at)}: ${nextEvent.user_friendly_summary ?? nextEvent.title}.`
    : "You have a calm, open day today.";

  return (
    <Stack gap="lg" style={styles.header}>
      <Text variant="display">{intro}</Text>
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
    </Stack>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: theme.spacing.md },
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
});
