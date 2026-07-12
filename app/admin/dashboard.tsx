// app/admin/dashboard.tsx — the family's overview: what Nikki is asking, where things stand,
// and what still needs setup. "Nikki asks" and "Conversations" are the human-in-the-loop
// review surface (plan §4.3/§4.6); realtime + focus refetch keep them fresh without pull.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Card, Icon, Screen, Stack, Text } from "../../src/primitives";
import SectionHeader from "../../src/components/admin/SectionHeader";
import ProposalsSection from "../../src/components/admin/ProposalsSection";
import ListRow from "../../src/components/shared/ListRow";
import StateView from "../../src/components/shared/StateView";
import BottomSheetModal from "../../src/components/shared/BottomSheetModal";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { formatTime, relativeTimeLabel } from "../../src/utils/format";
import { getOlderAdult } from "../../src/services/profileService";
import { listEvents, listTodayEvents } from "../../src/services/calendarService";
import { listTodayReminders } from "../../src/services/reminderService";
import { getLatestLocation, listSafeLocations } from "../../src/services/locationService";
import { listEmergencyContacts, listEmergencyEvents } from "../../src/services/emergencyService";
import { listPeople } from "../../src/services/peopleService";
import { listPendingProposals, listRecaps } from "../../src/services/proposalService";
import { registerAndSaveToken } from "../../src/services/pushService";
import { registerForPush, sendPush } from "../../src/features/notifications/push";
import { FEATURE_HELP_TAB, FEATURE_TEST_PUSH_NOTIFICATION } from "../../src/lib/constants";
import { useT } from "../../src/i18n";
import type { CalendarEvent, EmergencyEvent, FamilyPerson, LocationUpdate, NikkiProposal, OlderAdultProfile, RecapChange, Reminder } from "../../src/types/database";
import type { SetupChecklistItem } from "../../src/types/domain";

type DashboardData = {
  adult: OlderAdultProfile | null;
  latest: LocationUpdate | null;
  today: CalendarEvent[];
  reminders: Reminder[];
  alerts: EmergencyEvent[];
  people: FamilyPerson[];
  checklist: SetupChecklistItem[];
  proposals: NikkiProposal[];
  recaps: NikkiProposal[];
};

// The recap payload is written by fixed app code (plan §4.6) but arrives as JSON — read it defensively.
function recapSummary(recap: NikkiProposal): string | null {
  const s = recap.payload?.summary;
  return typeof s === "string" && s.trim().length > 0 ? s.trim() : null;
}
function recapChanges(recap: NikkiProposal): RecapChange[] {
  const raw = recap.payload?.changes;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is RecapChange => typeof c === "object" && c !== null && typeof (c as RecapChange).label === "string");
}

