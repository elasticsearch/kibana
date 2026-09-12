/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';
import type { GetProposalsListResponse, ProposalItem } from '../../../common/proposals/list';
import { ConversationsPage } from './conversations_page';
import { useInvestigations } from '../../hooks/use_investigations_api';
import { useProposalsList } from '../../hooks/use_proposals_list';
import { usePendingProposals } from '../../hooks/use_proposals_api';

jest.mock('../../hooks/use_alertzero_doc_title', () => ({ useAlertZeroDocTitle: jest.fn() }));
jest.mock('../../hooks/use_investigations_api');
jest.mock('../../hooks/use_proposals_list');
jest.mock('../../hooks/use_proposals_api');

// AlertZeroPageHeader calls useKibana (via useKibanaTimeZone) and EUI hooks — stub it
// so this test stays isolated on the page's prop-passing logic, not the header's internals.
// alertzero_page_header.test.tsx owns the rendering contract.
jest.mock('../../components/alertzero_page_header', () => ({
  AlertZeroPageHeader: ({
    isQueueEmpty,
    hasError,
    eventCount,
  }: {
    isQueueEmpty?: boolean;
    hasError?: boolean;
    eventCount?: number;
  }) => {
    if (hasError) return <span>{"Your action count couldn't be loaded"}</span>;
    if (isQueueEmpty) return <span>No events found</span>;
    const n = eventCount ?? 0;
    if (n > 0) return <span>{n === 1 ? `${n} action needs you` : `${n} actions need you`}</span>;
    return null;
  },
}));

// Stub heavy children that own their own fetches or render @elastic/charts
jest.mock('../../components/proposal_charts_summary', () => ({
  ProposalChartsSummaryRow: () => null,
}));
jest.mock('@kbn/agentic-investigations-common', () => ({
  ConversationQueue: () => null,
  ConversationDetailsFlyout: () => null,
  BlastRadius: () => null,
  AssignActionModal: () => null,
  BaseActionModal: () => null,
  ApprovalModal: () => null,
  MODAL_TRANSLATIONS: { dismiss: { title: '', rationalePlaceholder: '', actionButtonLabel: '' } },
}));
// AlertZeroPageSection calls useEuiTheme — stub to avoid a layout cascade.
jest.mock('../../components/layout/alertzero_page_section', () => ({
  AlertZeroPageSection: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// ProposalsQueue itself has its own tests; stub it to keep this test focused
// on the page's header count and platform-endpoint gating.
jest.mock('../../components/proposals_queue', () => ({
  ProposalsQueue: () => <div data-test-subj="alertZeroProposalsQueue" />,
  buildProposalQueueSections: jest.requireActual('../../components/proposals_queue')
    .buildProposalQueueSections,
  countOpenProposals: jest.requireActual('../../components/proposals_queue').countOpenProposals,
}));

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <EuiProvider>{children}</EuiProvider>
);

const mockUseInvestigations = jest.mocked(useInvestigations);
const mockUseProposalsList = jest.mocked(useProposalsList);
const mockUsePendingProposals = jest.mocked(usePendingProposals);

const proposal = (overrides: Partial<ProposalItem> = {}): ProposalItem =>
  ({
    id: 'p-1',
    spaceId: 'default',
    conversationId: 'conv-1',
    comment: 'Tune the noisy rule',
    status: 'pending',
    impact: 'low',
    confidence: 'medium',
    category: 'contain',
    origin: 'worker',
    createdAt: '2026-09-01T00:00:00.000Z',
    expired: false,
    ...overrides,
  } as ProposalItem);

const makeProposalsResponse = (
  overrides: Partial<GetProposalsListResponse> = {}
): GetProposalsListResponse => ({
  groups: { closed: [] },
  total: 0,
  truncated: false,
  ...overrides,
});

const setupInvestigations = () => {
  mockUseInvestigations.mockReturnValue({
    data: { investigations: [] },
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useInvestigations>);
};

const setupProposals = (response: GetProposalsListResponse) => {
  mockUseProposalsList.mockReturnValue({
    data: response,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useProposalsList>);
};

beforeEach(() => {
  jest.clearAllMocks();
  setupInvestigations();
  // usePendingProposals should not be called on the landing page
  mockUsePendingProposals.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof usePendingProposals>);
});

describe('ConversationsPage', () => {
  it('counts only open proposals in the header, not the decided ones', () => {
    // investigate × 2 open + closed × 1 decided → header says "2 actions need you"
    setupProposals(
      makeProposalsResponse({
        groups: {
          closed: [proposal({ status: 'dismissed', decidedAt: '2026-09-01T01:00:00Z' })],
          investigate: [
            proposal({ id: 'p-1', category: 'investigate' }),
            proposal({ id: 'p-2', category: 'investigate' }),
          ],
        },
        total: 3,
      })
    );

    render(<ConversationsPage />, { wrapper });

    // The header derives the count from the same sections the queue renders,
    // not from `total` (which includes closed). A naive `total` would say 3.
    expect(screen.getByText(/2 actions need you/i)).toBeInTheDocument();
  });

  it('does not call usePendingProposals — the platform endpoint is removed from the landing page', () => {
    // Requirement 5: the direct PROPOSALS_INTERNAL_URL call must not fire from
    // the landing page. If PendingProposalsPanel is re-added here, this fails.
    setupProposals(makeProposalsResponse());

    render(<ConversationsPage />, { wrapper });

    expect(mockUsePendingProposals).not.toHaveBeenCalled();
  });

  it('says the count is unavailable when the grouped list fails with no data', () => {
    mockUseProposalsList.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('network failure'),
    } as unknown as ReturnType<typeof useProposalsList>);

    render(<ConversationsPage />, { wrapper });

    expect(screen.getByText(/couldn't be loaded/i)).toBeInTheDocument();
  });

  it('keeps the count when a refetch fails after data arrived', () => {
    // `error && !data` gate — data is present, so the header must keep counting.
    mockUseProposalsList.mockReturnValue({
      data: makeProposalsResponse({
        groups: { closed: [], investigate: [proposal({ category: 'investigate' })] },
        total: 1,
      }),
      isLoading: false,
      error: new Error('transient'),
    } as unknown as ReturnType<typeof useProposalsList>);

    render(<ConversationsPage />, { wrapper });

    expect(screen.getByText(/1 action needs you/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't be loaded/i)).toBeNull();
  });

  it('reports an empty queue only when both conversations and proposals are empty', () => {
    // Both empty → "No events found"
    setupProposals(makeProposalsResponse({ groups: { closed: [] }, total: 0 }));
    const { rerender } = render(<ConversationsPage />, { wrapper });
    expect(screen.getByText(/No events found/i)).toBeInTheDocument();

    // One pending proposal → no longer empty
    mockUseProposalsList.mockReturnValue({
      data: makeProposalsResponse({
        groups: { closed: [], contain: [proposal()] },
        total: 1,
      }),
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useProposalsList>);
    rerender(<ConversationsPage />);
    expect(screen.queryByText(/No events found/i)).toBeNull();
  });
});
