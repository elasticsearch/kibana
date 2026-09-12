/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSpacer,
} from '@elastic/eui';
import { KbnDangerCallout, KbnWarningCallout } from '@kbn/ui-callout';
import { MAX_PROPOSALS_SIZE } from '@kbn/agentic-investigations-plugin/common';
import { CLOSED_GROUP_KEY, type ProposalGroups } from '../../../common/proposals/list';
import { useProposalsList, DEFAULT_PROPOSALS_WINDOW_HOURS } from '../../hooks/use_proposals_list';
import { useProposalDecisions } from '../../hooks/use_proposal_decisions';
import { ProposalDecisionModals } from '../pending_proposals/proposal_decision_modals';
import * as pendingI18n from '../pending_proposals/translations';
import {
  PROPOSAL_QUEUE_CATEGORIES,
  PROPOSAL_QUEUE_SECTIONS,
  CLOSED_VISIBLE_LIMIT,
} from './constants';
import { ProposalsQueueSection } from './proposals_queue_section';
import * as i18n from './translations';

export interface ProposalQueueSection {
  id: string;
  label: string;
  proposals: ProposalGroups[string];
}

/**
 * The three named sections in design order, empty sections included so their
 * positions are stable, then any extra non-empty categories the server sent
 * (sorted for determinism). `closed` is excluded — it is rendered separately.
 *
 * `proposalCategorySchema` is an open bounded string, not an enum, so a
 * hard-coded list can't be exhaustive. `Object.keys(groups)` alone has no
 * stable order (server insertion order follows `createdAt ASC`, so sections
 * would reshuffle between refetches). Hence both.
 *
 * Exported so the landing page can reuse it to derive the header count from
 * the same data as the sections, making them arithmetically incapable of
 * disagreeing.
 */
export const buildProposalQueueSections = (
  groups: ProposalGroups | undefined
): ProposalQueueSection[] => {
  if (!groups) return [];

  const named = PROPOSAL_QUEUE_SECTIONS.map(({ id, category, label }) => ({
    id,
    label,
    proposals: groups[category] ?? [],
  }));

  const extra = Object.keys(groups)
    .filter(
      (key) =>
        key !== CLOSED_GROUP_KEY &&
        !PROPOSAL_QUEUE_CATEGORIES.has(key) &&
        (groups[key]?.length ?? 0) > 0
    )
    .sort()
    .map((key) => ({
      id: key,
      // Any category an action declares; fall back to the raw key rather than
      // dropping a section we have no label for.
      label: key,
      proposals: groups[key],
    }));

  return [...named, ...extra];
};

/**
 * Open-proposal count: sum of all named + extra sections, excluding `closed`.
 * Decided proposals need nobody — the header says "N actions need you".
 *
 * Exported so the landing page derives the header `eventCount` from the same
 * data as the sections.
 */
export const countOpenProposals = (sections: ProposalQueueSection[]): number =>
  sections.reduce((sum, section) => sum + section.proposals.length, 0);

export interface ProposalsQueueProps {
  windowHours?: number;
}

export const ProposalsQueue: React.FC<ProposalsQueueProps> = ({
  windowHours = DEFAULT_PROPOSALS_WINDOW_HOURS,
}) => {
  const { data, isLoading, error } = useProposalsList(windowHours);
  // One controller for the whole queue — `isBusy` and `decisionFailed` are
  // page-level facts. A per-section instance would show the failure callout in
  // one section only and leave other sections' buttons live during an in-flight
  // write.
  const decisions = useProposalDecisions();

  const sections = useMemo(() => buildProposalQueueSections(data?.groups), [data?.groups]);

  // Every branch gated on `!data` so keepPreviousData is never thrown away by
  // a background refetch or a single transient failure. Mirrors the doctrine
  // established in proposal_charts_summary_row.tsx (#290336).
  if (isLoading && !data) {
    return (
      <EuiLoadingSpinner
        size="l"
        aria-label={i18n.LOADING}
        data-test-subj="alertZeroProposalsQueueLoading"
      />
    );
  }

  if (error && !data) {
    return (
      <EuiEmptyPrompt
        iconType="warning"
        title={<h3>{i18n.LOAD_ERROR}</h3>}
        data-test-subj="alertZeroProposalsQueueError"
      />
    );
  }

  // Nothing pending and nothing decided: the page header already signals this,
  // and three empty accordions say it worse. Preserves the `hideWhenEmpty`
  // behaviour of the panel this replaces.
  if (!data || data.total === 0) {
    return null;
  }

  const closed = data.groups[CLOSED_GROUP_KEY] ?? [];

  return (
    <EuiFlexGroup direction="column" gutterSize="m" data-test-subj="alertZeroProposalsQueue">
      {data.truncated ? (
        <EuiFlexItem grow={false}>
          <KbnWarningCallout
            title={i18n.TRUNCATED(MAX_PROPOSALS_SIZE)}
            data-test-subj="alertZeroProposalsTruncated"
          />
        </EuiFlexItem>
      ) : null}

      {decisions.decisionFailed ? (
        <EuiFlexItem grow={false}>
          <KbnDangerCallout announceOnMount title={pendingI18n.DECISION_FAILED} />
        </EuiFlexItem>
      ) : null}

      {sections.map(({ id, label, proposals }) => (
        <EuiFlexItem key={id} grow={false}>
          <ProposalsQueueSection
            id={id}
            label={label}
            proposals={proposals}
            isBusy={decisions.isBusy}
            initialIsOpen
            onApprove={decisions.requestApproval}
            onDismiss={decisions.requestDismissal}
          />
        </EuiFlexItem>
      ))}

      {closed.length > 0 ? (
        <>
          <EuiSpacer size="s" />
          <EuiFlexItem grow={false}>
            <ProposalsQueueSection
              id={CLOSED_GROUP_KEY}
              label={i18n.CLOSED_SECTION_LABEL}
              caption={i18n.CLOSED_SECTION_CAPTION}
              proposals={closed}
              isBusy={decisions.isBusy}
              initialIsOpen={false}
              maxVisible={CLOSED_VISIBLE_LIMIT}
              onApprove={decisions.requestApproval}
              onDismiss={decisions.requestDismissal}
            />
          </EuiFlexItem>
        </>
      ) : null}

      <ProposalDecisionModals decisions={decisions} />
    </EuiFlexGroup>
  );
};
