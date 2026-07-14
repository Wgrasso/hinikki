// app/admin/safety.tsx — location, safe places, emergency contacts, and the alert log in one place.
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Card, Icon, Screen, Stack, Text } from "../../src/primitives";
import SectionHeader from "../../src/components/admin/SectionHeader";
import ListRow from "../../src/components/shared/ListRow";
import StateView from "../../src/components/shared/StateView";
import QuickAddModal from "../../src/components/admin/QuickAddModal";
import SafeLocationFormModal from "../../src/components/admin/SafeLocationFormModal";
import SwipeToDismiss from "../../src/components/shared/SwipeToDismiss";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { relativeTimeLabel } from "../../src/utils/format";
import { deleteSafeLocation, getLatestLocation, getLocationById, listSafeLocations } from "../../src/services/locationService";
import { createEmergencyContact, deleteEmergencyContact, listEmergencyContacts, listEmergencyEvents, resolveEmergencyEvent, updateEmergencyContact } from "../../src/services/emergencyService";
import { describePlace } from "../../src/features/safety/locationCapture";
import { getHiddenAlertIds, hideAlertId } from "../../src/features/safety/hiddenAlerts";
import { openMapLocation } from "../../src/utils/openMaps";
import { useT } from "../../src/i18n";
import type { EmergencyContact, EmergencyEvent, LocationUpdate, SafeLocation } from "../../src/types/database";

type TFn = (key: string, params?: Record<string, string | number>) => string;

type SafetyData = {
  latest: LocationUpdate | null;
  latestPlace: string | null;
  safe: SafeLocation[];
  contacts: EmergencyContact[];
  events: EmergencyEvent[];
  eventLocations: Record<string, { loc: LocationUpdate; place: string | null }>; // alert id → where it happened (when known)
};

