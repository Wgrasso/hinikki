// app/user/_layout.tsx — the older adult's three calm destinations as a large, themed tab bar.
// Also the elder device's one global live wiring: any family change marks the voice context
// snapshot dirty, so Nikki's next session starts fresh without the voice screen doing anything.
import React, { useEffect } from "react";
import { AppState } from "react-native";
import { Tabs } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { subscribeLive } from "../../src/features/sync/liveChannel";
import { flushProposalQueue } from "../../src/services/proposalService";
import { notifyAdminsOfProposal } from "../../src/services/pushService";
import { markSnapshotDirty } from "../../src/features/voice/snapshot";
import { captureAndStoreLocation } from "../../src/features/safety/locationCapture";
import DevModeSwitch from "../../src/components/shared/DevModeSwitch";
import { Icon } from "../../src/primitives";
import { theme } from "../../src/theme";
import { FEATURE_HELP_TAB } from "../../src/lib/constants";
import { useT } from "../../src/i18n";

export default function UserLayout(): React.ReactElement {
  const { t } = useT();
  const { olderAdultId } = useAppState();

  useEffect(() => {
    if (!olderAdultId) return;
    return subscribeLive(olderAdultId, (table) => markSnapshotDirty(olderAdultId, table));
  }, [olderAdultId]);

  // Keep the family's "current location" fresh so they can always see where their person is:
  // capture on open, when the app returns to the foreground, and every few minutes while it's
  // open. Foreground-only and best-effort — a declined permission simply no-ops (dignified, not
  // covert). Continuous background tracking would need extra OS permissions and a native rebuild.
  useEffect(() => {
    if (!olderAdultId) return;
    const capture = (): void => {
      void captureAndStoreLocation(olderAdultId, false);
    };
    capture();
    const interval = setInterval(capture, 3 * 60 * 1000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") capture();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [olderAdultId]);

  // Facts queued while offline must reach the family when the app comes back — not only
  // at the next voice session (plan §4.2): flush on foreground, one catch-up push total.
  useEffect(() => {
    const flush = (): void => {
      void flushProposalQueue()
        .then((conversations) => (conversations.length > 0 ? notifyAdminsOfProposal() : undefined))
        .catch(() => undefined);
    };
    flush();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") flush();
    });
    return () => sub.remove();
  }, []);

  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 92,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.lg,
        },
        tabBarLabelStyle: {
          fontFamily: theme.text.caption.fontFamily,
          fontSize: theme.text.caption.fontSize,
        },
      }}
    >
      <Tabs.Screen
        name="nikki"
        options={{ title: t("tab.nikki"), tabBarIcon: ({ focused }) => <Icon name="chat" color={focused ? "primary" : "textTertiary"} /> }}
      />
      <Tabs.Screen
        name="people"
        options={{ title: t("tab.people"), tabBarIcon: ({ focused }) => <Icon name="people" color={focused ? "primary" : "textTertiary"} /> }}
      />
      <Tabs.Screen
        name="help"
        options={{
          href: FEATURE_HELP_TAB ? undefined : null,
          title: t("tab.help"),
          tabBarIcon: ({ focused }) => <Icon name="help" color={focused ? "primary" : "textTertiary"} />,
        }}
      />
    </Tabs>
    <DevModeSwitch />
    </>
  );
}
