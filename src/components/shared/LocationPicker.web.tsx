// src/components/shared/LocationPicker.web.tsx — web fallback for the native map pin-picker.
// react-native-maps is a native-only module whose import throws under react-native-web (it calls
// codegenNativeComponent, which react-native-web doesn't provide), so on web Metro resolves THIS
// file instead of LocationPicker.tsx. It offers a mapless picker: a best-effort "use my current
// location" button (browser geolocation via expo-location) plus the current address. Precise
// pin-dragging stays in the mobile app. Keeping this file map-free is what stops the whole web
// bundle from crashing at import time (every admin route shares the layout that pulls it in).
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { theme } from "../../theme";
import { Icon, Text } from "../../primitives";
import { useT } from "../../i18n";

// Mirror the native picker's public type exactly — this is a drop-in replacement for web builds.
export type PickedLocation = { latitude: number; longitude: number; address: string | null };

export default function LocationPicker({
  value,
  address,
  onChange,
}: {
  value: { latitude: number; longitude: number } | null;
  address: string | null;
  onChange: (v: PickedLocation) => void;
}): React.ReactElement {
  const { t } = useT();
  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(value);
  const [locating, setLocating] = useState(false);

  async function useCurrent(): Promise<void> {
    setLocating(true);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setMarker(next);
      // Reverse geocoding isn't available on web — store the coordinates; the address can be filled
      // in later from the mobile app.
      onChange({ ...next, address: null });
    } catch {
      // best-effort: leave the picker untouched if the browser denies or lacks geolocation
    } finally {
      setLocating(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.mapBox}>
        <Icon name="location" color="textTertiary" size={theme.iconSize.lg} />
        <Text variant="caption" tone="textSecondary" center>
          {t("locationPicker.webUnavailable")}
        </Text>
      </View>
      <Pressable
        onPress={() => void useCurrent()}
        accessibilityRole="button"
        accessibilityLabel={t("locationPicker.useCurrent")}
        style={({ pressed }) => [styles.currentBtn, pressed ? styles.pressed : null]}
      >
        {locating ? <ActivityIndicator color={theme.colors.primary} /> : <Icon name="location" color="primary" size={theme.iconSize.sm} />}
        <Text variant="bodyStrong" tone="primary">
          {t("locationPicker.useCurrent")}
        </Text>
      </Pressable>
      {marker || address ? (
        <Text variant="caption" tone="textSecondary">
          {address ?? t("locationPicker.pinSet")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", gap: theme.spacing.sm },
  mapBox: {
    height: 160,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  currentBtn: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: 44 },
  pressed: { opacity: 0.6 },
});
