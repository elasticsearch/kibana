/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { css } from '@emotion/react';
import {
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  useEuiTheme,
} from '@elastic/eui';
import {
  CONVERSATION_QUEUE_CATEGORIES,
  type Investigation,
  type RecommendedAction,
} from '@kbn/alertzero-common';
import {
  ConversationQueue,
  type ConversationsActionsGroupProps,
  type BaseActionsProps,
  type CardActionType,
  ConversationDetailsFlyout,
  BlastRadius,
  AssignActionModal,
  BaseActionModal,
  MODAL_TRANSLATIONS,
  ApprovalModal,
} from '@kbn/agentic-investigations-common';
import { AlertZeroPageSection } from '../../components/layout/alertzero_page_section';
import { AlertZeroPageHeader } from '../../components/alertzero_page_header';
import { useAlertZeroDocTitle } from '../../hooks/use_alertzero_doc_title';
import { useInvestigations } from '../../hooks/use_investigations_api';
import { QUEUE_PAGE_INFO } from './translations';
import { PendingProposalsPanel } from '../../components/pending_proposals';
import { useProposalChartsSummary } from '../../hooks/use_proposal_charts_summary';
import { ProposalChartsSummaryRow } from '../../components/proposal_charts_summary';

const QUEUE_STATUSES = new Set(['open', 'investigating', 'in-progress', 'escalated']);

const isQueueRow = (investigation: Investigation): boolean =>
  QUEUE_STATUSES.has(investigation.status ?? 'open');