export default function AdminDashboard(): React.ReactElement {
  const { t } = useT();
  const router = useRouter();
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (FEATURE_TEST_PUSH_NOTIFICATION) void registerForPush().then(setPushToken);
    void registerAndSaveToken(); // persist this admin device's token so Nikki's questions can reach it (plan §4.5)
  }, []);

  const { state, reload } = useAsync<DashboardData>(async () => {
    const [adult, latest, today, reminders, alerts, people, events, safe, contacts, proposals, recaps] = await Promise.all([
      getOlderAdult(id),
      getLatestLocation(id),
      listTodayEvents(id),
      listTodayReminders(id),
      listEmergencyEvents(id),
      listPeople(id),
      listEvents(id),
      listSafeLocations(id),
      listEmergencyContacts(id),
      listPendingProposals(id),
      listRecaps(id, 20),
    ]);
    const checklist: SetupChecklistItem[] = [
      { key: "people", label: t("admin.checklist.people"), done: people.length > 0 },
      { key: "schedule", label: t("admin.checklist.schedule"), done: events.length > 0 },
      ...(FEATURE_HELP_TAB
        ? [
            { key: "safe", label: t("admin.checklist.safe"), done: safe.length > 0 },
            { key: "contacts", label: t("admin.checklist.contacts"), done: contacts.length > 0 },
          ]
        : []),
    ];
    return { adult, latest, today, reminders, alerts: alerts.filter((a) => a.status === "open"), people, checklist, proposals, recaps };
  }, [id]);

  // Refetch on focus and on live changes; stale-while-refresh keeps it flicker-free.
  // Skip the first focus callback — it fires on initial mount, where useAsync has just
  // started the same load, and reloading would run the 11 queries twice.
  const focusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnceRef.current) {
        focusedOnceRef.current = true;
        return;
      }
      reload();
    }, [reload]),
  );
  useEffect(() => {
    if (!id) return;
    return subscribeLive(id, () => reload());
  }, [id, reload]);

  async function notify(person: FamilyPerson): Promise<void> {
    setPickerOpen(false);
    if (!pushToken) {
      Alert.alert(
        t("adminDash.pushTitle"),
        Platform.OS === "web" ? t("adminDash.pushWebOnly") : t("adminDash.pushAllow"),
      );
      return;
    }
    const r = await sendPush(pushToken, "HiNikki", t("adminDash.pushTestBody", { name: person.full_name }));
    Alert.alert(
      r.ok ? t("adminDash.pushSent") : t("adminDash.pushFailed"),
      r.ok ? t("adminDash.pushSentBody", { name: person.full_name }) : r.message,
    );
  }

  return (
    <Screen scroll>
      <StateView state={state} onRetry={reload} loadingLabel={t("adminDash.loading")}>
        {(data) => (
          <Stack gap="lg">
            <AppBar
              title={
                data.adult?.preferred_name
                  ? t("adminDash.titlePossessive", { name: data.adult.preferred_name })
                  : data.adult?.display_name
                    ? t("adminDash.titleName", { name: data.adult.display_name })
                    : t("adminDash.titleYour")
              }
              subtitle={t("adminDash.subtitle")}
            />

            {data.alerts.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("adminDash.alertsOpen")}
                onPress={() => router.push("/admin/safety")}
                style={({ pressed }) => (pressed ? styles.pressed : null)}
              >
                <Card tone="surface" elevation="lg" style={styles.alert}>
                  <Stack direction="row" gap="md" align="center">
                    <Icon name="warning" color="danger" size={theme.iconSize.lg} />
                    <Stack flex gap="xs">
                      <Text variant="bodyStrong" tone="danger">
                        {data.alerts.length === 1
                          ? t("adminDash.alertsOne", { count: 1 })
                          : t("adminDash.alertsMany", { count: data.alerts.length })}
                      </Text>
                      <Text variant="body" tone="textSecondary">
                        {t("adminDash.alertsBody", { name: data.adult?.preferred_name ?? t("adminDash.alertsTheyFallback") })}
                      </Text>
                    </Stack>
                    <Icon name="chevron" color="danger" size={theme.iconSize.md} />
                  </Stack>
                </Card>
              </Pressable>
            ) : null}

            {FEATURE_HELP_TAB ? (
              <Card elevation="card">
                <Stack direction="row" gap="md" align="center">
                  <Icon name="location" color="primary" size={theme.iconSize.lg} />
                  <Stack flex gap="xs">
                    <Text variant="overline" tone="textSecondary">
                      {t("adminDash.lastLocation")}
                    </Text>
                    <Text variant="bodyStrong">
                      {data.latest ? t("admin.seen", { time: relativeTimeLabel(data.latest.created_at, undefined, t) }) : t("admin.notShared")}
                    </Text>
                  </Stack>
                </Stack>
              </Card>
            ) : null}

            {/* Always mounted (it renders null when empty) so its failed-approval cards
                survive reloads that empty the pending list. */}
            <ProposalsSection olderAdultId={id} proposals={data.proposals} onChanged={reload} />


            {data.recaps.length > 0 ? (
              <View>
                <SectionHeader title={t("adminDash.conversations")} />
                <Stack gap="sm">
                  {data.recaps.map((recap) => (
                    <Card key={recap.id} bordered elevation="none">
                      <Stack gap="sm">
                        <Text variant="caption" tone="textTertiary">
                          {relativeTimeLabel(recap.created_at, undefined, t, { withClockTime: true })}
                        </Text>
                        <Text variant="body">{recapSummary(recap) ?? t("adminDash.conversationFallback")}</Text>
                        {recapChanges(recap).length > 0 ? (
                          <View style={styles.pillRow}>
                            {recapChanges(recap).map((change, i) => (
                              <View key={`${recap.id}-${i}`} style={styles.pill}>
                                <Text variant="caption" tone="textSecondary">
                                  {change.label}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              </View>
            ) : null}

            <View>
              <SectionHeader title={t("adminDash.today")} />
              {data.today.length === 0 ? (
                <Card bordered elevation="none">
                  <Text variant="body" tone="textSecondary">
                    {t("adminDash.noEventsToday")}
                  </Text>
                </Card>
              ) : (
                <Stack gap="sm">
                  {data.today.map((e) => (
                    <ListRow key={e.id} title={e.user_friendly_summary ?? e.title} subtitle={formatTime(e.start_at)} showChevron={false} />
                  ))}
                </Stack>
              )}
            </View>

            <View>
              <SectionHeader title={t("admin.reminders")} />
              {data.reminders.length === 0 ? (
                <Card bordered elevation="none">
                  <Text variant="body" tone="textSecondary">
                    {t("adminDash.noReminders")}
                  </Text>
                </Card>
              ) : (
                <Stack gap="sm">
                  {data.reminders.map((r) => (
                    <ListRow key={r.id} title={r.title} subtitle={r.scheduled_at ? formatTime(r.scheduled_at) : t("admin.anytime")} showChevron={false} />
                  ))}
                </Stack>
              )}
            </View>

            {FEATURE_TEST_PUSH_NOTIFICATION ? (
              <View>
                <SectionHeader title={t("adminDash.notifications")} />
                <Button label={t("adminDash.testPush")} icon="send" variant="secondary" onPress={() => setPickerOpen(true)} />
              </View>
            ) : null}
          </Stack>
        )}
      </StateView>

      {FEATURE_TEST_PUSH_NOTIFICATION ? (
        <BottomSheetModal
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          title={t("adminDash.pushPickerTitle")}
          subtitle={t("adminDash.pushPickerSubtitle")}
          maxHeightPercent={80}
        >
          {state.status === "loaded" && state.data.people.length > 0 ? (
            <Stack gap="sm">
              {state.data.people.map((p) => (
                <ListRow key={p.id} title={p.full_name} subtitle={p.relationship_label ?? undefined} onPress={() => notify(p)} />
              ))}
            </Stack>
          ) : (
            <Text variant="body" tone="textSecondary">
              {t("adminDash.pushPickerEmpty")}
            </Text>
          )}
          <Button label={t("common.cancel")} variant="secondary" onPress={() => setPickerOpen(false)} />
        </BottomSheetModal>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  alert: { borderLeftWidth: 4, borderLeftColor: theme.colors.danger },
  pressed: { opacity: 0.7 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  pill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
});
