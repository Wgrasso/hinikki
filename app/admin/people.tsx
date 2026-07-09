// app/admin/people.tsx — family adds and edits the people Nikki can talk about.
import React, { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useAppState } from "../../src/auth/appState";
import { AppBar, Screen } from "../../src/primitives";
import Avatar from "../../src/components/shared/Avatar";
import ListRow from "../../src/components/shared/ListRow";
import StateView from "../../src/components/shared/StateView";
import PersonFormModal from "../../src/components/admin/PersonFormModal";
import { useAsync } from "../../src/utils/useAsync";
import { theme } from "../../src/theme";
import { getPhotoUrl, listPeople } from "../../src/services/peopleService";
import type { FamilyPerson } from "../../src/types/database";

type PeopleData = { people: FamilyPerson[]; photos: Record<string, string | null> };

export default function AdminPeople(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const id = olderAdultId ?? "";
  const [editing, setEditing] = useState<FamilyPerson | null>(null);
  const [adding, setAdding] = useState(false);

  const { state, reload } = useAsync<PeopleData>(async () => {
    const people = await listPeople(id);
    const entries = await Promise.all(people.map(async (p) => [p.id, await getPhotoUrl(p.primary_photo_path)] as const));
    return { people, photos: Object.fromEntries(entries) };
  }, [id]);

  return (
    <Screen padded={false}>
      <View style={styles.bar}>
        <AppBar title="People" subtitle="Build Nikki's family memory." rightLabel="Add" onRightPress={() => setAdding(true)} onRefresh={reload} />
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
        onEmptyAction={() => setAdding(true)}
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
                subtitle={item.relationship_label ?? "Family"}
                leading={<Avatar name={item.full_name} photoUri={data.photos[item.id]} size={52} />}
                onPress={() => setEditing(item)}
              />
            )}
          />
        )}
      </StateView>

      <PersonFormModal visible={adding} olderAdultId={id} onClose={() => setAdding(false)} onSaved={reload} />
      <PersonFormModal visible={editing !== null} olderAdultId={id} person={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: theme.spacing.lg },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  sep: { height: theme.spacing.sm },
});
