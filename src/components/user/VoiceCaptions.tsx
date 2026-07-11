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
                {caption.people?.length ? (
                  // Big face + name for everyone named in this turn, so the elder can clearly
                  // see who's being talked about — one card per person, wrapping if several.
                  <View style={styles.faces}>
                    {caption.people.map((person) => (
                      <View key={`${person.name}|${person.photoUri}`} style={styles.face}>
                        <Avatar name={person.name} photoUri={person.photoUri} size={FACE_SIZE} />
                        <Text variant="bodyStrong" tone={isUser ? "onPrimary" : "textPrimary"} style={styles.faceName}>
                          {person.name}
                        </Text>
                      </View>
                    ))}
                  </View>
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

// Big enough for older eyes to read a face; several still fit across a bubble by wrapping.
const FACE_SIZE = 168;

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  row: { flexDirection: "row" },
  rowUser: { justifyContent: "flex-end" },
  rowNikki: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "88%",
    gap: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  faces: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  face: { alignItems: "center", gap: theme.spacing.xs, width: FACE_SIZE + theme.spacing.md },
  faceName: { textAlign: "center" },
  nikkiBubble: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: theme.radius.sm,
  },
  userBubble: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: theme.radius.sm,
  },
});
