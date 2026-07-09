// src/components/admin/ProposalsSection.tsx — the "Nikki asks" review cards (plan §4.3, FR-7).
// Each pending proposal shows what Nikki heard (the quote), a plain-language summary, and three
// choices: add it, check & edit it first, or decline. Declining opens a small sheet with a reason
// (so Nikki won't re-ask); "remove completely" erases the row for things that should never have
// been stored. Failed approvals are kept in local state so the admin sees what went wrong.
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Card, Icon, Stack, Text } from "../../primitives";
import SectionHeader from "./SectionHeader";
import ProposalEditModal from "./ProposalEditModal";
import { approveAndApply, declineProposal, eraseProposal, listPendingProposals } from "../../services/proposalService";
import { subscribeLive } from "../../features/sync/liveChannel";
import type { DeclineReason, NikkiProposal } from "../../types/database";

type Props = {
  olderAdultId: string; // reserved for deep-links; actions run off each proposal row itself
  proposals: NikkiProposal[];
  onChanged: () => void;
};

// FR-5: people Nikki only heard about must never look verified.
const UNVERIFIED_CAPTION = "Not yet confirmed — Nikki only heard them mentioned";

const DECLINE_REASONS: { reason: DeclineReason; label: string }[] = [
  { reason: "already_known", label: "They already know this" },
  { reason: "not_true", label: "That's not right" },
  { reason: "family_prefers_not", label: "Rather not save this" },
];

function payloadStr(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

// A friendly one-line summary from type + payload only — never from LLM free text.
export function proposalSummary(proposal: NikkiProposal): string {
  const p = proposal.payload ?? {};
  const name = payloadStr(p, "full_name") ?? payloadStr(p, "preferred_name");
  const title = payloadStr(p, "title");
  switch (proposal.proposal_type) {
    case "new_person":
      return name
        ? `Add person: ${name}${payloadStr(p, "relationship_label") ? ` — ${payloadStr(p, "relationship_label")}` : ""}`
        : "Add a new person";
    case "person_update":
      return name ? `Update ${name}` : "Update someone's details";
    case "relationship":
      return "Connect two people";
    case "memory":
      return title ? `Memory: "${title}"` : "A memory";
    case "fact":
      return title ?? payloadStr(p, "content")?.slice(0, 60) ?? "A small note";
    case "event":
      return title ? `Plan: "${title}"` : "A plan";
    case "reminder":
      return title ? `Reminder: "${title}"` : "A reminder";
    case "profile_update": {
      if (payloadStr(p, "date_of_birth")) return `Their birthday: ${payloadStr(p, "date_of_birth")}`;
      if (payloadStr(p, "preferred_name")) return `They go by: ${payloadStr(p, "preferred_name")}`;
      if (payloadStr(p, "home_address")) return `Home address: ${payloadStr(p, "home_address")}`;
      if (payloadStr(p, "primary_language")) return `Their language: ${payloadStr(p, "primary_language")}`;
      return "A detail about them";
    }
    case "safe_location":
      return payloadStr(p, "name") ? `Familiar place: ${payloadStr(p, "name")}` : "A familiar place";
    default:
      return "Something Nikki heard";
  }
}

// Pending-count for the tab badge: loads once and refreshes on live changes.
// Safe with a null olderAdultId (no badge) so the layout can call it unconditionally.
export function usePendingProposalCount(olderAdultId: string | null): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!olderAdultId) {
      setCount(0);
      return;
    }
    let active = true;
    const load = (): void => {
      listPendingProposals(olderAdultId)
        .then((rows) => {
          if (active) setCount(rows.length);
        })
        .catch(() => undefined); // a missing badge must never crash the tab bar
    };
    load();
    const unsubscribe = subscribeLive(olderAdultId, () => load());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [olderAdultId]);
  return count;
}

type FailedApproval = { proposal: NikkiProposal; error: string };

