// src/components/user/VoiceExperience.tsx — web fallback. Voice rides on LiveKit's native WebRTC
// module, so it only exists in the iOS/Android dev/production builds; Metro resolves
// VoiceExperience.native.tsx there and this file on web, keeping the SDK out of web bundles.
import React from "react";
import NikkiCard from "./NikkiCard";

export type VoiceExperienceProps = {
  olderAdultId: string;
  preferredName: string | null;
  initialAsk: string | null;
};

export default function VoiceExperience(_props: VoiceExperienceProps): React.ReactElement {
  return (
    <NikkiCard message="Talking with Nikki works in the HiNikki phone app. On this screen you can still see your day and your people." />
  );
}
