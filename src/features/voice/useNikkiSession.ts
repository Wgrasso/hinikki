// src/features/voice/useNikkiSession.ts — the one seam between the app and the ElevenLabs SDK:
// mic permission → Edge-Function token + dynamic variables → startSession, exposing a small,
// screen-friendly state machine. Imported ONLY from .native files (the SDK import registers
// LiveKit's native WebRTC globals and must never reach web bundles or Jest).
import { useCallback, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react-native";
import { getConversationToken } from "../../services/voiceSessionService";
import { buildSessionVariables } from "./sessionVariables";
import { ensureMicPermission } from "./micPermission";

export type NikkiCaption = { id: number; text: string };

// idle → preparing (token/vars/permission) → connecting → live → ended | error
export type NikkiSessionPhase = "idle" | "preparing" | "connecting" | "live" | "ended" | "error";

export type NikkiSession = {
  phase: NikkiSessionPhase;
  isSpeaking: boolean;
  captions: NikkiCaption[];
  errorMessage: string | null;
  begin: (openingMessage?: string) => Promise<void>;
  end: () => void;
};

export function useNikkiSession(olderAdultId: string, preferredName: string | null): NikkiSession {
  const [phase, setPhase] = useState<NikkiSessionPhase>("idle");
  const [captions, setCaptions] = useState<NikkiCaption[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const captionSeq = useRef(0);
  const openingRef = useRef<string | null>(null);

  const conversation = useConversation({
    onConnect: () => {
      setPhase("live");
      // A Help-screen "I am lost" / People "Who is Emma?" entry speaks for the user right away.
      if (openingRef.current) {
        conversation.sendUserMessage(openingRef.current);
        openingRef.current = null;
      }
    },
    onDisconnect: (details) => {
      setPhase((current) => {
        if (details.reason === "error") {
          setErrorMessage("The connection was lost.");
          return "error";
        }
        return current === "idle" ? current : "ended";
      });
    },
    onError: (message) => {
      // Raw SDK errors are for the console; the screen shows calm copy only.
      console.warn("nikki voice error:", message);
    },
    onMessage: ({ message, role }) => {
      if (role !== "agent") return;
      captionSeq.current += 1;
      const id = captionSeq.current;
      setCaptions((prev) => [...prev.slice(-3), { id, text: message }]);
    },
  });

  const begin = useCallback(
    async (openingMessage?: string): Promise<void> => {
      setErrorMessage(null);
      setCaptions([]);
      setPhase("preparing");
      try {
        const granted = await ensureMicPermission();
        if (!granted) {
          setErrorMessage("Nikki needs the microphone to hear you. You can allow it in your phone's settings.");
          setPhase("error");
          return;
        }
        const [conversationToken, dynamicVariables] = await Promise.all([
          getConversationToken(olderAdultId),
          buildSessionVariables(olderAdultId, preferredName),
        ]);
        openingRef.current = openingMessage ?? null;
        setPhase("connecting");
        conversation.startSession({
          conversationToken,
          connectionType: "webrtc",
          userId: olderAdultId,
          dynamicVariables,
        });
      } catch (e) {
        console.warn("nikki voice session failed to start:", e);
        setErrorMessage("I could not wake Nikki up just now. Please try again in a moment.");
        setPhase("error");
      }
    },
    [conversation, olderAdultId, preferredName],
  );

  const end = useCallback((): void => {
    conversation.endSession();
  }, [conversation]);

  return {
    phase,
    isSpeaking: conversation.isSpeaking,
    captions,
    errorMessage,
    begin,
    end,
  };
}
