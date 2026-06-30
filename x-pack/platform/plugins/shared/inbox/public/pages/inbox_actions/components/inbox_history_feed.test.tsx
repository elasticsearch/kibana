/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { createStubInboxAction } from '../../../../common/test_helpers';
import { InboxHistoryFeed } from './inbox_history_feed';

jest.mock('@kbn/kibana-react-plugin/public');

const useKibanaMock = useKibana as jest.MockedFunction<typeof useKibana>;

const createWrapper = (): FC<PropsWithChildren<{}>> => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nProvider>
  );
};

describe('InboxHistoryFeed', () => {
  let httpGet: jest.Mock;

  beforeEach(() => {
    httpGet = jest.fn().mockResolvedValue({ channel: [], respondedBy: [] });
    useKibanaMock.mockReturnValue({
      services: { http: { get: httpGet } },
    } as unknown as ReturnType<typeof useKibana>);
  });

  it('renders the empty-state prompt when the server returns no rows', async () => {
    httpGet.mockResolvedValueOnce({ actions: [], total: 0 });

    render(<InboxHistoryFeed />, { wrapper: createWrapper() });

    expect(await screen.findByText('No processed actions yet')).toBeInTheDocument();
  });

  it('renders a filtered empty-state prompt when search text excludes all rows', async () => {
    httpGet.mockResolvedValueOnce({ actions: [], total: 0 });

    render(<InboxHistoryFeed />, { wrapper: createWrapper() });

    expect(await screen.findByText('No processed actions yet')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('inboxHistorySearchInput'), {
      target: { value: 'alice' },
    });

    expect(screen.getByText('No history matches your filters')).toBeInTheDocument();
    expect(
      screen.getByText('Try changing your search, responder, or channel filters.')
    ).toBeInTheDocument();
  });

  it('clamps the search input to the server-side query length limit', async () => {
    httpGet.mockResolvedValueOnce({ actions: [], total: 0 });

    render(<InboxHistoryFeed />, { wrapper: createWrapper() });

    const input = await screen.findByTestId('inboxHistorySearchInput');
    fireEvent.change(input, { target: { value: 'a'.repeat(300) } });

    expect(input).toHaveValue('a'.repeat(256));
  });

  it('renders one comment per processed action with the response payload', async () => {
    httpGet.mockResolvedValueOnce({
      actions: [
        createStubInboxAction({
          id: 'wf-1:run-1:step-1',
          status: 'approved',
          // Title and input_message intentionally differ so the assertions
          // can target each section without colliding (the title renders
          // inside the comment header, the prompt body in the comment body).
          title: 'Approve isolation of host-42',
          input_message: 'Should we isolate host-42?',
          responded_at: '2026-04-24T12:30:00.000Z',
          response_mode: 'responded',
          response_input: { approved: true, reason: 'looks good' },
          channel: null,
          source_app: 'workflows',
        }),
      ],
      total: 1,
    });

    render(<InboxHistoryFeed />, { wrapper: createWrapper() });

    expect(await screen.findByText('Approve isolation of host-42')).toBeInTheDocument();
    expect(screen.getByText('Should we isolate host-42?')).toBeInTheDocument();
    expect(screen.getByText('Prompt')).toBeInTheDocument();
    expect(screen.getByText('Response')).toBeInTheDocument();
    expect(screen.getByText(/"approved": true/)).toBeInTheDocument();
    // No channel badge for the default-inbox / null-channel case — the
    // audit feed only surfaces a per-channel tag when a non-default
    // surface (Slack/MCP/agent builder/…) submitted the response.
    expect(screen.queryByTestId('inboxHistoryChannelBadge')).not.toBeInTheDocument();
  });

  it('flags rows whose originating workflow has been deleted with a "Workflow deleted" badge', async () => {
    // The audit trail retains processed rows even after the workflow that
    // produced them is deleted (see the query service — history is no longer
    // orphan-filtered). Such rows are tagged so it's clear the source is gone.
    httpGet.mockResolvedValueOnce({
      actions: [
        createStubInboxAction({
          id: 'wf-gone:run-1:step-1',
          status: 'approved',
          title: 'Approve isolation of host-42',
          response_mode: 'responded',
          response_input: { approved: true },
          channel: null,
          source_app: 'workflows',
          source_deleted: true,
        }),
      ],
      total: 1,
    });

    render(<InboxHistoryFeed />, { wrapper: createWrapper() });

    expect(await screen.findByTestId('inboxHistorySourceDeletedBadge')).toBeInTheDocument();
    expect(screen.getByText('Workflow deleted')).toBeInTheDocument();
  });

  it('does not flag rows whose originating workflow is still alive', async () => {
    httpGet.mockResolvedValueOnce({
      actions: [
        createStubInboxAction({
          id: 'wf-1:run-1:step-1',
          status: 'approved',
          title: 'Approve isolation of host-42',
          response_mode: 'responded',
          response_input: { approved: true },
          channel: null,
          source_app: 'workflows',
          source_deleted: false,
        }),
      ],
      total: 1,
    });

    render(<InboxHistoryFeed />, { wrapper: createWrapper() });

    expect(await screen.findByText('Approve isolation of host-42')).toBeInTheDocument();
    expect(screen.queryByTestId('inboxHistorySourceDeletedBadge')).not.toBeInTheDocument();
  });

  it('renders an explicit channel badge for non-default responders (well-known app slug)', async () => {
    // External clients (MCP apps, Slack, custom automations) self-tag
    // with a stable client slug — the audit feed renders a friendly
    // pill for first-party slugs we have a label for (here:
    // `example-mcp-app-security`). Default-inbox responses stay
    // un-tagged (covered by the previous test) to keep the feed
    // visually quiet for the dominant surface.
    httpGet.mockResolvedValueOnce({
      actions: [
        createStubInboxAction({
          id: 'wf-1:run-1:step-1',
          status: 'approved',
          title: 'Approve isolation of host-42',
          response_mode: 'responded',
          response_input: { approved: true },
          channel: 'example-mcp-app-security',
          source_app: 'workflows',
        }),
      ],
      total: 1,
    });

    render(<InboxHistoryFeed />, { wrapper: createWrapper() });

    expect(await screen.findByTestId('inboxHistoryChannelBadge')).toBeInTheDocument();
    expect(screen.getByText('Security MCP example')).toBeInTheDocument();
  });

  it('falls back to the raw slug for unknown channel identifiers', async () => {
    // Third-party clients can send any slug-shaped channel; the audit
    // feed should still surface the value verbatim rather than hide
    // it, so the source remains visible.
    httpGet.mockResolvedValueOnce({
      actions: [
        createStubInboxAction({
          id: 'wf-1:run-1:step-1',
          status: 'approved',
          title: 'Approve isolation of host-42',
          response_mode: 'responded',
          response_input: { approved: true },
          channel: 'acme-bot',
          source_app: 'workflows',
        }),
      ],
      total: 1,
    });

    render(<InboxHistoryFeed />, { wrapper: createWrapper() });

    expect(await screen.findByTestId('inboxHistoryChannelBadge')).toBeInTheDocument();
    expect(screen.getByText('acme-bot')).toBeInTheDocument();
  });

  it('renders a red rejected badge when status === "rejected"', async () => {
    // `to_inbox_action.deriveHistoryStatus` flips the status when the
    // responder payload encodes a rejection (e.g. `{ approved: false }`).
    // The audit feed surfaces this as a red badge so reviewers can scan
    // approve-vs-reject outcomes at a glance.
    httpGet.mockResolvedValueOnce({
      actions: [
        createStubInboxAction({
          id: 'wf-1:run-1:step-1',
          status: 'rejected',
          title: 'Approve isolation of host-42',
          response_mode: 'responded',
          response_input: { approved: false, reason: 'too risky' },
          source_app: 'workflows',
        }),
      ],
      total: 1,
    });

    render(<InboxHistoryFeed />, { wrapper: createWrapper() });

    expect(await screen.findByTestId('inboxHistoryRejectedBadge')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('shows a "Processing…" badge for the responded-but-not-yet-resumed window from the server', async () => {
    // Source-of-truth window #1 from the audit feed mapper:
    // `respondedAt` is set on the step doc but the engine hasn't run
    // the resume yet, so `response_mode === 'responded'` while
    // `response_input` is still null. The mapper drives the UI off
    // these server fields — no client-side optimistic flag.
    httpGet.mockResolvedValueOnce({
      actions: [
        createStubInboxAction({
          id: 'wf-1:run-1:step-1',
          status: 'approved',
          title: 'Approve isolation of host-42?',
          responded_at: '2026-04-24T12:30:00.000Z',
          responded_by: 'alice',
          response_mode: 'responded',
          // Engine hasn't promoted `output` to `response_input` yet.
          response_input: null,
          source_app: 'workflows',
        }),
      ],
      total: 1,
    });

    render(<InboxHistoryFeed />, { wrapper: createWrapper() });

    expect(await screen.findByText('Processing…')).toBeInTheDocument();
    expect(screen.getByText('Response payload is still being recorded.')).toBeInTheDocument();
    expect(screen.queryByText('No response payload was recorded.')).not.toBeInTheDocument();
    // The approve/reject outcome is still unknown during the
    // responded-but-not-resumed window (the server can't classify it until
    // `response_input` lands), so we must NOT assert a green "Approved"
    // placeholder that could later flip to "Rejected".
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    expect(screen.queryByTestId('inboxHistoryRejectedBadge')).not.toBeInTheDocument();
  });

  it('drops the Processing badge once the server fills in response_input', async () => {
    // Source-of-truth window #2: Task Manager finished the resume,
    // engine wrote `finishedAt` + `output`, mapper surfaces
    // `response_input` from `output`. The badge transitions off without
    // the UI doing any local reconciliation.
    httpGet.mockResolvedValueOnce({
      actions: [
        createStubInboxAction({
          id: 'wf-1:run-1:step-1',
          status: 'approved',
          title: 'Approve isolation of host-42',
          response_mode: 'responded',
          response_input: { approved: true },
          source_app: 'workflows',
        }),
      ],
      total: 1,
    });

    render(<InboxHistoryFeed />, { wrapper: createWrapper() });

    expect(await screen.findByText('Approve isolation of host-42')).toBeInTheDocument();
    expect(screen.queryByText('Processing…')).not.toBeInTheDocument();
  });

  it('renders a timed-out badge when the response_mode reflects a timeout', async () => {
    httpGet.mockResolvedValueOnce({
      actions: [
        createStubInboxAction({
          id: 'wf-1:run-1:step-1',
          status: 'approved',
          response_mode: 'timed_out',
          responded_at: '2026-04-24T12:30:00.000Z',
          source_app: 'workflows',
        }),
      ],
      total: 1,
    });

    render(<InboxHistoryFeed />, { wrapper: createWrapper() });

    expect(await screen.findByText('Timed out')).toBeInTheDocument();
    // A timed-out / abnormally-settled row was never approved by a human, so
    // the green "Approved" placeholder must not render alongside the warning
    // "Timed out" badge (the two together are contradictory).
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
  });
});
