/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';
import type { ProposalItem, GetProposalsListResponse } from '../../../common/proposals/list';
import { CLOSED_GROUP_KEY } from '../../../common/proposals/list';
import { useProposalsList } from '../../hooks/use_proposals_list';
import { useApproveProposal, useDismissProposal } from '../../hooks/use_proposals_api';
import { buildProposalQueueSections, countOpenProposals, ProposalsQueue } from './proposals_queue';

jest.mock('../../hooks/use_proposals_list');
jest.mock('../../hooks/use_proposals_api');

const mockUseProposalsList = useProposalsList as jest.Mock;
const mockUseApproveProposal = useApproveProposal as jest.Mock;
const mockUseDismissProposal = useDismissProposal as jest.Mock;

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <EuiProvider>{children}</EuiProvider>
);

const proposal = (overrides: Partial<ProposalItem> = {}): ProposalItem =>
  ({
    id: 'p-1',
    spaceId: 'default',
    conversationId: 'conv-1',
    comment: 'Tune the noisy rule',
    actionWorkflowId: 'system-alertzero-action-create-rule',
    actionInput: { name: 'Suspicious PowerShell' },
    status: 'pending',
    impact: 'low',
    confidence: 'medium',
    category: 'contain',
    origin: 'worker',
    createdAt: '2026-09-01T00:00:00.000Z',
    expired: false,
    action: { name: 'Create detection rule', category: 'contain' },
    ...overrides,
  } as ProposalItem);

const makeResponse = (
  overrides: Partial<GetProposalsListResponse> = {}
): GetProposalsListResponse => ({
  groups: { closed: [] },
  total: 0,
  truncated: false,
  ...overrides,
});

