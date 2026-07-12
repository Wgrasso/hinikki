// src/components/shared/LocationPicker.tsx — an embedded map to set a place by dropping/dragging
// a pin (or "use my current location"), instead of typing an address. The pin's coordinates are
// reverse-geocoded to a readable address automatically. Uses react-native-maps (a native module —
// iOS shows Apple Maps for free; Android needs a Google Maps API key in app.json).
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { theme } from "../../theme";
import { Icon, Text } from "../../primitives";
import { useT } from "../../i18n";

export type PickedLocation = { latitude: number; longitude: number; address: string | null };

// A sensible starting view when we have neither a saved pin nor a location fix yet.
const FALLBACK_REGION: Region = { latitude: 52.3676, longitude: 4.9041, latitudeDelta: 0.06, longitudeDelta: 0.06 };

// Turn a pin into a readable street-level address for display + storage.
async function reverseFull(latitude: number, longitude: number): Promise<string | null> {
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    const p = places[0];
    if (!p) return null;
    const line1 = [p.street, p.streetNumber].filter(Boolean).join(" ") || p.name || "";
    const city = p.city ?? p.subregion ?? p.region ?? "";
    return [line1, city].filter((s) => s && s.length > 0).join(", ") || null;
  } catch {
    return null;
  }
}

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
  const mapRef = useRef<MapView>(null);
  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(value);
  const [locating, setLocating] = useState(false);
  const initialRegion: Region = value ? { ...value, latitudeDelta: 0.01, longitudeDelta: 0.01 } : FALLBACK_REGION;

  // Fresh add with no pin yet: center the map on the device's location (best-effort) for convenience.
  useEffect(() => {
    if (value) return;
    let active = true;
    void (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!active) return;
        mapRef.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
      } catch {
        // keep the fallback region
      }
    })();
    return () => {
      active = false;
    };
  }, [value]);

  async function place(latitude: number, longitude: number): Promise<void> {
    setMarker({ latitude, longitude });
    const addr = await reverseFull(latitude, longitude);
    onChange({ latitude, longitude, address: addr });
  }

  async function useCurrent(): Promise<void> {
    setLocating(true);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
      await place(pos.coords.latitude, pos.coords.longitude);
    } finally {
      setLocating(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.mapBox}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          onPress={(e) => void place(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
        >
          {marker ? (
            <Marker
              coordinate={marker}
              draggable
              onDragEnd={(e) => void place(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
            />
          ) : null}
        </MapView>
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
      <Text variant="caption" tone="textSecondary">
        {marker ? address ?? t("locationPicker.pinSet") : t("locationPicker.tapToPlace")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", gap: theme.spacing.sm },
  mapBox: { height: 220, borderRadius: theme.radius.md, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt },
  currentBtn: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: 44 },
  pressed: { opacity: 0.6 },
});
