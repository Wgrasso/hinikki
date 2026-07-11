// app/_layout.tsx — root: loads the Fraunces + Inter pairing behind the splash, provides app state,
// and renders the headerless router stack (every screen draws its own branded AppBar).
import React, { useCallback } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { AppStateProvider } from "../src/auth/appState";
import { LanguageProvider } from "../src/i18n";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout(): React.ReactElement | null {
  const [fontsLoaded] = useFonts({ Fraunces_600SemiBold, Inter_400Regular, Inter_600SemiBold });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <AppStateProvider>
          <LanguageProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
          </LanguageProvider>
        </AppStateProvider>
      </View>
    </SafeAreaProvider>
  );
}
