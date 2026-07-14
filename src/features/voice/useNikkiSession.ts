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

// idle → preparing (token/vars/permission) → connecting → live → closing (saving recap) → ended | error
export type NikkiSessionPhase = "idle" | "preparing" | "connecting" | "live" | "closing" | "ended" | "error";

export type NikkiSession = {
  phase: NikkiSessionPhase;
  isSpeaking: boolean;
  // The elder's own voice, from the mic's voice-activity detector — drives the orb's "lit" ring
  // so it glows when THEY talk, not when Nikki does.
  userSpeaking: boolean;
  captions: NikkiCaption[];
  errorMessage: string | null;
  recap: SessionRecap | null;
  begin: (openingMessage?: string) => Promise<void>;
  end: () => void;
};

// End the call after this long with no word from the elder, so a forgotten session doesn't
// stay live (and billing) forever.
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

// The orb's "lit" ring follows the elder's own mic level (polled from the WebRTC input), so it
// glows when THEY talk, not when Nikki does. Above this amplitude counts as speech; the ring
// stays lit for a short hang after the last voiced frame so it doesn't flicker between words.
const MIC_LEVEL_THRESHOLD = 0.08;
const MIC_POLL_MS = 120;
const MIC_HANG_MS = 500;

// After a call ends, the native audio session keeps deactivating for a beat. Starting a new
// call inside this window re-activates the shared, un-refcounted session mid-deactivation and
// leaves the mic dead. We wait out only the REMAINING slice of this window (measured from the
// actual end), so a restart after a pause has no delay while a fast re-tap is still protected.
const AUDIO_SETTLE_MS = 700;

// When the user taps "Goodbye" (or leaves), give Nikki this long to save her recap and sign off
// before we force the connection closed. As soon as her recap lands, the close happens sooner.
const WRAP_UP_TIMEOUT_MS = 12_000;

// The native audio session is a PROCESS-GLOBAL, un-refcounted singleton, so the "when did teardown
// last begin" clock must live at module scope too. A per-component ref is lost when the screen
// unmounts — which is exactly what the dev Admin↔User switch (and tab changes) do — so the next
// call would start with no settle delay and a dead mic. Module scope survives the remount.
let lastNativeEndAt: number | null = null;

