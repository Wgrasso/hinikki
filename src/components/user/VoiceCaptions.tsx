// src/components/user/VoiceCaptions.tsx — live captions of the conversation, in large type
// through the app's signature Reveal motion. Accessibility matters double here: many older
// adults are hard of hearing, so both what they said AND Nikki's reply are always readable.
// The two sides are visually distinct: "You" sits on the right in the brand colour, "Nikki"
// on the left on a soft surface. Purely presentational, no SDK.
import React from "react";
import { StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Reveal, Text } from "../../primitives";
import type { NikkiCaption } from "../../features/voice/useNikkiSession";

export default function VoiceCaptions({ captions }: { captions: NikkiCaption[] }): React.ReactElement | null {
  if (captions.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {captions.map((caption) => {
        const isUser = caption.role === "user";
        return (
          <Reveal key={caption.id}>
            <View style={[styles.row, isUser ? styles.rowUser : styles.rowNikki]}>
              <View style={[styles.bubble, isUser ? styles.userBubble : styles.nikkiBubble]}>
                <Text variant="overline" tone={isUser ? "onPrimary" : "textTertiary"}>
                  {isUser ? "YOU" : "NIKKI"}
                </Text>
                <Text variant="body" tone={isUser ? "onPrimary" : "textPrimary"}>
                  {caption.text}
                </Text>
              </View>
            </View>
          </Reveal>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  row: { flexDirection: "row" },
  rowUser: { justifyContent: "flex-end" },
  rowNikki: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "88%",
    gap: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  nikkiBubble: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: theme.radius.sm,
  },
  userBubble: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: theme.radius.sm,
  },
});
