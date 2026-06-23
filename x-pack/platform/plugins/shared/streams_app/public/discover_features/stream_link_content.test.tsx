/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { StreamsAppLocator } from '../../common/locators';
import { StreamLinkContent } from './stream_link_content';

const buildLocator = (href = '/app/streams/details'): StreamsAppLocator =>
  ({
    getRedirectUrl: jest.fn().mockReturnValue(href),
  } as unknown as StreamsAppLocator);

const renderWithI18n = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

describe('StreamLinkContent', () => {
  it('renders a loading spinner while resolving', () => {
    const { container } = renderWithI18n(
      <StreamLinkContent
        name={undefined}
        existsLocally={undefined}
        loading={true}
        error={undefined}
        locator={buildLocator()}
      />
    );

    expect(container.querySelector('[role="progressbar"]')).toBeTruthy();
  });

  it('renders a dash placeholder when no name is resolved', () => {
    renderWithI18n(
      <StreamLinkContent
        name={undefined}
        existsLocally={undefined}
        loading={false}
        error={undefined}
        locator={buildLocator()}
      />
    );

    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders a dash placeholder when an error is provided', () => {
    renderWithI18n(
      <StreamLinkContent
        name={'logs.foo'}
        existsLocally={true}
        loading={false}
        error={new Error('boom')}
        locator={buildLocator()}
      />
    );

    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders an EuiLink when the stream exists locally', () => {
    const locator = buildLocator('/app/streams/details/logs.foo');
    renderWithI18n(
      <StreamLinkContent
        name={'logs.foo'}
        existsLocally={true}
        loading={false}
        error={undefined}
        locator={locator}
      />
    );

    const link = screen.getByRole('link', { name: 'logs.foo' });
    expect(link).toHaveAttribute('href', '/app/streams/details/logs.foo');
    expect(locator.getRedirectUrl).toHaveBeenCalledWith({ name: 'logs.foo' });
  });

  it('renders text only when the stream does not exist locally', () => {
    renderWithI18n(
      <StreamLinkContent
        name={'logs.remote'}
        existsLocally={false}
        loading={false}
        error={undefined}
        locator={buildLocator()}
      />
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('logs.remote')).toBeInTheDocument();
  });

  it('renders the CPS warning icon when CPS remote search is active', () => {
    const { container } = renderWithI18n(
      <StreamLinkContent
        name={'logs.foo'}
        existsLocally={true}
        loading={false}
        error={undefined}
        locator={buildLocator()}
        remoteSearchType="cps"
        renderRemoteWarning
      />
    );

    expect(container.querySelector('[data-test-subj="cpsStreamsWarningIcon"]')).toBeTruthy();
  });

  it('renders the CCS warning icon when CCS remote search is active', () => {
    const { container } = renderWithI18n(
      <StreamLinkContent
        name={'logs.foo'}
        existsLocally={true}
        loading={false}
        error={undefined}
        locator={buildLocator()}
        remoteSearchType="ccs"
        renderRemoteWarning
      />
    );

    expect(container.querySelector('[data-test-subj="ccsStreamsWarningIcon"]')).toBeTruthy();
  });

  it('does not render a warning icon when no remote search is active', () => {
    const { container } = renderWithI18n(
      <StreamLinkContent
        name={'logs.foo'}
        existsLocally={true}
        loading={false}
        error={undefined}
        locator={buildLocator()}
      />
    );

    expect(container.querySelector('[data-test-subj="cpsStreamsWarningIcon"]')).toBeNull();
    expect(container.querySelector('[data-test-subj="ccsStreamsWarningIcon"]')).toBeNull();
  });
});
