// app/user/people.tsx — the older adult sees familiar faces and can ask Nikki about anyone.
import React, { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Icon, Screen, Stack, Text } from "../../src/primitives";
import Avatar from "../../src/components/shared/Avatar";
import StateView from "../../src/components/shared/StateView";
import { useAsync } from "../../src/utils/useAsync";
import { theme } from "../../src/theme";
import { getPhotoUrl, listPeople } from "../../src/services/peopleService";
import type { FamilyPerson } from "../../src/types/database";

type PeopleData = { people: FamilyPerson[]; photos: Record<string, string | null> };

export default function PeopleScreen(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const router = useRouter();
  const [selected, setSelected] = useState<FamilyPerson | null>(null);

  const { state, reload } = useAsync<PeopleData>(async () => {
    const people = (await listPeople(id)).filter((p) => p.can_nikki_mention);
    const entries = await Promise.all(
      people.map(async (p) => [p.id, await getPhotoUrl(p.primary_photo_path)] as const),
    );
    return { people, photos: Object.fromEntries(entries) };
  }, [id]);

  function askNikki(person: FamilyPerson): void {
    setSelected(null);
    router.push({ pathname: "/user/nikki", params: { ask: `Who is ${person.preferred_name ?? person.full_name}?` } });
  }

  return (
    <Screen padded={false}>
      <View style={styles.bar}>
        <AppBar title="My people" onRefresh={reload} />
      </View>
      <StateView
        state={state}
        onRetry={reload}
        loadingLabel="Finding your family…"
        isEmpty={(d) => d.people.length === 0}
        emptyIcon="people"
        emptyTitle="No family added yet"
        emptySubtitle="Your family can add familiar faces here, and then I can tell you all about them."
      >
        {(data) => (
          <FlatList
            data={data.people}
            keyExtractor={(p) => p.id}
            numColumns={2}
            columnWrapperStyle={styles.column}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.preferred_name ?? item.full_name}, ${item.relationship_label ?? "family"}`}
                onPress={() => setSelected(item)}
                style={({ pressed }) => [styles.personCard, theme.shadows.card, pressed ? styles.pressed : null]}
              >
                <Avatar name={item.full_name} photoUri={data.photos[item.id]} size={96} />
                <Text variant="bodyStrong" center numberOfLines={1}>
                  {item.preferred_name ?? item.full_name}
                </Text>
                <Text variant="caption" tone="textSecondary" center>
                  {item.relationship_label ?? "Family"}
                </Text>
              </Pressable>
            )}
          />
        )}
      </StateView>

      <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {selected ? (
              <Stack gap="lg" align="center">
                <Avatar name={selected.full_name} photoUri={state.status === "loaded" ? state.data.photos[selected.id] : null} size={120} />
                <Stack gap="xs" align="center">
                  <Text variant="title">{selected.preferred_name ?? selected.full_name}</Text>
                  <Text variant="body" tone="textSecondary" center>
                    Your {(selected.relationship_label ?? "family").toLowerCase()}
                    {selected.location_description ? ` · lives ${selected.location_description}` : ""}
                  </Text>
                </Stack>
                {selected.visit_frequency ? (
                  <Text variant="body" center>
                    {selected.visit_frequency}.
                  </Text>
                ) : null}
                <Button label={`Ask Nikki about ${selected.preferred_name ?? selected.full_name}`} icon="chat" onPress={() => askNikki(selected)} />
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setSelected(null)} hitSlop={10}>
                  <Text variant="bodyStrong" tone="textSecondary">
                    Close
                  </Text>
                </Pressable>
              </Stack>
            ) : null}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: theme.spacing.lg },
  grid: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.lg },
  column: { gap: theme.spacing.lg },
  personCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  pressed: { opacity: 0.92 },
  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "center", padding: theme.spacing.lg },
  sheet: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl, padding: theme.spacing.xl, ...theme.shadows.lg },
});
