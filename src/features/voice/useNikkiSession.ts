// src/features/voice/useNikkiSession.ts — the one seam between the app and the ElevenLabs SDK:
// mic permission → Edge-Function token + dynamic variables → startSession, exposing a small,
// screen-friendly state machine. Imported ONLY from .native files (the SDK import registers
// LiveKit's native WebRTC globals and must never reach web bundles or Jest).
// The brain rides this seam (plan §2.6): the seven client tools execute on-device, every
// spoken turn is persisted for continuity, and the end-of-conversation recap surfaces here
// for the closing card.
import { useCallback, useMemo, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react-native";
import { getConversationToken } from "../../services/voiceSessionService";
import { recordTurn } from "../../services/conversationService";
import { flushProposalQueue } from "../../services/proposalService";
import { notifyAdminsOfProposal } from "../../services/pushService";
import { buildSessionVariables } from "./sessionVariables";
import { ensureMicPermission } from "./micPermission";
import { makeAgentTools, type AgentToolSet, type SessionRecap } from "./agentTools";

export type NikkiCaption = { id: number; text: string };

// idle → preparing (token/vars/permission) → connecting → live → ended | error
export type NikkiSessionPhase = "idle" | "preparing" | "connecting" | "live" | "ended" | "error";

export type NikkiSession = {
  phase: NikkiSessionPhase;
  isSpeaking: boolean;
  captions: NikkiCaption[];
  errorMessage: string | null;
  recap: SessionRecap | null;
  begin: (openingMessage?: string) => Promise<void>;
  end: () => void;
};

export function useNikkiSession(olderAdultId: string, preferredName: string | null): NikkiSession {
  const [phase, setPhase] = useState<NikkiSessionPhase>("idle");
  const [captions, setCaptions] = useState<NikkiCaption[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recap, setRecap] = useState<SessionRecap | null>(null);
  const captionSeq = useRef(0);
  const openingRef = useRef<string | null>(null);

  // The seven tools, bound to this older adult; onRecap feeds the closing card.
  // Per-CONVERSATION state (recap chips, push budget) lives inside and is reset in begin().
  const toolSet: AgentToolSet = useMemo(
    () => makeAgentTools(olderAdultId, { onRecap: setRecap }),
    [olderAdultId],
  );

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
      // Raw SDK errors are for the console; the screen shows calm copy only. A failure
      // while starting up would otherwise strand the orb on "Waking Nikki up…" forever —
      // startSession's rejection surfaces here, not in begin()'s try/catch.
      console.warn("nikki voice error:", message);
      setPhase((current) => {
        if (current === "preparing" || current === "connecting") {
          setErrorMessage("I could not wake Nikki up just now. Please try again in a moment.");
          return "error";
        }
        return current;
      });
    },
    onMessage: ({ message, role }) => {
      // Both sides persist for continuity ([RECENT] next session); a failed write never
      // interrupts the conversation.
      void recordTurn(olderAdultId, role === "agent" ? "nikki" : "user", message).catch(() => undefined);
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
      setRecap(null);
      toolSet.reset(); // fresh recap chips + push budget for THIS conversation
      setPhase("preparing");
      // Facts queued while offline get their catch-up now — at most one push for the
      // whole flushed batch (plan §4.5).
      void flushProposalQueue()
        .then((conversations) => (conversations.length > 0 ? notifyAdminsOfProposal() : undefined))
        .catch(() => undefined);
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
          clientTools: toolSet.tools,
        });
      } catch (e) {
        console.warn("nikki voice session failed to start:", e);
        setErrorMessage("I could not wake Nikki up just now. Please try again in a moment.");
        setPhase("error");
      }
    },
    [conversation, olderAdultId, preferredName, toolSet],
  );

  const end = useCallback((): void => {
    conversation.endSession();
  }, [conversation]);

  return {
    phase,
    isSpeaking: conversation.isSpeaking,
    captions,
    errorMessage,
    recap,
    begin,
    end,
  };
}
