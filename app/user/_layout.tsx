// app/user/_layout.tsx — the older adult's three calm destinations as a large, themed tab bar.
import React from "react";
import { Tabs } from "expo-router";
import { Icon } from "../../src/primitives";
import { theme } from "../../src/theme";

export default function UserLayout(): React.ReactElement {
  return (
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
        options={{ title: "Nikki", tabBarIcon: ({ focused }) => <Icon name="chat" color={focused ? "primary" : "textTertiary"} /> }}
      />
      <Tabs.Screen
        name="people"
        options={{ title: "People", tabBarIcon: ({ focused }) => <Icon name="people" color={focused ? "primary" : "textTertiary"} /> }}
      />
      <Tabs.Screen
        name="help"
        options={{ title: "Help", tabBarIcon: ({ focused }) => <Icon name="help" color={focused ? "primary" : "textTertiary"} /> }}
      />
    </Tabs>
  );
}