export function useNikkiSession(olderAdultId: string, preferredName: string | null): NikkiSession {
  const [phase, setPhase] = useState<NikkiSessionPhase>("idle");
  const [userSpeaking, setUserSpeaking] = useState(false);
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
  // Whether the NEXT connect is a restart — used to work around a known iOS/LiveKit bug where the
  // mic stays silent on the 2nd+ call (the settle clock itself is module-global, above).
  const restartPending = useRef(false);
  // After Nikki saves the recap (the last thing she does), we end the call OURSELVES a few seconds
  // later — client-side — so the audio session tears down cleanly and the next call's mic works.
  // (A server-side "End conversation" skips that teardown and leaves the mic dead on restart.)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live mirrors of state, so callbacks/cleanup read the latest without re-subscribing.
  const phaseRef = useRef<NikkiSessionPhase>("idle");
  const recapRef = useRef<SessionRecap | null>(null);
  const closingRef = useRef(false);

  // Orb "lit" state without re-rendering on every frame: a ref holds the current value so we only
  // call setState on an actual on↔off flip; the timer gives the off a short hang. Fed by a poll of
  // the mic's input volume (below), so the ring reflects the ELDER's voice.
  const micTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const userSpeakingRef = useRef(false);
  const micHangTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setUserVoice = useCallback((active: boolean): void => {
    if (active) {
      if (micHangTimer.current) {
        clearTimeout(micHangTimer.current);
        micHangTimer.current = null;
      }
      if (!userSpeakingRef.current) {
        userSpeakingRef.current = true;
        setUserSpeaking(true);
      }
    } else if (userSpeakingRef.current && !micHangTimer.current) {
      micHangTimer.current = setTimeout(() => {
        micHangTimer.current = null;
        userSpeakingRef.current = false;
        setUserSpeaking(false);
      }, MIC_HANG_MS);
    }
  }, []);
  const stopMicPoll = useCallback((): void => {
    if (micTimer.current) {
      clearInterval(micTimer.current);
      micTimer.current = null;
    }
    if (micHangTimer.current) {
      clearTimeout(micHangTimer.current);
      micHangTimer.current = null;
    }
    userSpeakingRef.current = false;
    setUserSpeaking(false);
  }, []);
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
      recapRef.current = r; // so a pending end() knows the wrap-up is done
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
      // Poll the mic's own input level so the orb lights for the ELDER's voice. getInputVolume()
      // returns real values on RN over WebRTC (the SDK attaches native volume processors).
      if (micTimer.current) clearInterval(micTimer.current);
      micTimer.current = setInterval(() => {
        let level = 0;
        try {
          level = conversation.getInputVolume();
        } catch {
          level = 0;
        }
        setUserVoice(level >= MIC_LEVEL_THRESHOLD);
      }, MIC_POLL_MS);
    },
    onDisconnect: (details) => {
      clearIdle();
      clearCloseTimer();
      stopMicPoll();
      closingRef.current = false;
      lastNativeEndAt = Date.now(); // mark when native teardown began, for the restart settle
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
      recapRef.current = null;
      closingRef.current = false;
      clearIdle(); // no stale watchdog from a previous attempt
      clearCloseTimer();
      photosRef.current = []; // fresh face lookup for THIS conversation
      toolSet.reset(); // fresh recap chips + push budget for THIS conversation
      // A previous session ended → this is a restart: re-arm the mic on connect, and settle the
      // native audio session (below) before starting.
      restartPending.current = lastNativeEndAt != null;
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
        if (lastNativeEndAt != null) {
          const remaining = AUDIO_SETTLE_MS - (Date.now() - lastNativeEndAt);
          if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
          lastNativeEndAt = null;
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

  // Force the connection closed right now (no wrap-up). Used for the hard fallback, a second
  // "Goodbye" tap, and when the screen unmounts (leaving the tab / the dev Admin↔User switch).
  const endNow = useCallback((): void => {
    clearIdle();
    clearCloseTimer();
    stopMicPoll();
    closingRef.current = false;
    try {
      conversation.endSession();
    } catch {
      /* already ended */
    }
  }, [conversation, clearIdle, clearCloseTimer, stopMicPoll]);

  // The elder's "Goodbye" (button or leaving). If Nikki hasn't wrapped up yet, ask her to save her
  // recap and sign off — the SAME closing Nikki does when the elder says goodbye aloud — then let
  // the recap's auto-close finish, with a hard timeout as a safety net. A second tap forces it.
  const end = useCallback((): void => {
    if (phaseRef.current === "live" && !recapRef.current && !closingRef.current) {
      closingRef.current = true;
      setPhase("closing");
      clearIdle(); // no idle hang-up while we're wrapping up
      try {
        conversation.sendUserMessage("I need to go now. Goodbye, Nikki.");
      } catch {
        /* if we can't reach her, fall through to the hard close below */
      }
      clearCloseTimer();
      closeTimer.current = setTimeout(() => endNow(), WRAP_UP_TIMEOUT_MS);
      return;
    }
    endNow();
  }, [conversation, clearIdle, clearCloseTimer, endNow]);

  // Keep the idle watchdog's "hang up" pointed at the latest end(), and mirror state for callbacks.
  endRef.current = end;
  phaseRef.current = phase;
  recapRef.current = recap;
  // The screen is unmounting (left the tab, or the dev Admin↔User switch): hard-close now — there's
  // no surface left to run a graceful wrap-up on. endNow marks the native-teardown clock so the
  // NEXT call (even after a remount) still settles before opening the mic.
  const endNowRef = useRef(endNow);
  endNowRef.current = endNow;
  useEffect(() => () => endNowRef.current(), []);

  return {
    phase,
    isSpeaking: conversation.isSpeaking,
    userSpeaking,
    captions,
    errorMessage,
    recap,
    begin,
    end,
  };
}
