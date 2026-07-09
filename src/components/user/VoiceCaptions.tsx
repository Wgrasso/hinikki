// src/components/user/VoiceCaptions.tsx — live captions of what Nikki says, in large type through
// the app's signature Reveal motion. Accessibility matters double here: many older adults are
// hard of hearing, so the spoken reply is always readable too. Purely presentational, no SDK.
import React from "react";
import { StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Reveal, Text } from "../../primitives";
import type { NikkiCaption } from "../../features/voice/useNikkiSession";

export default function VoiceCaptions({ captions }: { captions: NikkiCaption[] }): React.ReactElement | null {
  if (captions.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {captions.map((caption) => (
        <Reveal key={caption.id}>
          <View style={styles.bubble}>
            <Text variant="body">{caption.text}</Text>
          </View>
        </Reveal>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  bubble: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
});