export default function ProposalsSection({ proposals, onChanged }: Props): React.ReactElement | null {
  const [busyId, setBusyId] = useState<string | null>(null);
  // Approvals that failed server-side: the row becomes status='failed' and drops out of the
  // pending refetch, so we keep a local copy until the admin retries or dismisses it.
  const [failed, setFailed] = useState<FailedApproval[]>([]);
  const [editing, setEditing] = useState<NikkiProposal | null>(null);
  const [declining, setDeclining] = useState<NikkiProposal | null>(null);
  const [declineReason, setDeclineReason] = useState<DeclineReason | null>(null);
  const [declineBusy, setDeclineBusy] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);

  async function approve(proposal: NikkiProposal): Promise<void> {
    setBusyId(proposal.id);
    const result = await approveAndApply(proposal);
    setBusyId(null);
    if (!result.ok) {
      const error = `We could not add this — ${result.error ?? "please try again"}.`;
      setFailed((prev) => [...prev.filter((f) => f.proposal.id !== proposal.id), { proposal, error }]);
      return;
    }
    setFailed((prev) => prev.filter((f) => f.proposal.id !== proposal.id));
    onChanged();
  }

  function dismissFailed(id: string): void {
    setFailed((prev) => prev.filter((f) => f.proposal.id !== id));
  }

  function openDecline(proposal: NikkiProposal): void {
    setDeclining(proposal);
    setDeclineReason(null);
    setDeclineError(null);
  }

  async function confirmDecline(): Promise<void> {
    if (!declining || !declineReason) return;
    setDeclineBusy(true);
    setDeclineError(null);
    try {
      await declineProposal(declining.id, declineReason);
      setDeclining(null);
      onChanged();
    } catch {
      setDeclineError("We could not save that just now. Please try again.");
    } finally {
      setDeclineBusy(false);
    }
  }

  async function erase(): Promise<void> {
    if (!declining) return;
    setDeclineBusy(true);
    setDeclineError(null);
    try {
      await eraseProposal(declining.id);
      setDeclining(null);
      onChanged();
    } catch {
      setDeclineError("We could not remove that just now. Please try again.");
    } finally {
      setDeclineBusy(false);
    }
  }

  // A failed row is no longer pending server-side, but hide it here too so a slow refetch
  // never shows the same proposal twice.
  const pending = proposals.filter((p) => !failed.some((f) => f.proposal.id === p.id));
  if (pending.length === 0 && failed.length === 0) return null;

  return (
    <View>
      <SectionHeader title="Nikki asks" />
      <Stack gap="sm">
        {failed.map(({ proposal, error }) => (
          <Card key={proposal.id} elevation="card" style={styles.failedCard}>
            <Stack gap="md">
              <Stack direction="row" gap="sm" align="center">
                <Icon name="warning" color="danger" size={theme.iconSize.sm} />
                <Text variant="caption" tone="danger">
                  This one did not go through
                </Text>
              </Stack>
              <Text variant="bodyStrong">{proposalSummary(proposal)}</Text>
              {proposal.proposal_type === "new_person" ? (
                <Text variant="caption" tone="textSecondary">
                  {UNVERIFIED_CAPTION}
                </Text>
              ) : null}
              <Text variant="caption" tone="danger">
                {error}
              </Text>
              <Stack direction="row" gap="sm">
                <Stack flex>
                  <Button label="Try again" icon="refresh" loading={busyId === proposal.id} onPress={() => void approve(proposal)} />
                </Stack>
                <Stack flex>
                  <Button label="Dismiss" icon="close" variant="secondary" onPress={() => dismissFailed(proposal.id)} />
                </Stack>
              </Stack>
            </Stack>
          </Card>
        ))}
        {pending.map((proposal) => (
          <Card key={proposal.id} elevation="card">
            <Stack gap="md">
              <Stack direction="row" gap="sm" align="center">
                <Icon name="sparkle" color="accent" size={theme.iconSize.sm} />
                <Text variant="caption" tone="textSecondary">
                  Nikki heard this and wants to check with you
                </Text>
              </Stack>
              {proposal.source_quote ? (
                <Text variant="caption" tone="textSecondary" style={styles.quote}>
                  {`“${proposal.source_quote}”`}
                </Text>
              ) : null}
              <Text variant="bodyStrong">{proposalSummary(proposal)}</Text>
              {proposal.proposal_type === "new_person" ? (
                <Text variant="caption" tone="textSecondary">
                  {UNVERIFIED_CAPTION}
                </Text>
              ) : null}
              <Stack gap="sm">
                <Button label="Add this" icon="check" loading={busyId === proposal.id} onPress={() => void approve(proposal)} />
                <Stack direction="row" gap="sm">
                  <Stack flex>
                    <Button label="Check & edit" icon="edit" variant="secondary" onPress={() => setEditing(proposal)} />
                  </Stack>
                  <Stack flex>
                    <Button label="Not right" icon="close" variant="secondary" onPress={() => openDecline(proposal)} />
                  </Stack>
                </Stack>
              </Stack>
            </Stack>
          </Card>
        ))}
      </Stack>

      <ProposalEditModal
        visible={editing !== null}
        proposal={editing}
        onClose={() => setEditing(null)}
        onChanged={onChanged}
      />

      <Modal visible={declining !== null} animationType="slide" transparent onRequestClose={() => setDeclining(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text variant="title">Not right?</Text>
              <Text variant="body" tone="textSecondary">
                Tell Nikki why, so she knows not to bring it up again.
              </Text>
              {declining ? <Text variant="caption" tone="textSecondary">{proposalSummary(declining)}</Text> : null}

              <View style={styles.chipRow}>
                {DECLINE_REASONS.map(({ reason, label }) => {
                  const selected = declineReason === reason;
                  return (
                    <Pressable
                      key={reason}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={label}
                      onPress={() => setDeclineReason(reason)}
                      style={({ pressed }) => [styles.chip, selected ? styles.chipSelected : null, pressed ? styles.pressed : null]}
                    >
                      <Text variant="bodyStrong" tone={selected ? "onPrimary" : "textSecondary"}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {declineError ? (
                <Text variant="caption" tone="danger">
                  {declineError}
                </Text>
              ) : null}

              <Stack gap="sm" style={styles.actions}>
                <Button label="Decline" icon="close" loading={declineBusy} disabled={!declineReason} onPress={() => void confirmDecline()} />
                <Button label="Cancel" variant="secondary" onPress={() => setDeclining(null)} />
              </Stack>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove completely"
                onPress={() => void erase()}
                disabled={declineBusy}
                style={({ pressed }) => [styles.eraseLink, pressed ? styles.pressed : null]}
              >
                <Text variant="caption" tone="danger" center>
                  Remove completely — this should never have been kept
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  quote: { fontStyle: "italic" },
  failedCard: { borderLeftWidth: 4, borderLeftColor: theme.colors.danger },
  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.background, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, maxHeight: "92%", paddingTop: theme.spacing.md },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.border, marginBottom: theme.spacing.sm },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  chip: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    minHeight: 44,
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: theme.colors.primary },
  actions: { marginTop: theme.spacing.sm },
  eraseLink: { minHeight: 44, justifyContent: "center" },
  pressed: { opacity: 0.9 },
});
