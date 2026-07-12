// app/user/nikki.tsx — the older adult's home: a warm greeting, today's next thing, the weather,
// and the voice conversation with Nikki (one big talk button; captions of what she says).
// The `ask` param (from Help's "I am lost" or People's "Who is …?") auto-starts the session
// and speaks that phrase on the user's behalf.
import React, { useCallback, useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { Icon, Screen, Stack, Text } from "../../src/primitives";
import VoiceExperience from "../../src/components/user/VoiceExperience";
import StateView from "../../src/components/shared/StateView";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { greetingKey, formatTime } from "../../src/utils/format";
import { useT } from "../../src/i18n";
import { getNextEvent } from "../../src/services/calendarService";
import { getWeather, localityCandidates } from "../../src/services/weatherService";
import { openWeather } from "../../src/utils/openMaps";
import { getOlderAdult } from "../../src/services/profileService";
import type { WeatherSnapshot as Weather } from "../../src/types/domain";
import type { CalendarEvent, OlderAdultProfile } from "../../src/types/database";

type NikkiData = {
  adult: OlderAdultProfile | null;
  nextEvent: CalendarEvent | null;
  weather: Weather | null;
};

export default function NikkiScreen(): React.ReactElement {
  const { t } = useT();
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const params = useLocalSearchParams<{ ask?: string }>();
  const initialAsk = typeof params.ask === "string" ? params.ask : null;

  const { state, reload } = useAsync<NikkiData>(async () => {
    const [adult, nextEvent] = await Promise.all([getOlderAdult(id), getNextEvent(id)]);
    // Weather needs the home address; the service caches, so this is instant after first load.
    const weather = await getWeather(adult?.home_address ?? null);
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

  // No page scroll here on purpose: the voice screen is a fixed column — header on top,
  // captions auto-scrolling in the middle, the talk button pinned at the bottom.
  return (
    <Screen>
      <StateView state={state} onRetry={reload} loadingLabel={t("nikki.wakingUp")}>
        {(data) => {
          const name = data.adult?.preferred_name ?? null;
          // The town the weather is for (from the home address) — shown beside the weather.
          const weatherCity = localityCandidates(data.adult?.home_address ?? null)[0] ?? null;
          return (
            <View style={styles.column}>
              <NikkiHeader name={name} nextEvent={data.nextEvent} weather={data.weather} city={weatherCity} />
              <View style={styles.voice}>
                <VoiceExperience olderAdultId={id} preferredName={name} initialAsk={initialAsk} />
              </View>
            </View>
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
  city,
}: {
  name: string | null;
  nextEvent: CalendarEvent | null;
  weather: Weather | null;
  city: string | null;
}): React.ReactElement {
  const { t } = useT();
  const greetingText = t(greetingKey());
  const intro = name
    ? t("nikki.intro.named", { greeting: greetingText, name })
    : t("nikki.intro.plain", { greeting: greetingText });
  const eventLine = nextEvent
    ? t("nikki.eventAt", {
        time: formatTime(nextEvent.start_at),
        summary: nextEvent.user_friendly_summary ?? nextEvent.title,
      })
    : t("nikki.calmDay");

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
        {weather ? (
          <Pressable
            onPress={city ? () => void openWeather(city) : undefined}
            disabled={!city}
            accessibilityRole={city ? "button" : undefined}
            accessibilityLabel={city ? t("nikki.openWeather", { city }) : undefined}
            style={({ pressed }) => [styles.pill, pressed && city ? styles.pillPressed : null]}
          >
            <Icon name="weather" color="primary" size={theme.iconSize.sm} />
            <Text variant="caption" tone="textSecondary" style={styles.pillText}>
              {weather.temperatureC}°C · {weather.summary}
              {city ? ` · ${city}` : ""}
            </Text>
          </Pressable>
        ) : null}
      </Stack>
    </Stack>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  voice: { flex: 1, marginTop: theme.spacing.lg },
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
  pillText: { maxWidth: 220 },
  pillPressed: { opacity: 0.6 },
});
