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
import { ProposalChartsSummaryRow } from '../../components/proposal_charts_summary';
import {
  ProposalsQueue,
  buildProposalQueueSections,
  countOpenProposals,
} from '../../components/proposals_queue';
import { useProposalsList } from '../../hooks/use_proposals_list';

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
    data: proposalsData,
    isLoading: isProposalsLoading,
    error: proposalsError,
  } = useProposalsList();

  // One derivation for the header and the sections so the count above the queue
  // and the cards inside it cannot disagree. Excludes `closed`: a decided
  // proposal needs nobody, and the header says "N actions need you".
  const openProposalCount = useMemo(
    () => countOpenProposals(buildProposalQueueSections(proposalsData?.groups)),
    [proposalsData?.groups]
  );

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
            isLoading={isLoading || (isProposalsLoading && !proposalsData)}
            // Gated on `!proposalsData` so keepPreviousData is not thrown away
            // by one transient refetch failure flipping the title over a queue
            // that is rendering fine.
            hasError={Boolean(proposalsError && !proposalsData)}
            isQueueEmpty={
              !isProposalsLoading && sortedConversations.length === 0 && openProposalCount === 0
            }
            eventCount={openProposalCount}
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

        {/* Proposals grouped by action category, with conversation titles, from
            the AlertZero route. Renders nothing when there is nothing pending or
            recently decided, so the conversation queue below is unaffected. */}
        <EuiFlexItem grow={false}>
          <ProposalsQueue />
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

        {!isLoading && !error
          ? groupedBriefingItems
              .filter((group) => group.items.length > 0)
              .map((group) => (
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
