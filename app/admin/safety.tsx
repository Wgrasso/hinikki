// app/admin/safety.tsx — location, safe places, emergency contacts, and the alert log in one place.
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Card, Icon, Screen, Stack, Text } from "../../src/primitives";
import SectionHeader from "../../src/components/admin/SectionHeader";
import ListRow from "../../src/components/shared/ListRow";
import StateView from "../../src/components/shared/StateView";
import QuickAddModal from "../../src/components/admin/QuickAddModal";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { relativeTimeLabel } from "../../src/utils/format";
import { createSafeLocation, getLatestLocation, listSafeLocations, updateSafeLocation } from "../../src/services/locationService";
import { createEmergencyContact, listEmergencyContacts, listEmergencyEvents, resolveEmergencyEvent, updateEmergencyContact } from "../../src/services/emergencyService";
import { openMapLocation } from "../../src/utils/openMaps";
import { useT } from "../../src/i18n";
import type { EmergencyContact, EmergencyEvent, LocationUpdate, SafeLocation } from "../../src/types/database";

type TFn = (key: string, params?: Record<string, string | number>) => string;

type SafetyData = {
  latest: LocationUpdate | null;
  safe: SafeLocation[];
  contacts: EmergencyContact[];
  events: EmergencyEvent[];
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

  const { state, reload } = useAsync<SafetyData>(async () => {
    const [latest, safe, contacts, events] = await Promise.all([
      getLatestLocation(id),
      listSafeLocations(id),
      listEmergencyContacts(id),
      listEmergencyEvents(id),
    ]);
    return { latest, safe, contacts, events };
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

  async function handleResolve(id: string): Promise<void> {
    setResolvingId(id);
    try {
      await resolveEmergencyEvent(id);
      reload();
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <Screen scroll>
      <AppBar title={t("adminSafety.title")} subtitle={t("adminSafety.subtitle")} />
      <StateView state={state} onRetry={reload} loadingLabel={t("adminSafety.loading")}>
        {(data) => {
          const needsSafePlace = data.safe.length === 0;
          const needsContact = !data.contacts.some((c) => (c.phone ?? "").trim().length > 0);
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
                      <Text variant="caption" tone="textSecondary">
                        {data.latest.latitude.toFixed(4)}, {data.latest.longitude.toFixed(4)}
                      </Text>
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
                      <ListRow key={s.id} title={s.name} subtitle={s.address ?? s.location_type ?? t("adminSafety.safePlaceFallback")} onPress={() => setEditPlace(s)} accessibilityLabel={t("admin.editName", { name: s.name })} />
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
                      <ListRow key={c.id} title={c.name} subtitle={`${c.relationship ?? t("adminSafety.contactFallback")}${c.phone ? ` · ${c.phone}` : ""}`} onPress={() => setEditContact(c)} accessibilityLabel={t("admin.editName", { name: c.name })} />
                    ))
                  )}
                </Stack>
              </View>
            </View>

            <View>
              <SectionHeader title={t("adminSafety.recentAlerts")} />
              <Stack gap="sm">
                {data.events.length === 0 ? (
                  <EmptyHint text={t("adminSafety.alertsEmpty")} />
                ) : (
                  data.events.map((e) => (
                    <Card key={e.id} elevation="card">
                      <Stack gap="md">
                        <Stack direction="row" gap="md" align="center">
                          <Icon
                            name={e.status === "resolved" ? "check" : "warning"}
                            color={e.status === "resolved" ? "success" : "danger"}
                            size={theme.iconSize.md}
                          />
                          <Stack flex gap="xs">
                            <Text variant="bodyStrong">{alertTitle(e.event_type, t)}</Text>
                            <Text variant="caption" tone="textSecondary">
                              {e.detected_urgency} · {relativeTimeLabel(e.created_at, undefined, t)}
                            </Text>
                          </Stack>
                        </Stack>
                        {e.status === "resolved" ? (
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
                  ))
                )}
              </Stack>
            </View>
          </Stack>
          );
        }}
      </StateView>

      <QuickAddModal
        visible={placeVisible}
        title={editPlace ? t("adminSafety.editPlace") : t("adminSafety.addPlace")}
        submitLabel={editPlace ? t("common.saveChanges") : t("common.save")}
        initialValues={editPlace ? { name: editPlace.name, address: editPlace.address ?? "" } : undefined}
        fields={[
          { key: "name", label: t("adminSafety.fieldName"), placeholder: t("adminSafety.placeNamePlaceholder"), required: true },
          { key: "address", label: t("adminSafety.fieldAddress"), placeholder: t("common.optional") },
        ]}
        onClose={() => {
          setAddingPlace(false);
          setEditPlace(null);
        }}
        onSubmit={async (v) => {
          if (editPlace) {
            await updateSafeLocation(editPlace.id, { name: v.name, address: v.address || null });
          } else {
            await createSafeLocation(id, { name: v.name, address: v.address ?? null, location_type: "familiar" });
          }
          reload();
        }}
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
  // The amber outline that marks a required-but-missing section, matching the header "!" and tab badge.
  missingBox: {
    borderWidth: 2,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
});
