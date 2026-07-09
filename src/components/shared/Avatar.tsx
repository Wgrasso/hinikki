// src/components/shared/Avatar.tsx — a person's face, or a warm monogram when no photo is set.
import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Text } from "../../primitives";
import { initials } from "../../utils/format";

type AvatarProps = {
  name: string;
  photoUri?: string | null;
  size?: number;
};

export default function Avatar({ name, photoUri, size = 64 }: AvatarProps): React.ReactElement {
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  if (photoUri) {
    return <Image source={{ uri: photoUri }} style={[styles.image, dimension]} accessibilityLabel={`Photo of ${name}`} />;
  }
  return (
    <View style={[styles.monogram, dimension]}>
      <Text variant="heading" tone="onPrimary">
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: theme.colors.surfaceAlt },
  monogram: {
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
