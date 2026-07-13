// src/features/voice/useNikkiSession.ts — the one seam between the app and the ElevenLabs SDK:
// mic permission → Edge-Function token + dynamic variables → startSession, exposing a small,
// screen-friendly state machine. Imported ONLY from .native files (the SDK import registers
// LiveKit's native WebRTC globals and must never reach web bundles or Jest).
// The brain rides this seam (plan §2.6): the five client tools execute on-device, every
// spoken turn is persisted for continuity, and the end-of-conversation recap surfaces here
// for the closing card.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react-native";
import { stripStageDirections } from "../../utils/format";
import { getConversationToken } from "../../services/voiceSessionService";
import { recordTurn } from "../../services/conversationService";
import { flushProposalQueue } from "../../services/proposalService";
import { notifyAdminsOfProposal } from "../../services/pushService";
import { buildSessionVariables } from "./sessionVariables";
import { ensureMicPermission } from "./micPermission";
import { makeAgentTools, type AgentToolSet, type SessionRecap } from "./agentTools";
import { getSnapshotTiers } from "./snapshot";
import { loadPersonPhotos, matchPersonPhotos, type PersonPhoto } from "./personPhotos";

export type NikkiCaption = { id: number; role: "user" | "nikki"; text: string; people?: PersonPhoto[] };

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

// End the call after this long with no word from the elder, so a forgotten session doesn't
// stay live (and billing) forever.
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

// After a call ends, the native audio session keeps deactivating for a beat. Starting a new
// call inside this window re-activates the shared, un-refcounted session mid-deactivation and
// leaves the mic dead. We wait out only the REMAINING slice of this window (measured from the
// actual end), so a restart after a pause has no delay while a fast re-tap is still protected.
const AUDIO_SETTLE_MS = 700;

