// src/components/user/VoiceCaptions.tsx — live captions of the conversation, in large type
// through the app's signature Reveal motion. Accessibility matters double here: many older
// adults are hard of hearing, so both what they said AND Nikki's reply are always readable.
// The two sides are visually distinct: "You" sits on the right in the brand colour, "Nikki"
// on the left on a soft surface. Purely presentational, no SDK.
import React from "react";
import { StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Reveal, Text } from "../../primitives";
import Avatar from "../shared/Avatar";
import { useT } from "../../i18n";
import type { NikkiCaption } from "../../features/voice/useNikkiSession";

export default function VoiceCaptions({ captions }: { captions: NikkiCaption[] }): React.ReactElement | null {
  const { t } = useT();
  if (captions.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {captions.map((caption) => {
        const isUser = caption.role === "user";
        return (
          <Reveal key={caption.id}>
            <View style={[styles.row, isUser ? styles.rowUser : styles.rowNikki]}>
              <View style={[styles.bubble, isUser ? styles.userBubble : styles.nikkiBubble]}>
                {caption.photoUri ? (
                  // A face joins the words when someone is named, to help place them.
                  <Avatar name={t("caption.avatarLabel")} photoUri={caption.photoUri} size={44} />
                ) : null}
                <Text variant="overline" tone={isUser ? "onPrimary" : "textTertiary"}>
                  {isUser ? t("caption.you") : t("caption.nikki")}
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
