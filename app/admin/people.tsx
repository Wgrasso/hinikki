// app/admin/people.tsx — family adds and edits the people Nikki can talk about.
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Screen, Text } from "../../src/primitives";
import Avatar from "../../src/components/shared/Avatar";
import ListRow from "../../src/components/shared/ListRow";
import StateView from "../../src/components/shared/StateView";
import PersonFormModal from "../../src/components/admin/PersonFormModal";
import MemoryFormModal from "../../src/components/admin/MemoryFormModal";
import SectionHeader from "../../src/components/admin/SectionHeader";
import { useAsync } from "../../src/utils/useAsync";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { theme } from "../../src/theme";
import { getPhotoUrl, listPeople } from "../../src/services/peopleService";
import { listMemories } from "../../src/services/memoryService";
import type { FamilyPerson, PersonMemory } from "../../src/types/database";

type PeopleData = { people: FamilyPerson[]; photos: Record<string, string | null>; memories: PersonMemory[] };

export default function AdminPeople(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const [formOpen, setFormOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<FamilyPerson | null>(null);
  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null);
  const [memoryFormOpen, setMemoryFormOpen] = useState(false);

  const { state, reload } = useAsync<PeopleData>(async () => {
    const [people, memories] = await Promise.all([listPeople(id), listMemories(id)]);
    const entries = await Promise.all(people.map(async (p) => [p.id, await getPhotoUrl(p.primary_photo_path)] as const));
    return { people, photos: Object.fromEntries(entries), memories };
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

  function openAdd(): void {
    setEditingPerson(null);
    setEditPhotoUrl(null);
    setFormOpen(true);
  }
  function openEdit(person: FamilyPerson, photoUrl: string | null): void {
    setEditingPerson(person);
    setEditPhotoUrl(photoUrl);
    setFormOpen(true);
  }

  return (
    <Screen padded={false}>
      <View style={styles.bar}>
        <AppBar title="People" subtitle="Build Nikki's family memory." rightLabel="Add" onRightPress={openAdd} onRefresh={reload} />
      </View>
      <StateView
        state={state}
        onRetry={reload}
        loadingLabel="Loading people…"
        isEmpty={(d) => d.people.length === 0}
        emptyIcon="people"
        emptyTitle="No people yet"
        emptySubtitle="Add the family, friends and carers Nikki should know about."
        emptyActionLabel="Add the first person"
        onEmptyAction={openAdd}
      >
        {(data) => (
          <FlatList
            data={data.people}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => (
              <ListRow
                title={item.preferred_name ?? item.full_name}
                subtitle={item.relationship_label ?? undefined}
                leading={<Avatar name={item.full_name} photoUri={data.photos[item.id]} size={52} />}
                onPress={() => openEdit(item, data.photos[item.id] ?? null)}
              />
            )}
            ListFooterComponent={
              <View style={styles.memories}>
                <SectionHeader title="Memories" actionLabel="Add a memory" onAction={() => setMemoryFormOpen(true)} />
                {data.memories.length === 0 ? (
                  <Text variant="body" tone="textSecondary">
                    Cherished stories Nikki can gently bring up in conversation.
                  </Text>
                ) : (
                  <View style={styles.memoryList}>
                    {data.memories.map((m) => (
                      <ListRow key={m.id} title={m.title} subtitle={m.approximate_date ?? undefined} showChevron={false} />
                    ))}
                  </View>
                )}
              </View>
            }
          />
        )}
      </StateView>

      <PersonFormModal
        visible={formOpen}
        olderAdultId={id}
        person={editingPerson}
        initialPhotoUrl={editPhotoUrl}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />
      <MemoryFormModal
        visible={memoryFormOpen}
        olderAdultId={id}
        people={state.status === "loaded" ? state.data.people : []}
        onClose={() => setMemoryFormOpen(false)}
        onSaved={reload}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: theme.spacing.lg },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  sep: { height: theme.spacing.sm },
  memories: { marginTop: theme.spacing.xl, gap: theme.spacing.sm },
  memoryList: { gap: theme.spacing.sm },
});
