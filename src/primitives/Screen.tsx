// src/primitives/Screen.tsx — the root of every screen: safe-area, themed canvas, optional scroll.
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../theme";

type ScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
};

export default function Screen({ children, scroll = false, padded = true }: ScreenProps): React.ReactElement {
  const inner = <View style={[styles.inner, padded ? styles.padded : null]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, padded ? styles.padded : null]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  inner: { flex: 1 },
  scrollContent: { paddingBottom: theme.spacing.xxl },
  padded: { paddingHorizontal: theme.spacing.lg },
});