export default function AdminSafety(): React.ReactElement {
  const { t } = useT();
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const [addingPlace, setAddingPlace] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [editPlace, setEditPlace] = useState<SafeLocation | null>(null);
  const [editContact, setEditContact] = useState<EmergencyContact | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // Alerts this admin has swiped away — hidden on THIS device only (personal declutter).
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    void getHiddenAlertIds().then((ids) => setHidden(new Set(ids)));
  }, []);

  const { state, reload } = useAsync<SafetyData>(async () => {
    const [latest, safe, contacts, events] = await Promise.all([
      getLatestLocation(id),
      listSafeLocations(id),
      listEmergencyContacts(id),
      listEmergencyEvents(id),
    ]);
    // Turn the last coordinates into a readable town for the card (never show raw coordinates).
    const latestPlace = latest ? await describePlace(latest.latitude, latest.longitude) : null;
    // Where each alert happened + its town name, so a "lost" alert reads at a glance and opens
    // on the map (spot patterns) — never raw coordinates.
    const withLoc = events.filter((e) => e.location_update_id);
    const eventLocations: Record<string, { loc: LocationUpdate; place: string | null }> = {};
    await Promise.all(
      withLoc.map(async (e) => {
        const loc = await getLocationById(e.location_update_id as string).catch(() => null);
        if (!loc) return;
        const place = await describePlace(loc.latitude, loc.longitude).catch(() => null);
        eventLocations[e.id] = { loc, place };
      }),
    );
    return { latest, latestPlace, safe, contacts, events, eventLocations };
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

  const placeVisible = addingPlace || editPlace !== null;
  const contactVisible = addingContact || editContact !== null;

  // "Mark handled" keeps the alert as history (just flips it to resolved).
  async function handleResolve(id: string): Promise<void> {
    setResolvingId(id);
    try {
      await resolveEmergencyEvent(id);
      reload();
    } finally {
      setResolvingId(null);
    }
  }

  // Swipe-to-hide removes the alert from THIS admin's list only (local); the shared record and
  // its resolved state are untouched, so other admins still see it.
  function handleHide(alertId: string): void {
    setHidden((prev) => new Set(prev).add(alertId));
    void hideAlertId(alertId);
  }

  // Safe places and contacts are SHARED family data: deleting removes them for everyone, so we
  // confirm first (unlike the per-admin alert hide). Reload after, which brings the "!" setup
  // marker back when the last safe place or contact is gone.
  function confirmDeletePlace(place: SafeLocation): void {
    Alert.alert(t("adminSafety.deletePlaceTitle"), t("adminSafety.deleteSharedBody", { name: place.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.remove"),
        style: "destructive",
        onPress: () => void deleteSafeLocation(place.id).then(reload).catch(() => Alert.alert(t("common.somethingWrong"), t("common.tryAgainMoment"))),
      },
    ]);
  }
  function confirmDeleteContact(contact: EmergencyContact): void {
    Alert.alert(t("adminSafety.deleteContactTitle"), t("adminSafety.deleteSharedBody", { name: contact.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.remove"),
        style: "destructive",
        onPress: () => void deleteEmergencyContact(contact.id).then(reload).catch(() => Alert.alert(t("common.somethingWrong"), t("common.tryAgainMoment"))),
      },
    ]);
  }

  return (
    <Screen scroll>
      <AppBar title={t("adminSafety.title")} subtitle={t("adminSafety.subtitle")} />
      <StateView state={state} onRetry={reload} loadingLabel={t("adminSafety.loading")}>
        {(data) => {
          const needsSafePlace = data.safe.length === 0;
          const needsContact = !data.contacts.some((c) => (c.phone ?? "").trim().length > 0);
          // Everything except what this admin has personally swiped away.
          const visibleAlerts = data.events.filter((e) => !hidden.has(e.id));
          return (
          <Stack gap="lg">
            <Card elevation="card">
              <Stack direction="row" gap="md" align="center">
                <Icon name="location" color="primary" size={theme.iconSize.lg} />
                <Stack flex gap="xs">
                  <Text variant="overline" tone="textSecondary">
                    {t("adminSafety.currentLocation")}
                  </Text>
                  <Text variant="bodyStrong">{data.latest ? t("admin.seen", { time: relativeTimeLabel(data.latest.created_at, undefined, t, { withClockTime: true }) }) : t("admin.notShared")}</Text>
                  {data.latest ? (
                    <Pressable
                      onPress={() => void openMapLocation(data.latest!.latitude, data.latest!.longitude, t("adminSafety.lastKnownLocation"))}
                      accessibilityRole="button"
                      accessibilityLabel={t("adminSafety.openLocationA11y")}
                    >
                      {data.latestPlace ? (
                        <Text variant="caption" tone="textSecondary">
                          {t("adminSafety.near", { place: data.latestPlace })}
                        </Text>
                      ) : null}
                      <Stack direction="row" gap="xs" align="center">
                        <Icon name="location" color="primary" size={theme.iconSize.sm} />
                        <Text variant="caption" tone="primary">
                          {t("adminSafety.openInMaps")}
                        </Text>
                      </Stack>
                    </Pressable>
                  ) : null}
                </Stack>
              </Stack>
            </Card>

            <View>
              <SectionHeader title={t("adminSafety.safePlaces")} actionLabel={t("common.add")} onAction={() => setAddingPlace(true)} needsSetup={needsSafePlace} needsSetupLabel={t("adminSafety.needsSetup")} />
              <View style={needsSafePlace ? styles.missingBox : undefined}>
                <Stack gap="sm">
                  {data.safe.length === 0 ? (
                    <Text variant="body" tone="textSecondary">
                      {t("adminSafety.safePlacesEmpty")}
                    </Text>
                  ) : (
                    data.safe.map((s) => (
                      <SwipeToDismiss key={s.id} onDismiss={() => confirmDeletePlace(s)} accessibilityLabel={t("adminSafety.deletePlaceA11y", { name: s.name })}>
                        <ListRow title={s.name} subtitle={s.address ?? s.location_type ?? t("adminSafety.safePlaceFallback")} onPress={() => setEditPlace(s)} accessibilityLabel={t("admin.editName", { name: s.name })} />
                      </SwipeToDismiss>
                    ))
                  )}
                </Stack>
              </View>
            </View>

            <View>
              <SectionHeader title={t("adminSafety.emergencyContacts")} actionLabel={t("common.add")} onAction={() => setAddingContact(true)} needsSetup={needsContact} needsSetupLabel={t("adminSafety.needsSetup")} />
              <View style={needsContact ? styles.missingBox : undefined}>
                <Stack gap="sm">
                  {data.contacts.length === 0 ? (
                    <Text variant="body" tone="textSecondary">
                      {t("adminSafety.contactsEmpty")}
                    </Text>
                  ) : (
                    data.contacts.map((c) => (
                      <SwipeToDismiss key={c.id} onDismiss={() => confirmDeleteContact(c)} accessibilityLabel={t("adminSafety.deleteContactA11y", { name: c.name })}>
                        <ListRow title={c.name} subtitle={`${c.relationship ?? t("adminSafety.contactFallback")}${c.phone ? ` · ${c.phone}` : ""}`} onPress={() => setEditContact(c)} accessibilityLabel={t("admin.editName", { name: c.name })} />
                      </SwipeToDismiss>
                    ))
                  )}
                </Stack>
              </View>
            </View>

            <View>
              <SectionHeader title={t("adminSafety.recentAlerts")} />
              {visibleAlerts.some((e) => e.status !== "resolved") ? (
                <Text variant="caption" tone="textSecondary" style={styles.alertsHint}>
                  {t("adminSafety.recentAlertsHint")}
                </Text>
              ) : null}
              <Stack gap="sm">
                {visibleAlerts.length === 0 ? (
                  <EmptyHint text={t("adminSafety.alertsEmpty")} />
                ) : (
                  visibleAlerts.map((e) => {
                    const isCall = e.event_type === "call_family";
                    const where = data.eventLocations[e.id];
                    const resolved = e.status === "resolved";
                    return (
                    <SwipeToDismiss key={e.id} onDismiss={() => handleHide(e.id)} accessibilityLabel={t("adminSafety.dismissAlert")}>
                      <Card elevation="card">
                        <Stack gap="md">
                          <Stack direction="row" gap="md" align="center">
                            <Icon
                              name={resolved ? "check" : isCall ? "phone" : "location"}
                              color={resolved ? "success" : isCall ? "primary" : "danger"}
                              size={theme.iconSize.md}
                            />
                            <Stack flex gap="xs">
                              <Text variant="bodyStrong">{e.user_message ?? alertTitle(e.event_type, t)}</Text>
                              <Text variant="caption" tone="textSecondary">
                                {relativeTimeLabel(e.created_at, undefined, t, { withClockTime: true })}
                              </Text>
                            </Stack>
                          </Stack>
                          {where ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={t("adminSafety.whereA11y")}
                              onPress={() => void openMapLocation(where.loc.latitude, where.loc.longitude, t("adminSafety.whereLabel"))}
                            >
                              <Stack direction="row" gap="xs" align="center">
                                <Icon name="location" color="primary" size={theme.iconSize.sm} />
                                <Text variant="caption" tone="primary">
                                  {where.place ?? t("adminSafety.whereHappened")}
                                </Text>
                              </Stack>
                            </Pressable>
                          ) : null}
                          {resolved ? (
                            <Text variant="caption" tone="textSecondary">
                              {t("adminSafety.handled")}
                            </Text>
                          ) : (
                            <Button
                              label={t("adminSafety.markHandled")}
                              icon="check"
                              variant="secondary"
                              loading={resolvingId === e.id}
                              onPress={() => void handleResolve(e.id)}
                            />
                          )}
                        </Stack>
                      </Card>
                    </SwipeToDismiss>
                    );
                  })
                )}
              </Stack>
            </View>
          </Stack>
          );
        }}
      </StateView>

      <SafeLocationFormModal
        visible={placeVisible}
        olderAdultId={id}
        place={editPlace}
        onClose={() => {
          setAddingPlace(false);
          setEditPlace(null);
        }}
        onSaved={reload}
      />
      <QuickAddModal
        visible={contactVisible}
        title={editContact ? t("adminSafety.editContact") : t("adminSafety.addContact")}
        note={t("adminSafety.contactNote")}
        submitLabel={editContact ? t("common.saveChanges") : t("common.save")}
        initialValues={editContact ? { name: editContact.name, phone: editContact.phone ?? "", relationship: editContact.relationship ?? "" } : undefined}
        fields={[
          { key: "name", label: t("adminSafety.fieldName"), placeholder: t("adminSafety.contactNamePlaceholder"), required: true },
          { key: "phone", label: t("adminSafety.fieldPhone"), placeholder: t("adminSafety.phonePlaceholder"), keyboardType: "phone-pad" },
          { key: "relationship", label: t("adminSafety.fieldRelationship"), placeholder: t("adminSafety.relationshipPlaceholder") },
        ]}
        onClose={() => {
          setAddingContact(false);
          setEditContact(null);
        }}
        onSubmit={async (v) => {
          if (editContact) {
            await updateEmergencyContact(editContact.id, { name: v.name, phone: v.phone || null, relationship: v.relationship || null });
          } else {
            await createEmergencyContact(id, { name: v.name, phone: v.phone ?? null, relationship: v.relationship ?? null });
          }
          reload();
        }}
      />
    </Screen>
  );
}

