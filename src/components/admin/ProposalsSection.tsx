// src/components/admin/ProposalsSection.tsx — the "Nikki asks" review cards (plan §4.3, FR-7).
// Each pending proposal shows what Nikki heard (the quote), a plain-language summary, and three
// choices: add it, check & edit it first, or decline. Declining opens a small sheet with a reason
// (so Nikki won't re-ask); "remove completely" erases the row for things that should never have
// been stored. Failed approvals are kept in local state so the admin sees what went wrong.
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Card, Icon, Stack, Text } from "../../primitives";
import { useT } from "../../i18n";
import SectionHeader from "./SectionHeader";
import ProposalEditModal from "./ProposalEditModal";
import BottomSheetModal from "../shared/BottomSheetModal";
import { approveAndApply, declineProposal, eraseProposal, listPendingProposals } from "../../services/proposalService";
import { subscribeLive } from "../../features/sync/liveChannel";
import type { DeclineReason, NikkiProposal } from "../../types/database";

type Props = {
  olderAdultId: string; // reserved for deep-links; actions run off each proposal row itself
  proposals: NikkiProposal[];
  onChanged: () => void;
};

type TFn = (key: string, params?: Record<string, string | number>) => string;

const DECLINE_REASONS: { reason: DeclineReason; labelKey: string }[] = [
  { reason: "already_known", labelKey: "review.decline.alreadyKnown" },
  { reason: "not_true", labelKey: "review.decline.notTrue" },
  { reason: "family_prefers_not", labelKey: "review.decline.preferNot" },
];

function payloadStr(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

// A friendly one-line summary from type + payload only — never from LLM free text.
export function proposalSummary(proposal: NikkiProposal, t: TFn): string {
  const p = proposal.payload ?? {};
  const name = payloadStr(p, "full_name") ?? payloadStr(p, "preferred_name");
  const title = payloadStr(p, "title");
  switch (proposal.proposal_type) {
    case "new_person": {
      if (!name) return t("review.summary.newPersonEmpty");
      const rel = payloadStr(p, "relationship_label");
      return rel
        ? t("review.summary.newPersonWithRel", { name, relationship: rel })
        : t("review.summary.newPerson", { name });
    }
    case "person_update":
      return name ? t("review.summary.personUpdate", { name }) : t("review.summary.personUpdateEmpty");
    case "relationship":
      return t("review.summary.relationship");
    case "memory":
      return title ? t("review.summary.memory", { title }) : t("review.summary.memoryEmpty");
    case "fact":
      return title ?? payloadStr(p, "content")?.slice(0, 60) ?? t("review.summary.factEmpty");
    case "event":
      return title ? t("review.summary.event", { title }) : t("review.summary.eventEmpty");
    case "reminder":
      return title ? t("review.summary.reminder", { title }) : t("review.summary.reminderEmpty");
    case "profile_update": {
      const dob = payloadStr(p, "date_of_birth");
      if (dob) return t("review.summary.birthday", { date: dob });
      const goesBy = payloadStr(p, "preferred_name");
      if (goesBy) return t("review.summary.goesBy", { name: goesBy });
      const addr = payloadStr(p, "home_address");
      if (addr) return t("review.summary.homeAddress", { address: addr });
      const language = payloadStr(p, "primary_language");
      if (language) return t("review.summary.language", { language });
      return t("review.summary.profileEmpty");
    }
    case "safe_location": {
      const place = payloadStr(p, "name");
      return place ? t("review.summary.safeLocation", { name: place }) : t("review.summary.safeLocationEmpty");
    }
    default:
      return t("review.summary.default");
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
  const { t } = useT();
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
      const error = t("review.error.couldNotAdd", { error: result.error ?? t("review.error.pleaseTryAgain") });
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
      setDeclineError(t("review.error.couldNotSave"));
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
      setDeclineError(t("review.error.couldNotRemove"));
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
      <SectionHeader title={t("review.title")} />
      <Stack gap="sm">
        {failed.map(({ proposal, error }) => (
          <Card key={proposal.id} elevation="card" style={styles.failedCard}>
            <Stack gap="md">
              <Stack direction="row" gap="sm" align="center">
                <Icon name="warning" color="danger" size={theme.iconSize.sm} />
                <Stack flex>
                  <Text variant="caption" tone="danger">
                    {t("review.failedTitle")}
                  </Text>
                </Stack>
              </Stack>
              <Text variant="bodyStrong">{proposalSummary(proposal, t)}</Text>
              {proposal.proposal_type === "new_person" ? (
                <Text variant="caption" tone="textSecondary">
                  {t("review.unverifiedCaption")}
                </Text>
              ) : null}
              <Text variant="caption" tone="danger">
                {error}
              </Text>
              <Stack direction="row" gap="sm">
                <Stack flex>
                  <Button label={t("common.tryAgain")} icon="refresh" loading={busyId === proposal.id} onPress={() => void approve(proposal)} />
                </Stack>
                <Stack flex>
                  <Button label={t("review.dismiss")} icon="close" variant="secondary" onPress={() => dismissFailed(proposal.id)} />
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
                <Stack flex>
                  <Text variant="caption" tone="textSecondary">
                    {t("review.heardCaption")}
                  </Text>
                </Stack>
              </Stack>
              {proposal.source_quote ? (
                <Text variant="caption" tone="textSecondary" style={styles.quote}>
                  {`“${proposal.source_quote}”`}
                </Text>
              ) : null}
              <Text variant="bodyStrong">{proposalSummary(proposal, t)}</Text>
              {proposal.proposal_type === "new_person" ? (
                <Text variant="caption" tone="textSecondary">
                  {t("review.unverifiedCaption")}
                </Text>
              ) : null}
              <Stack gap="sm">
                <Button label={t("review.addThis")} icon="check" loading={busyId === proposal.id} onPress={() => void approve(proposal)} />
                <Stack direction="row" gap="sm">
                  <Stack flex>
                    <Button label={t("review.checkEdit")} icon="edit" variant="secondary" onPress={() => setEditing(proposal)} />
                  </Stack>
                  <Stack flex>
                    <Button label={t("review.notRight")} icon="close" variant="secondary" onPress={() => openDecline(proposal)} />
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

      <BottomSheetModal
        visible={declining !== null}
        onClose={() => setDeclining(null)}
        title={t("review.declineTitle")}
        subtitle={t("review.declineSubtitle")}
      >
        {declining ? <Text variant="caption" tone="textSecondary">{proposalSummary(declining, t)}</Text> : null}

        <View style={styles.chipRow}>
          {DECLINE_REASONS.map(({ reason, labelKey }) => {
            const selected = declineReason === reason;
            const label = t(labelKey);
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
          <Button label={t("review.declineAction")} icon="close" loading={declineBusy} disabled={!declineReason} onPress={() => void confirmDecline()} />
          <Button label={t("common.cancel")} variant="secondary" onPress={() => setDeclining(null)} />
        </Stack>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("review.removeCompletelyA11y")}
          onPress={() => void erase()}
          disabled={declineBusy}
          style={({ pressed }) => [styles.eraseLink, pressed ? styles.pressed : null]}
        >
          <Text variant="caption" tone="danger" center>
            {t("review.removeCompletely")}
          </Text>
        </Pressable>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  quote: { fontStyle: "italic" },
  failedCard: { borderLeftWidth: 4, borderLeftColor: theme.colors.danger },
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
