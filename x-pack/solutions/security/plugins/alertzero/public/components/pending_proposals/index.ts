/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { PendingProposalsPanel } from './pending_proposals_panel';
export type { PendingProposalsPanelProps } from './pending_proposals_panel';
// ProposalDecisionCard and ProposalDecisionModals are also used by the grouped
// landing-page queue (public/components/proposals_queue/) which shares the
// same approve/dismiss decision machinery via useProposalDecisions.
export { ProposalDecisionCard } from './proposal_decision_card';
export type { ProposalDecisionCardProps } from './proposal_decision_card';
export { ProposalDecisionModals } from './proposal_decision_modals';
export type { ProposalDecisionModalsProps } from './proposal_decision_modals';
export { DismissProposalModal } from './dismiss_proposal_modal';
