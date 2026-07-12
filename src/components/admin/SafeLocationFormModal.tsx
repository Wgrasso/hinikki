// src/components/admin/SafeLocationFormModal.tsx — add/edit a safe place by NAME + a pin on a map
// (no address typing). The pin's coordinates are stored, and its reverse-geocoded address is kept
// as a readable label.
import React, { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Stack } from "../../primitives";
import BottomSheetModal from "../shared/BottomSheetModal";
import LocationPicker, { type PickedLocation } from "../shared/LocationPicker";
import { createSafeLocation, updateSafeLocation } from "../../services/locationService";
import { useT } from "../../i18n";
import type { SafeLocation } from "../../types/database";

type Props = {
  visible: boolean;
  olderAdultId: string;
  place?: SafeLocation | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function SafeLocationFormModal({ visible, olderAdultId, place, onClose, onSaved }: Props): React.ReactElement {
  const { t } = useT();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setName(place?.name ?? "");
    setPicked(
      place && place.latitude != null && place.longitude != null
        ? { latitude: place.latitude, longitude: place.longitude, address: place.address ?? null }
        : null,
    );
  }, [visible, place]);

  async function save(): Promise<void> {
    if (name.trim().length === 0) {
      setError(t("adminSafety.fieldName"));
      return;
    }
    if (!picked) {
      setError(t("locationPicker.tapToPlace"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patch = { name: name.trim(), address: picked.address, latitude: picked.latitude, longitude: picked.longitude };
      if (place) await updateSafeLocation(place.id, patch);
      else await createSafeLocation(olderAdultId, { ...patch, location_type: "familiar" });
      onSaved();
      onClose();
    } catch {
      setError(t("adminForms.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title={place ? t("adminSafety.editPlace") : t("adminSafety.addPlace")}>
      <Field
        label={t("adminSafety.fieldName")}
        value={name}
        onChangeText={setName}
        placeholder={t("adminSafety.placeNamePlaceholder")}
        error={error}
      />
      <LocationPicker
        value={picked ? { latitude: picked.latitude, longitude: picked.longitude } : null}
        address={picked?.address ?? null}
        onChange={setPicked}
      />
      <Stack gap="sm" style={styles.actions}>
        <Button label={place ? t("common.saveChanges") : t("common.save")} icon="check" loading={saving} onPress={save} />
        <Button label={t("common.cancel")} variant="secondary" disabled={saving} onPress={onClose} />
      </Stack>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({ actions: { marginTop: theme.spacing.sm } });