// Setup is "complete" once the family has given us somewhere safe and someone to call: at least
// one safe place and at least one emergency contact with a phone. Both are shown, and marked with
// a "!", on the Safety screen — so the tab badge points at exactly what carries a "!" inside.
// Assumes complete until we know otherwise, so a slow or failed read never shows a false nudge;
// a null id or any error simply leaves the badge off.
export function useSafetySetupComplete(olderAdultId: string | null): boolean {
  const [complete, setComplete] = useState(true);
  useEffect(() => {
    if (!olderAdultId) {
      setComplete(true);
      return;
    }
    let active = true;
    const load = (): void => {
      Promise.all([listEmergencyContacts(olderAdultId), listSafeLocations(olderAdultId)])
        .then(([contacts, safe]) => {
          if (!active) return;
          const hasContactWithPhone = contacts.some((c) => (c.phone ?? "").trim().length > 0);
          const hasSafePlace = safe.length > 0;
          setComplete(hasContactWithPhone && hasSafePlace);
        })
        .catch(() => undefined); // a missing badge must never crash the tab bar
    };
    load();
    const unsubscribe = subscribeLive(olderAdultId, () => load());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [olderAdultId]);
  return complete;
}

function alertTitle(type: string, t: TFn): string {
  if (type === "lost") return t("adminSafety.alertLost");
  if (type === "call_family") return t("adminSafety.alertCall");
  if (type === "distress") return t("adminSafety.alertDistress");
  return t("adminSafety.alertEmergency");
}

function EmptyHint({ text }: { text: string }): React.ReactElement {
  return (
    <Card bordered elevation="none">
      <Text variant="body" tone="textSecondary">
        {text}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  // Sits just under the "Recent alerts" header when something is still open, so it's clear these
  // need a look and a "Mark as handled" once checked.
  alertsHint: { marginBottom: theme.spacing.sm },
  // The amber outline that marks a required-but-missing section, matching the header "!" and tab badge.
  missingBox: {
    borderWidth: 2,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
});
