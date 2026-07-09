// app/admin/_layout.tsx — the family's five destinations as a themed tab bar.
// The Home tab carries a small badge when Nikki has pending questions (plan §4.3).
import React from "react";
import { Tabs } from "expo-router";
import { useAppState } from "../../src/auth/appState";
import { usePendingProposalCount } from "../../src/components/admin/ProposalsSection";
import DevModeSwitch from "../../src/components/shared/DevModeSwitch";
import { Icon } from "../../src/primitives";
import { theme } from "../../src/theme";

export default function AdminLayout(): React.ReactElement {
  const { olderAdultId } = useAppState();
  const pendingCount = usePendingProposalCount(olderAdultId);
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
          height: 84,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.md,
        },
        tabBarLabelStyle: { fontFamily: theme.text.caption.fontFamily, fontSize: theme.text.caption.fontSize },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <Icon name="home" color={focused ? "primary" : "textTertiary"} />,
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.accent,
            color: theme.colors.onPrimary,
            fontFamily: theme.text.caption.fontFamily,
            fontSize: 12,
          },
        }}
      />
      <Tabs.Screen name="people" options={{ title: "People", tabBarIcon: ({ focused }) => <Icon name="people" color={focused ? "primary" : "textTertiary"} /> }} />
      <Tabs.Screen name="schedule" options={{ title: "Schedule", tabBarIcon: ({ focused }) => <Icon name="calendar" color={focused ? "primary" : "textTertiary"} /> }} />
      <Tabs.Screen name="safety" options={{ title: "Safety", tabBarIcon: ({ focused }) => <Icon name="shield" color={focused ? "primary" : "textTertiary"} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ focused }) => <Icon name="settings" color={focused ? "primary" : "textTertiary"} /> }} />
    </Tabs>
    <DevModeSwitch />
    </>
  );
}
