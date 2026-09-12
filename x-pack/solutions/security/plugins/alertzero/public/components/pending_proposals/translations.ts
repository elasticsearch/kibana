/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const SECTION_TITLE = i18n.translate('xpack.alertzero.pendingProposals.sectionTitle', {
  defaultMessage: 'Awaiting your decision',
});

export const LOADING = i18n.translate('xpack.alertzero.pendingProposals.loading', {
  defaultMessage: 'Loading proposals',
});

export const LOAD_ERROR = i18n.translate('xpack.alertzero.pendingProposals.loadError', {
  defaultMessage: 'Unable to load proposals',
});

export const EMPTY = i18n.translate('xpack.alertzero.pendingProposals.empty', {
  defaultMessage: 'No proposals are awaiting a decision',
});

export const APPROVE = i18n.translate('xpack.alertzero.pendingProposals.approve', {
  defaultMessage: 'Approve',
});

export const DISMISS = i18n.translate('xpack.alertzero.pendingProposals.dismiss', {
  defaultMessage: 'Dismiss',
});

export const EXPIRED = i18n.translate('xpack.alertzero.pendingProposals.expired', {
  defaultMessage: 'Expired',
});

export const NO_ACTION = i18n.translate('xpack.alertzero.pendingProposals.noAction', {
  defaultMessage: 'No automated action — carry this out yourself, then approve',
});

export const APPROVE_MODAL_TITLE = i18n.translate(
  'xpack.alertzero.pendingProposals.approveModalTitle',
  {
    defaultMessage: 'Approve this action?',
  }
);

export const APPROVE_CONFIRM = i18n.translate('xpack.alertzero.pendingProposals.approveConfirm', {
  defaultMessage: 'Approve and run',
});

export const APPROVE_RUNS_AS_YOU = i18n.translate(
  'xpack.alertzero.pendingProposals.approveRunsAsYou',
  {
    defaultMessage: 'The action runs under your identity and is attributed to you.',
  }
);

export const DISMISS_MODAL_TITLE = i18n.translate(
  'xpack.alertzero.pendingProposals.dismissModalTitle',
  {
    defaultMessage: 'Dismiss this proposal?',
  }
);

export const DISMISS_RATIONALE_PLACEHOLDER = i18n.translate(
  'xpack.alertzero.pendingProposals.dismissRationalePlaceholder',
  { defaultMessage: 'Why is this proposal being dismissed?' }
);

export const DISMISS_REASON_LABEL = i18n.translate(
  'xpack.alertzero.pendingProposals.dismissReasonLabel',
  { defaultMessage: 'Reason' }
);

export const CANCEL = i18n.translate('xpack.alertzero.pendingProposals.cancel', {
  defaultMessage: 'Cancel',
});

export const DECISION_FAILED = i18n.translate('xpack.alertzero.pendingProposals.decisionFailed', {
  defaultMessage: 'The decision could not be recorded. Reload the queue and try again.',
});

/**
 * Pre-translated per-status labels. A `Record` over `ProposalStatus` (not
 * `Record<string, …>`) so adding a status upstream is a compile error here
 * rather than a silently blank badge at runtime. Colors live next to
 * `IMPACT_COLORS` in the card file.
 *
 * 'pending' is included for completeness; in practice pending proposals render
 * the Approve / Dismiss buttons rather than this label.
 */
export const PROPOSAL_STATUS_LABELS: Record<
  'pending' | 'approved' | 'executing' | 'succeeded' | 'failed' | 'dismissed',
  string
> = {
  pending: i18n.translate('xpack.alertzero.pendingProposals.status.pending', {
    defaultMessage: 'Pending',
  }),
  approved: i18n.translate('xpack.alertzero.pendingProposals.status.approved', {
    defaultMessage: 'Approved',
  }),
  executing: i18n.translate('xpack.alertzero.pendingProposals.status.executing', {
    defaultMessage: 'Running',
  }),
  succeeded: i18n.translate('xpack.alertzero.pendingProposals.status.succeeded', {
    defaultMessage: 'Done',
  }),
  failed: i18n.translate('xpack.alertzero.pendingProposals.status.failed', {
    defaultMessage: 'Failed',
  }),
  dismissed: i18n.translate('xpack.alertzero.pendingProposals.status.dismissed', {
    defaultMessage: 'Dismissed',
  }),
};

export const DISMISS_REASON_LABELS: Record<string, string> = {
  wrong: i18n.translate('xpack.alertzero.pendingProposals.dismissReason.wrong', {
    defaultMessage: 'Wrong',
  }),
  duplicate: i18n.translate('xpack.alertzero.pendingProposals.dismissReason.duplicate', {
    defaultMessage: 'Duplicate',
  }),
  insufficient_evidence: i18n.translate(
    'xpack.alertzero.pendingProposals.dismissReason.insufficientEvidence',
    { defaultMessage: 'Insufficient evidence' }
  ),
  low_value: i18n.translate('xpack.alertzero.pendingProposals.dismissReason.lowValue', {
    defaultMessage: 'Low value',
  }),
  out_of_scope: i18n.translate('xpack.alertzero.pendingProposals.dismissReason.outOfScope', {
    defaultMessage: 'Out of scope',
  }),
  already_handled: i18n.translate('xpack.alertzero.pendingProposals.dismissReason.alreadyHandled', {
    defaultMessage: 'Already handled',
  }),
  other: i18n.translate('xpack.alertzero.pendingProposals.dismissReason.other', {
    defaultMessage: 'Other',
  }),
};
