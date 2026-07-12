// app/user/people.tsx — the older adult sees familiar faces and can ask Nikki about anyone.
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Button, Icon, Screen, Stack, Text } from "../../src/primitives";
import Avatar from "../../src/components/shared/Avatar";
import StateView from "../../src/components/shared/StateView";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { getPhotoUrl, listPeople } from "../../src/services/peopleService";
import { useT } from "../../src/i18n";
import type { FamilyPerson } from "../../src/types/database";

type PeopleData = { people: FamilyPerson[]; photos: Record<string, string | null> };

export default function PeopleScreen(): React.ReactElement {
  const { t } = useT();
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

  function askNikki(person: FamilyPerson): void {
    setSelected(null);
    router.push({
      pathname: "/user/nikki",
      params: { ask: t("people.whoIs", { name: person.preferred_name ?? person.full_name }) },
    });
  }

  return (
    <Screen padded={false}>
      <View style={styles.bar}>
        <AppBar title={t("people.title")} />
      </View>
      <StateView
        state={state}
        onRetry={reload}
        loadingLabel={t("people.loading")}
        isEmpty={(d) => d.people.length === 0}
        emptyIcon="people"
        emptyTitle={t("people.emptyTitle")}
        emptySubtitle={t("people.emptySubtitle")}
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
                accessibilityLabel={item.relationship_label ? `${item.preferred_name ?? item.full_name}, ${item.relationship_label}` : (item.preferred_name ?? item.full_name)}
                onPress={() => setSelected(item)}
                style={({ pressed }) => [styles.personCard, theme.shadows.card, pressed ? styles.pressed : null]}
              >
                <Avatar name={item.full_name} photoUri={data.photos[item.id]} size={96} />
                <Text variant="bodyStrong" center numberOfLines={1}>
                  {item.preferred_name ?? item.full_name}
                </Text>
                {item.relationship_label ? (
                  <Text variant="caption" tone="textSecondary" center>
                    {item.relationship_label}
                  </Text>
                ) : null}
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
                    {selected.relationship_label
                      ? t("people.yourRelationship", { relationship: selected.relationship_label.toLowerCase() })
                      : ""}
                    {selected.relationship_label && selected.location_description ? " · " : ""}
                    {selected.location_description
                      ? t("people.lives", { location: selected.location_description })
                      : ""}
                  </Text>
                </Stack>
                {selected.visit_frequency ? (
                  <Text variant="body" center>
                    {selected.visit_frequency}.
                  </Text>
                ) : null}
                <Button label={t("people.askNikkiAbout", { name: selected.preferred_name ?? selected.full_name })} icon="chat" onPress={() => askNikki(selected)} />
                <Pressable accessibilityRole="button" accessibilityLabel={t("people.close")} onPress={() => setSelected(null)} hitSlop={10}>
                  <Text variant="bodyStrong" tone="textSecondary">
                    {t("people.close")}
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
