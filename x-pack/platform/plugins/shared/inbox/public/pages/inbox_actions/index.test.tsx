/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import {
  INBOX_ACTIONS_HISTORY_FACETS_URL,
  INBOX_ACTIONS_HISTORY_URL,
  INBOX_ACTIONS_URL,
} from '@kbn/inbox-common';
import { createStubInboxAction } from '../../../common/test_helpers';
import { InboxActionsPage } from '.';

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

describe('InboxActionsPage', () => {
  let httpGet: jest.Mock;

  beforeEach(() => {
    httpGet = jest.fn().mockImplementation(async (url: string) => {
      if (url === INBOX_ACTIONS_URL) {
        return {
          actions: [
            createStubInboxAction({
              id: 'pending-1',
              title: 'Pending action',
              status: 'pending',
              source_app: 'workflows',
            }),
          ],
          total: 1,
        };
      }
      if (url === INBOX_ACTIONS_HISTORY_URL) {
        return {
          actions: [
            createStubInboxAction({
              id: 'history-1',
              title: 'Approve isolation of host-42?',
              status: 'approved',
              responded_at: '2026-04-24T13:00:00.000Z',
              response_mode: 'responded',
              response_input: { approved: true },
              source_app: 'workflows',
            }),
          ],
          total: 1,
        };
      }
      if (url === INBOX_ACTIONS_HISTORY_FACETS_URL) {
        return { channel: [], respondedBy: [] };
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    useKibanaMock.mockReturnValue({
      services: { http: { get: httpGet } },
    } as unknown as ReturnType<typeof useKibana>);
  });

  it('renders both the pending table and the history audit log', async () => {
    render(<InboxActionsPage />, { wrapper: createWrapper() });

    // Pending section + the row from the pending list endpoint.
    expect(await screen.findByText('Awaiting response')).toBeInTheDocument();
    expect(await screen.findByText('Pending action')).toBeInTheDocument();

    // History section + the row from the history list endpoint.
    expect(screen.getByText('History')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/Approve isolation of host-42\?/)).toBeInTheDocument()
    );
  });

  it('expands inline reasoning for a pending action that carries it', async () => {
    httpGet.mockImplementation(async (url: string) => {
      if (url === INBOX_ACTIONS_URL) {
        return {
          actions: [
            createStubInboxAction({
              id: 'pending-with-reasoning',
              title: 'Why should we proceed with this action?',
              status: 'pending',
              source_app: 'workflows',
              reasoning: {
                summary: 'Detected a recurring login failure spike from a single ASN.',
                sections: [{ title: 'DIAGNOSIS', body: '412 failed logins in 5m from ASN 12345.' }],
              },
            }),
          ],
          total: 1,
        };
      }
      if (url === INBOX_ACTIONS_HISTORY_URL) {
        return { actions: [], total: 0 };
      }
      if (url === INBOX_ACTIONS_HISTORY_FACETS_URL) {
        return { channel: [], respondedBy: [] };
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    render(<InboxActionsPage />, { wrapper: createWrapper() });

    const toggle = await screen.findByTestId('inboxReasoningToggle');
    expect(screen.queryByTestId('inboxReasoning')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(await screen.findByTestId('inboxReasoning')).toBeInTheDocument();
    expect(
      screen.getByText(/Detected a recurring login failure spike from a single ASN\./)
    ).toBeInTheDocument();
  });
});