export function useNikkiSession(olderAdultId: string, preferredName: string | null): NikkiSession {
  const [phase, setPhase] = useState<NikkiSessionPhase>("idle");
  const [captions, setCaptions] = useState<NikkiCaption[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recap, setRecap] = useState<SessionRecap | null>(null);
  const captionSeq = useRef(0);
  const openingRef = useRef<string | null>(null);
  // Name→face lookup for the transcript, loaded once per session (best-effort).
  const photosRef = useRef<PersonPhoto[]>([]);

  // Inactivity watchdog: armed on connect, reset on every USER turn, cleared on end.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<() => void>(() => undefined);
  // When the previous session began tearing down, and whether the NEXT connect is a restart —
  // used to work around a known iOS/LiveKit bug where the mic stays silent on the 2nd+ call.
  const lastEndAt = useRef<number | null>(null);
  const restartPending = useRef(false);
  // After Nikki saves the recap (the last thing she does), we end the call OURSELVES a few seconds
  // later — client-side — so the audio session tears down cleanly and the next call's mic works.
  // (A server-side "End conversation" skips that teardown and leaves the mic dead on restart.)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearIdle = useCallback((): void => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, []);
  const clearCloseTimer = useCallback((): void => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const armIdle = useCallback((): void => {
    clearIdle();
    idleTimer.current = setTimeout(() => endRef.current(), IDLE_TIMEOUT_MS);
  }, [clearIdle]);

  // Recap arrived → show it, then close the call from the client after a short grace (so her
  // goodbye line plays out). Cancelled if the person keeps talking.
  const handleRecap = useCallback(
    (r: SessionRecap): void => {
      setRecap(r);
      clearCloseTimer();
      closeTimer.current = setTimeout(() => endRef.current(), 6000);
    },
    [clearCloseTimer],
  );

  // The five tools, bound to this older adult; onRecap feeds the closing card + auto-close.
  // Per-CONVERSATION state (recap chips, push budget) lives inside and is reset in begin().
  const toolSet: AgentToolSet = useMemo(
    () => makeAgentTools(olderAdultId, { onRecap: handleRecap }),
    [olderAdultId, handleRecap],
  );

  const conversation = useConversation({
    onConnect: () => {
      setPhase("live");
      armIdle(); // start the quiet-timer as soon as we're live
      // Known iOS/LiveKit bug: after a previous call stopped the shared audio session, the mic
      // can stay dead on the next call even though it connects. Toggling the mic off→on drives
      // the native audio engine's "recording enabled" edge, which re-arms capture. Only needed
      // on a restart; the toggle happens during Nikki's opening line, so it's inaudible.
      if (restartPending.current) {
        restartPending.current = false;
        try {
          conversation.setMuted(true);
          setTimeout(() => {
            try {
              conversation.setMuted(false);
            } catch {
              /* session may have ended; ignore */
            }
          }, 250);
        } catch {
          /* setMuted unavailable; ignore */
        }
      }
      // A Help-screen "I am lost" / People "Who is Emma?" entry speaks for the user right away.
      if (openingRef.current) {
        conversation.sendUserMessage(openingRef.current);
        openingRef.current = null;
      }
    },
    onDisconnect: (details) => {
      clearIdle();
      clearCloseTimer();
      lastEndAt.current = Date.now(); // mark when native teardown began, for the restart settle
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
      const who: "user" | "nikki" = role === "agent" ? "nikki" : "user";
      // The elder just spoke — reset the quiet-timer, and cancel any pending auto-close (if they
      // said "goodbye" but then kept chatting, don't hang up on them).
      if (who === "user") {
        armIdle();
        clearCloseTimer();
      }
      // Drop the speech engine's bracketed cues ("[gentle]") before showing or storing.
      const text = stripStageDirections(message);
      if (!text) return; // nothing but a stage direction — no caption, no stored turn
      // Both sides persist for continuity ([RECENT] next session); a failed write never
      // interrupts the conversation.
      void recordTurn(olderAdultId, who, text).catch(() => undefined);
      // Caption BOTH sides. Keep the WHOLE conversation (the transcript scrolls) — it's only
      // cleared when a new conversation begins, never mid-chat.
      captionSeq.current += 1;
      const id = captionSeq.current;
      // Every person named in the line (by either side) who has a photo on file gets their
      // face + name shown beside the words, so the elder can place them clearly.
      const named = matchPersonPhotos(text, photosRef.current);
      setCaptions((prev) => [...prev, { id, role: who, text, people: named.length ? named : undefined }]);
    },
  });

  const begin = useCallback(
    async (openingMessage?: string): Promise<void> => {
      setErrorMessage(null);
      setCaptions([]);
      setRecap(null);
      clearIdle(); // no stale watchdog from a previous attempt
      clearCloseTimer();
      photosRef.current = []; // fresh face lookup for THIS conversation
      toolSet.reset(); // fresh recap chips + push budget for THIS conversation
      // A previous session ended → this is a restart: re-arm the mic on connect, and settle the
      // native audio session (below) before starting.
      restartPending.current = lastEndAt.current != null;
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
        // Face lookup for the transcript: best-effort, never blocks the connection.
        void loadPersonPhotos(olderAdultId)
          .then((photos) => {
            photosRef.current = photos;
          })
          .catch(() => undefined);
        const [conversationToken, dynamicVariables, tiers] = await Promise.all([
          getConversationToken(olderAdultId),
          buildSessionVariables(olderAdultId, preferredName),
          getSnapshotTiers(olderAdultId).catch(() => null),
        ]);
        // Pin the agent's language to this elder's so the voice never drifts to English
        // for a Dutch speaker (or vice versa). Dutch variants → "nl", everything else → "en".
        const language: "nl" | "en" = tiers?.profile?.primary_language?.startsWith("nl") ? "nl" : "en";
        // Wait out only the REMAINING native-teardown window from the previous call, measured
        // from when it actually ended. The token/variable fetch above already overlaps most of
        // it, so this usually adds nothing; a fast goodbye→talk re-tap gets the full protection.
        if (lastEndAt.current != null) {
          const remaining = AUDIO_SETTLE_MS - (Date.now() - lastEndAt.current);
          if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
          lastEndAt.current = null;
        }
        openingRef.current = openingMessage ?? null;
        setPhase("connecting");
        conversation.startSession({
          conversationToken,
          connectionType: "webrtc",
          userId: olderAdultId,
          dynamicVariables,
          clientTools: toolSet.tools,
          overrides: { agent: { language } },
        });
      } catch (e) {
        console.warn("nikki voice session failed to start:", e);
        setErrorMessage("I could not wake Nikki up just now. Please try again in a moment.");
        setPhase("error");
      }
    },
    [conversation, olderAdultId, preferredName, toolSet, clearIdle],
  );

  const end = useCallback((): void => {
    clearIdle();
    clearCloseTimer();
    conversation.endSession();
  }, [conversation, clearIdle, clearCloseTimer]);

  // Keep the idle watchdog's "hang up" pointed at the latest end(), and stop both timers if the
  // screen unmounts mid-call.
  endRef.current = end;
  useEffect(
    () => () => {
      clearIdle();
      clearCloseTimer();
    },
    [clearIdle, clearCloseTimer],
  );

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