const setup = (responseOverrides: Partial<GetProposalsListResponse> = {}) => {
  const approveMutate = jest.fn();
  const dismissMutate = jest.fn();
  mockUseProposalsList.mockReturnValue({
    data: makeResponse(responseOverrides),
    isLoading: false,
    error: null,
  });
  mockUseApproveProposal.mockReturnValue({
    mutate: approveMutate,
    isLoading: false,
    isError: false,
  });
  mockUseDismissProposal.mockReturnValue({
    mutate: dismissMutate,
    isLoading: false,
    isError: false,
  });
  return { approveMutate, dismissMutate };
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Pure-function unit tests ─────────────────────────────────────────────────

describe('buildProposalQueueSections', () => {
  it('returns the three named sections in design order even when groups is empty', () => {
    const sections = buildProposalQueueSections({ closed: [] });
    const ids = sections.map((s) => s.id);
    expect(ids).toEqual(['respond', 'investigate', 'configure']);
  });

  it('never returns a closed section', () => {
    const sections = buildProposalQueueSections({
      closed: [proposal({ status: 'dismissed', decidedAt: '2026-09-01T01:00:00Z' })],
    });
    expect(sections.find((s) => s.id === CLOSED_GROUP_KEY)).toBeUndefined();
  });

  it('appends an unknown category after the three named sections, sorted', () => {
    const sections = buildProposalQueueSections({
      closed: [],
      escalate: [proposal({ category: 'escalate' })],
      zzz: [proposal({ category: 'zzz' })],
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toEqual(['respond', 'investigate', 'configure', 'escalate', 'zzz']);
  });

  it('returns empty proposal arrays for named sections that have no items', () => {
    const sections = buildProposalQueueSections({ closed: [] });
    sections.forEach((s) => {
      expect(s.proposals).toEqual([]);
    });
  });
});

describe('countOpenProposals', () => {
  it('sums proposals across all sections', () => {
    const sections = buildProposalQueueSections({
      closed: [],
      contain: [proposal(), proposal()],
      investigate: [proposal()],
    });
    expect(countOpenProposals(sections)).toBe(3);
  });

  it('returns 0 for empty sections', () => {
    expect(countOpenProposals(buildProposalQueueSections({ closed: [] }))).toBe(0);
  });
});

// ── Component tests ──────────────────────────────────────────────────────────

describe('ProposalsQueue', () => {
  it('renders sections in the order Respond → Investigate → Configure', () => {
    setup({
      groups: {
        closed: [],
        contain: [proposal({ id: 'p-contain' })],
        investigate: [proposal({ id: 'p-investigate', category: 'investigate' })],
        tune: [proposal({ id: 'p-tune', category: 'tune' })],
      },
      total: 3,
    });

    render(<ProposalsQueue />, { wrapper });

    const sections = screen.getAllByTestId(/^alertZeroProposalsQueueSection-/);
    expect(sections.map((el) => el.getAttribute('data-test-subj'))).toEqual([
      'alertZeroProposalsQueueSection-respond',
      'alertZeroProposalsQueueSection-investigate',
      'alertZeroProposalsQueueSection-configure',
    ]);
  });

  it('places each proposal under its own category section', () => {
    setup({
      groups: {
        closed: [],
        contain: [proposal({ id: 'p-contain', category: 'contain' })],
        investigate: [proposal({ id: 'p-investigate', category: 'investigate' })],
      },
      total: 2,
    });

    render(<ProposalsQueue />, { wrapper });

    const respondSection = screen.getByTestId('alertZeroProposalsQueueSection-respond');
    const investigateSection = screen.getByTestId('alertZeroProposalsQueueSection-investigate');

    expect(within(respondSection).queryByTestId('alertZeroProposalCard-p-investigate')).toBeNull();
    expect(within(investigateSection).queryByTestId('alertZeroProposalCard-p-contain')).toBeNull();
  });

  it('renders conversationTitle on the card', () => {
    const p = proposal({ id: 'p-1', conversationTitle: 'Suspicious PowerShell on host-1' });
    setup({ groups: { closed: [], contain: [p] }, total: 1 });

    render(<ProposalsQueue />, { wrapper });

    expect(screen.getByTestId('alertZeroProposalConversationTitle')).toHaveTextContent(
      'Suspicious PowerShell on host-1'
    );
  });

  it('omits the conversation title when absent and does not leak the raw conversation id', () => {
    const p = proposal({ id: 'p-1', conversationId: 'conv-secret', conversationTitle: undefined });
    setup({ groups: { closed: [], contain: [p] }, total: 1 });

    render(<ProposalsQueue />, { wrapper });

    expect(screen.queryByTestId('alertZeroProposalConversationTitle')).toBeNull();
    expect(screen.queryByText('conv-secret')).toBeNull();
  });

  it('appends a section for an unknown category after the three named ones', () => {
    const p = proposal({ id: 'p-esc', category: 'escalate' });
    setup({ groups: { closed: [], escalate: [p] }, total: 1 });

    render(<ProposalsQueue />, { wrapper });

    const sections = screen.getAllByTestId(/^alertZeroProposalsQueueSection-/);
    expect(sections.at(-1)).toHaveAttribute(
      'data-test-subj',
      'alertZeroProposalsQueueSection-escalate'
    );
  });

  it('renders a Closed actions section with caption and ten rows', () => {
    const closed = Array.from({ length: 12 }, (_, i) =>
      proposal({
        id: `closed-${i}`,
        status: 'dismissed',
        decidedAt: '2026-09-01T01:00:00Z',
        expired: false,
      })
    );
    setup({
      groups: { closed },
      total: 12,
    });

    render(<ProposalsQueue />, { wrapper });

    expect(screen.getByTestId('alertZeroProposalsQueueSection-closed')).toBeInTheDocument();
    expect(
      screen.getByText('Closed actions; the investigation may still be open.')
    ).toBeInTheDocument();
    // 10 visible + "Show more (2)" button
    expect(screen.getByTestId('alertZeroProposalsQueueShowMore-closed')).toBeInTheDocument();
    expect(screen.getByText(/Show more \(2\)/)).toBeInTheDocument();
  });

  it('reveals all closed rows on Show more click', () => {
    const closed = Array.from({ length: 12 }, (_, i) =>
      proposal({ id: `closed-${i}`, status: 'dismissed', decidedAt: '2026-09-01T01:00:00Z' })
    );
    setup({ groups: { closed }, total: 12 });

    render(<ProposalsQueue />, { wrapper });

    fireEvent.click(screen.getByTestId('alertZeroProposalsQueueShowMore-closed'));

    expect(screen.queryByTestId('alertZeroProposalsQueueShowMore-closed')).toBeNull();
    // All 12 cards present
    expect(screen.getAllByTestId(/^alertZeroProposalCard-closed-/)).toHaveLength(12);
  });

  it('hides the Closed actions section when closed is empty', () => {
    setup({ groups: { closed: [], contain: [proposal()] }, total: 1 });

    render(<ProposalsQueue />, { wrapper });

    expect(screen.queryByTestId('alertZeroProposalsQueueSection-closed')).toBeNull();
    expect(screen.queryByText('Closed actions')).toBeNull();
  });

  it('shows no Approve/Dismiss buttons on a decided proposal, shows outcome badge instead', () => {
    const p = proposal({
      id: 'p-closed',
      status: 'dismissed',
      decidedAt: '2026-09-01T01:00:00Z',
    });
    // total includes closed items (server derives it from all groups), so the
    // queue renders rather than returning null.
    setup({ groups: { closed: [p] }, total: 1 });

    render(<ProposalsQueue />, { wrapper });

    const closedSection = screen.getByTestId('alertZeroProposalsQueueSection-closed');
    // Expand the accordion (it starts collapsed for closed)
    const trigger = within(closedSection).getByRole('button', { name: /Closed actions/ });
    fireEvent.click(trigger);

    const card = screen.getByTestId('alertZeroProposalCard-p-closed');
    expect(within(card).queryByTestId('alertZeroProposalApprove')).toBeNull();
    expect(within(card).queryByTestId('alertZeroProposalDismiss')).toBeNull();
    expect(within(card).getByTestId('alertZeroProposalDecision')).toBeInTheDocument();
  });

  it('warns when truncated: true with the 500-proposal cap in the message', () => {
    setup({
      groups: { closed: [], contain: [proposal()] },
      total: 1,
      truncated: true,
    });

    render(<ProposalsQueue />, { wrapper });

    const callout = screen.getByTestId('alertZeroProposalsTruncated');
    expect(callout).toBeInTheDocument();
    expect(callout).toHaveTextContent('500');
  });

  it('does not warn when truncated: false', () => {
    setup({ groups: { closed: [], contain: [proposal()] }, total: 1, truncated: false });

    render(<ProposalsQueue />, { wrapper });

    expect(screen.queryByTestId('alertZeroProposalsTruncated')).toBeNull();
  });

  it('surfaces a load failure instead of an empty queue', () => {
    mockUseProposalsList.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    });
    mockUseApproveProposal.mockReturnValue({ mutate: jest.fn(), isLoading: false, isError: false });
    mockUseDismissProposal.mockReturnValue({ mutate: jest.fn(), isLoading: false, isError: false });

    render(<ProposalsQueue />, { wrapper });

    expect(screen.getByTestId('alertZeroProposalsQueueError')).toBeInTheDocument();
  });

  it('keeps sections rendered when a refetch fails after data arrived', () => {
    // `error && !data` gate — data is present so the sections must stay up.
    mockUseProposalsList.mockReturnValue({
      data: makeResponse({ groups: { closed: [], contain: [proposal()] }, total: 1 }),
      isLoading: false,
      error: new Error('transient'),
    });
    mockUseApproveProposal.mockReturnValue({ mutate: jest.fn(), isLoading: false, isError: false });
    mockUseDismissProposal.mockReturnValue({ mutate: jest.fn(), isLoading: false, isError: false });

    render(<ProposalsQueue />, { wrapper });

    expect(screen.queryByTestId('alertZeroProposalsQueueError')).toBeNull();
    expect(screen.getByTestId('alertZeroProposalsQueue')).toBeInTheDocument();
  });

  it('renders nothing when total is 0', () => {
    setup({ groups: { closed: [] }, total: 0 });

    const { container } = render(<ProposalsQueue />, { wrapper });

    expect(container).toBeEmptyDOMElement();
  });

  it('submits the action input it rendered, so a stale approval can be refused', async () => {
    const p = proposal({ id: 'p-1', actionInput: { name: 'Suspicious PowerShell' } });
    const { approveMutate } = setup({
      groups: { closed: [], contain: [p] },
      total: 1,
    });

    render(<ProposalsQueue />, { wrapper });

    fireEvent.click(screen.getByTestId('alertZeroProposalApprove'));
    // Confirm in the modal
    fireEvent.click(screen.getByTestId('alertZeroApproveProposalModal'));
    // The modal's confirm button
    const confirmButton = screen.getByText('Approve and run');
    fireEvent.click(confirmButton);

    expect(approveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'p-1',
        body: { actionInput: { name: 'Suspicious PowerShell' } },
      }),
      expect.any(Object)
    );
  });

  it('reports a failed decision once, above the sections', () => {
    mockUseProposalsList.mockReturnValue({
      data: makeResponse({ groups: { closed: [], contain: [proposal()] }, total: 1 }),
      isLoading: false,
      error: null,
    });
    mockUseApproveProposal.mockReturnValue({ mutate: jest.fn(), isLoading: false, isError: true });
    mockUseDismissProposal.mockReturnValue({ mutate: jest.fn(), isLoading: false, isError: false });

    render(<ProposalsQueue />, { wrapper });

    // The decision-failed callout should appear exactly once, not once per section.
    const callouts = screen.getAllByText(
      'The decision could not be recorded. Reload the queue and try again.'
    );
    expect(callouts).toHaveLength(1);
  });
});
