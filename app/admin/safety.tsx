// app/admin/safety.tsx — location, safe places, emergency contacts, and the alert log in one place.
import React, { useState } from "react";
import { View } from "react-native";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Card, Icon, Screen, Stack, Text } from "../../src/primitives";
import SectionHeader from "../../src/components/admin/SectionHeader";
import ListRow from "../../src/components/shared/ListRow";
import StateView from "../../src/components/shared/StateView";
import QuickAddModal from "../../src/components/admin/QuickAddModal";
import { useAsync } from "../../src/utils/useAsync";
import { theme } from "../../src/theme";
import { relativeTimeLabel } from "../../src/utils/format";
import { createSafeLocation, getLatestLocation, listSafeLocations } from "../../src/services/locationService";
import { createEmergencyContact, listEmergencyContacts, listEmergencyEvents } from "../../src/services/emergencyService";
import type { EmergencyContact, EmergencyEvent, LocationUpdate, SafeLocation } from "../../src/types/database";

type SafetyData = {
  latest: LocationUpdate | null;
  safe: SafeLocation[];
  contacts: EmergencyContact[];
  events: EmergencyEvent[];
};

export default function AdminSafety(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const [addingPlace, setAddingPlace] = useState(false);
  const [addingContact, setAddingContact] = useState(false);

  const { state, reload } = useAsync<SafetyData>(async () => {
    const [latest, safe, contacts, events] = await Promise.all([
      getLatestLocation(id),
      listSafeLocations(id),
      listEmergencyContacts(id),
      listEmergencyEvents(id),
    ]);
    return { latest, safe, contacts, events };
  }, [id]);

  return (
    <Screen scroll>
      <AppBar title="Safety" subtitle="Where they are, and who to call." />
      <StateView state={state} onRetry={reload} loadingLabel="Loading safety…">
        {(data) => (
          <Stack gap="lg">
            <Card elevation="card">
              <Stack direction="row" gap="md" align="center">
                <Icon name="location" color="primary" size={theme.iconSize.lg} />
                <Stack flex gap="xs">
                  <Text variant="overline" tone="textSecondary">
                    CURRENT LOCATION
                  </Text>
                  <Text variant="bodyStrong">{data.latest ? `Seen ${relativeTimeLabel(data.latest.created_at)}` : "Not shared yet"}</Text>
                  {data.latest ? (
                    <Text variant="caption" tone="textSecondary">
                      {data.latest.latitude.toFixed(4)}, {data.latest.longitude.toFixed(4)}
                    </Text>
                  ) : null}
                </Stack>
              </Stack>
            </Card>

            <View>
              <SectionHeader title="Safe places" actionLabel="Add" onAction={() => setAddingPlace(true)} />
              <Stack gap="sm">
                {data.safe.length === 0 ? (
                  <EmptyHint text="Add home and other familiar places." />
                ) : (
                  data.safe.map((s) => <ListRow key={s.id} title={s.name} subtitle={s.address ?? s.location_type ?? "Safe place"} showChevron={false} />)
                )}
              </Stack>
            </View>

            <View>
              <SectionHeader title="Emergency contacts" actionLabel="Add" onAction={() => setAddingContact(true)} />
              <Stack gap="sm">
                {data.contacts.length === 0 ? (
                  <EmptyHint text="Add the people to call first if something is wrong." />
                ) : (
                  data.contacts.map((c) => <ListRow key={c.id} title={c.name} subtitle={`${c.relationship ?? "Contact"}${c.phone ? ` · ${c.phone}` : ""}`} showChevron={false} />)
                )}
              </Stack>
            </View>

            <View>
              <SectionHeader title="Recent alerts" />
              <Stack gap="sm">
                {data.events.length === 0 ? (
                  <EmptyHint text="No alerts. You will see lost or emergency moments here." />
                ) : (
                  data.events.map((e) => (
                    <ListRow key={e.id} title={alertTitle(e.event_type)} subtitle={`${e.detected_urgency} · ${relativeTimeLabel(e.created_at)}`} showChevron={false} />
                  ))
                )}
              </Stack>
            </View>
          </Stack>
        )}
      </StateView>

      <QuickAddModal
        visible={addingPlace}
        title="Add a safe place"
        fields={[
          { key: "name", label: "Name", placeholder: "e.g. Home", required: true },
          { key: "address", label: "Address", placeholder: "Optional" },
        ]}
        onClose={() => setAddingPlace(false)}
        onSubmit={async (v) => {
          await createSafeLocation(id, { name: v.name, address: v.address ?? null, location_type: "familiar" });
          reload();
        }}
      />
      <QuickAddModal
        visible={addingContact}
        title="Add an emergency contact"
        fields={[
          { key: "name", label: "Name", placeholder: "e.g. Mark", required: true },
          { key: "phone", label: "Phone", placeholder: "e.g. +31 6 …", keyboardType: "phone-pad" },
          { key: "relationship", label: "Relationship", placeholder: "e.g. Son" },
        ]}
        onClose={() => setAddingContact(false)}
        onSubmit={async (v) => {
          await createEmergencyContact(id, { name: v.name, phone: v.phone ?? null, relationship: v.relationship ?? null });
          reload();
        }}
      />
    </Screen>
  );
}

function alertTitle(type: string): string {
  if (type === "lost") return "Felt lost";
  if (type === "distress") return "Asked for help";
  return "Emergency";
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