export const ConversationsPage: React.FC = () => {
  const { euiTheme } = useEuiTheme();
  const { data, isLoading, error } = useInvestigations();
  const [surfaceFilter, setSurfaceFilter] = useState<string | null>(null);
  useAlertZeroDocTitle(QUEUE_PAGE_INFO.pageTitle);

  const [selectedIdForRecommendedAction, setSelectedIdForRecommendedAction] = useState<
    string | undefined
  >(undefined);

  const [selectedIdForDetails, setSelectedIdForDetails] = useState<string | undefined>(undefined);
  const [modalState, setModalState] = useState<{
    type: CardActionType | null;
    recordId: Investigation['recordId'] | null;
    assignee?: string | null;
  }>({ type: null, recordId: null, assignee: null });

  // TODO: update data fetching to use the new conversations API (useConversations) and remove the useInvestigations hook
  const conversations = useMemo(() => data?.investigations ?? [], [data?.investigations]);

  const {
    data: statsData,
    isLoading: isStatsLoading,
    error: statsError,
  } = useProposalChartsSummary();
  const proposalCount = useMemo(() => {
    const lastBucket = statsData?.buckets.at(-1);
    if (!lastBucket) return 0;
    // Every category, not just the three with cards, so `escalate` is counted too.
    return Object.values(lastBucket.counts).reduce((a, b) => a + b, 0);
  }, [statsData]);

  const onClickAction: BaseActionsProps['onClickAction'] = useCallback(
    (action, recordId, assignee = null) => {
      setModalState({ type: action, recordId, assignee });
    },
    [setModalState]
  );

  const onClickCard = useCallback(
    (id: Investigation['recordId']) => {
      setSelectedIdForDetails(id);
    },
    [setSelectedIdForDetails]
  );

  const onClickRecommendedAction: ConversationsActionsGroupProps['onClickRecommendedAction'] =
    useCallback(
      ({ id }) => {
        setSelectedIdForRecommendedAction(id);
      },
      [setSelectedIdForRecommendedAction]
    );

  const selectedRecommendedActionConversation = useMemo(
    () =>
      selectedIdForRecommendedAction
        ? conversations.find((c) => c.id === selectedIdForRecommendedAction)
        : undefined,
    [conversations, selectedIdForRecommendedAction]
  );

  const selectedDetailsConversation: Investigation | undefined = useMemo(
    () =>
      selectedIdForDetails ? conversations.find((c) => c.id === selectedIdForDetails) : undefined,
    [conversations, selectedIdForDetails]
  );

  const sortedConversations = useMemo(
    () =>
      conversations.filter(isQueueRow).sort((a, b) => {
        const priorityDiff = (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return b.updatedAt.localeCompare(a.updatedAt);
      }),
    [conversations]
  );

  const filteredQueueItems = useMemo(
    () =>
      sortedConversations.filter((conversation) => {
        if (surfaceFilter && conversation.affectedSurface !== surfaceFilter) return false;
        return true;
      }),
    [sortedConversations, surfaceFilter]
  );

  const groupedBriefingItems = useMemo(() => {
    const groups: Array<{
      id: RecommendedAction;
      label: string;
      items: Investigation[];
    }> = [];
    for (const bucket of CONVERSATION_QUEUE_CATEGORIES) {
      const items = filteredQueueItems.filter(
        (conversation) => conversation.recommendedAction === bucket.id
      );
      if (items.length >= 0) {
        groups.push({ ...bucket, items });
      }
    }
    return groups;
  }, [filteredQueueItems]);

  return (
    <AlertZeroPageSection
      contentProps={{
        css: css`
          padding-block: ${euiTheme.size.xxl};
          align-self: center;
          max-width: 1000px;
        `,
      }}
    >
      {selectedIdForRecommendedAction && selectedRecommendedActionConversation && (
        <ApprovalModal
          selectedRecommendedActionConversation={selectedRecommendedActionConversation}
          onConfirm={() =>
            // TODO: use action API call hook
            setSelectedIdForRecommendedAction(undefined)
          }
          onClose={() => setSelectedIdForRecommendedAction(undefined)}
        />
      )}

      {selectedIdForDetails && selectedDetailsConversation && (
        <ConversationDetailsFlyout
          investigation={selectedDetailsConversation}
          onClose={() => setSelectedIdForDetails(undefined)}
          onClickAction={onClickAction}
          onClickRecommendedAction={onClickRecommendedAction}
        />
      )}

      {modalState.type === 'assign' && modalState.recordId && (
        <AssignActionModal
          recordId={modalState.recordId}
          initialAssignee={modalState.assignee}
          onClose={() => setModalState({ type: null, recordId: null })}
          onAssign={() => {
            // TODO: use assign action API call hook
            setModalState({ type: null, recordId: null });
          }}
        />
      )}

      {modalState.type === 'dismiss' && modalState.recordId && (
        <BaseActionModal
          type="dismiss"
          title={MODAL_TRANSLATIONS.dismiss.title}
          recordId={modalState.recordId}
          onClose={() => setModalState({ type: null, recordId: null })}
          rationalePlaceholder={MODAL_TRANSLATIONS.dismiss.rationalePlaceholder}
          primaryAction={{
            color: 'danger',
            label: MODAL_TRANSLATIONS.dismiss.actionButtonLabel,
            onClick: () => {
              // TODO: use dismiss action API call hook
              setModalState({ type: null, recordId: null });
            },
          }}
        />
      )}

      <EuiFlexGroup gutterSize="l" direction="column" wrap>
        <EuiFlexItem grow={false}>
          <AlertZeroPageHeader
            // Both queries: the header states something about each, so settling
            // one while the other is in flight would flash a title the next
            // render contradicts.
            isLoading={isLoading || (isStatsLoading && !statsData)}
            hasError={Boolean(statsError)}
            isQueueEmpty={
              !isStatsLoading && sortedConversations.length === 0 && proposalCount === 0
            }
            eventCount={proposalCount}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <ProposalChartsSummaryRow />
        </EuiFlexItem>
        <EuiFlexItem>
          <BlastRadius
            investigations={sortedConversations}
            surfaceFilter={surfaceFilter}
            onSurfaceFilterChange={setSurfaceFilter}
          />
        </EuiFlexItem>

        {/* Durable proposals from the investigation proposals API. Hidden when
            empty so the queue below is unaffected when nothing is pending. */}
        <EuiFlexItem grow={false}>
          <PendingProposalsPanel hideWhenEmpty />
        </EuiFlexItem>

        {isLoading ? (
          <EuiFlexItem grow={false}>
            <EuiFlexGroup justifyContent="center" style={{ minHeight: 200 }}>
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="xl" aria-label={QUEUE_PAGE_INFO.loading} />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        ) : null}

        {error ? (
          <EuiFlexItem grow={false}>
            <EuiEmptyPrompt iconType="warning" title={<h2>{QUEUE_PAGE_INFO.loadError}</h2>} />
          </EuiFlexItem>
        ) : null}

        {!isLoading && !error && filteredQueueItems.length === 0 ? (
          <EuiFlexItem grow={false}>
            <EuiEmptyPrompt
              iconType="chartTagCloud"
              title={<h2>{QUEUE_PAGE_INFO.emptyQueue}</h2>}
            />
          </EuiFlexItem>
        ) : null}

        {!isLoading && !error
          ? groupedBriefingItems.map((group) => (
              <EuiFlexItem key={group.id} grow={false}>
                <ConversationQueue
                  briefingId={group.id}
                  briefingType={group.id as RecommendedAction}
                  briefingList={group.items}
                  isFiltered={filteredQueueItems.length !== sortedConversations.length}
                  onClickRecommendedAction={onClickRecommendedAction}
                  onClickAction={onClickAction}
                  onClickCard={onClickCard}
                />
              </EuiFlexItem>
            ))
          : null}
      </EuiFlexGroup>
    </AlertZeroPageSection>
  );
};
