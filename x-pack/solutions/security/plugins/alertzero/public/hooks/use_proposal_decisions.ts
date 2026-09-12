/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useState } from 'react';
import type {
  DismissReason,
  ProposalWithMetadata,
} from '@kbn/agentic-investigations-plugin/common';
import { useApproveProposal, useDismissProposal } from './use_proposals_api';

/**
 * The approve/dismiss machinery shared by the per-conversation panel and the
 * landing-page grouped queue. One place holds the rule that an approval must
 * submit the action input that was *rendered* — that is what lets the API
 * refuse an approval that no longer matches the stored proposal. Two copies of
 * that rule means one will eventually drift.
 */
export const useProposalDecisions = () => {
  const approve = useApproveProposal();
  const dismiss = useDismissProposal();

  const [pendingApproval, setPendingApproval] = useState<ProposalWithMetadata | undefined>();
  const [pendingDismissal, setPendingDismissal] = useState<ProposalWithMetadata | undefined>();

  const cancelApproval = useCallback(() => setPendingApproval(undefined), []);
  const cancelDismissal = useCallback(() => setPendingDismissal(undefined), []);

  const confirmApproval = useCallback(() => {
    if (!pendingApproval) {
      return;
    }
    // Submitting the input we rendered lets the API refuse an approval that no
    // longer matches the stored proposal.
    approve.mutate(
      { id: pendingApproval.id, body: { actionInput: pendingApproval.actionInput } },
      { onSettled: () => setPendingApproval(undefined) }
    );
  }, [approve, pendingApproval]);

  const confirmDismissal = useCallback(
    ({ dismissReason, rationale }: { dismissReason: DismissReason; rationale: string }) => {
      if (!pendingDismissal) {
        return;
      }
      dismiss.mutate(
        { id: pendingDismissal.id, body: { dismissReason, rationale } },
        { onSettled: () => setPendingDismissal(undefined) }
      );
    },
    [dismiss, pendingDismissal]
  );

  return {
    isBusy: approve.isLoading || dismiss.isLoading,
    isApproving: approve.isLoading,
    decisionFailed: approve.isError || dismiss.isError,
    pendingApproval,
    pendingDismissal,
    requestApproval: setPendingApproval,
    requestDismissal: setPendingDismissal,
    cancelApproval,
    cancelDismissal,
    confirmApproval,
    confirmDismissal,
  };
};

export type ProposalDecisions = ReturnType<typeof useProposalDecisions>;
