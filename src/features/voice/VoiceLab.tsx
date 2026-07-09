// src/features/voice/VoiceLab.tsx — web fallback for the spike route. The ElevenLabs RN SDK is
// native-only (LiveKit WebRTC); Metro resolves VoiceLab.native.tsx on iOS/Android and this on web,
// keeping the native module out of web bundles entirely.
import React from "react";
import { Screen, Stack, Text } from "../../primitives";

export default function VoiceLab(): React.ReactElement {
  return (
    <Screen>
      <Stack gap="md">
        <Text variant="title">Voice lab (spike)</Text>
        <Text variant="body" tone="textSecondary">
          Voice runs only in the native dev build (iOS/Android). Open this route on a device.
        </Text>
      </Stack>
    </Screen>
  );
}
