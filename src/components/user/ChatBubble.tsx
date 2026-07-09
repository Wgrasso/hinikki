// src/components/user/ChatBubble.tsx — large, readable chat bubbles. Nikki's reply rises in with the
// app-wide reveal convention (the signature interaction); the user's message appears immediately.
import React from "react";
import { StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Reveal, Text } from "../../primitives";
import type { ChatMessage } from "../../types/domain";

export default function ChatBubble({ message }: { message: ChatMessage }): React.ReactElement {
  const isNikki = message.role === "nikki";
  const isEmergency = message.safetyLevel === "emergency";

  const bubble = (
    <View
      style={[
        styles.bubble,
        isNikki ? styles.nikki : styles.user,
        isEmergency ? styles.emergency : null,
      ]}
    >
      <Text variant="body" tone={isEmergency ? "onPrimary" : "textPrimary"}>
        {message.text}
      </Text>
    </View>
  );

  return (
    <View style={[styles.row, isNikki ? styles.rowLeft : styles.rowRight]}>
      {isNikki ? <Reveal>{bubble}</Reveal> : bubble}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: "100%", marginVertical: theme.spacing.xs },
  rowLeft: { alignItems: "flex-start" },
  rowRight: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "88%",
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  nikki: { backgroundColor: theme.colors.surface, ...theme.shadows.card, borderTopLeftRadius: theme.radius.sm },
  user: { backgroundColor: theme.colors.surfaceAlt, borderTopRightRadius: theme.radius.sm },
  emergency: { backgroundColor: theme.colors.danger },
});
