/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { StreamsRepositoryClient } from '@kbn/streams-plugin/public/api';
import type { StreamsAppLocator } from '../../common/locators';
import { DiscoverFlyoutStreamFieldByStreamName } from './discover_flyout_stream_field_by_stream_name';

const renderWithI18n = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

describe('DiscoverFlyoutStreamFieldByStreamName', () => {
  it('renders the stream name as a link without hitting any endpoint when CPS is disabled', async () => {
    const fetch = jest.fn();
    const streamsRepositoryClient = { fetch } as unknown as StreamsRepositoryClient;
    const locator = {
      getRedirectUrl: jest.fn().mockReturnValue('/app/streams/details/logs-foo-default'),
    } as unknown as StreamsAppLocator;

    renderWithI18n(
      <DiscoverFlyoutStreamFieldByStreamName
        streamName="logs-foo-default"
        streamsRepositoryClient={streamsRepositoryClient}
        locator={locator}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'logs-foo-default' })).toBeInTheDocument();
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(locator.getRedirectUrl).toHaveBeenCalledWith({ name: 'logs-foo-default' });
  });

  it('probes for local existence and renders a link when the stream exists locally with CPS enabled', async () => {
    const fetch = jest.fn().mockResolvedValue({});
    const streamsRepositoryClient = { fetch } as unknown as StreamsRepositoryClient;
    const locator = {
      getRedirectUrl: jest.fn().mockReturnValue('/app/streams/details/logs-foo-default'),
    } as unknown as StreamsAppLocator;

    renderWithI18n(
      <DiscoverFlyoutStreamFieldByStreamName
        streamName="logs-foo-default"
        streamsRepositoryClient={streamsRepositoryClient}
        locator={locator}
        cpsHasLinkedProjects
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'logs-foo-default' })).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith(
      'GET /api/streams/{name} 2023-10-31',
      expect.objectContaining({ params: { path: { name: 'logs-foo-default' } } })
    );
  });

  it('renders text only when the stream is remote (CPS probe fails)', async () => {
    const fetch = jest.fn().mockRejectedValue(new Error('not found'));
    const streamsRepositoryClient = { fetch } as unknown as StreamsRepositoryClient;
    const locator = { getRedirectUrl: jest.fn() } as unknown as StreamsAppLocator;

    renderWithI18n(
      <DiscoverFlyoutStreamFieldByStreamName
        streamName="logs-foo-remote"
        streamsRepositoryClient={streamsRepositoryClient}
        locator={locator}
        cpsHasLinkedProjects
      />
    );

    await waitFor(() => {
      expect(screen.getByText('logs-foo-remote')).toBeInTheDocument();
    });

    expect(screen.queryByRole('link')).toBeNull();
  });
});
