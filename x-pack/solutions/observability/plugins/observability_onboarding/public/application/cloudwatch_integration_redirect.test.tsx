/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { OBSERVABILITY_ONBOARDING_APP_ID } from '@kbn/deeplinks-observability';
import type { ObservabilityOnboardingAppServices } from '..';
import { CloudwatchIntegrationRedirect } from './cloudwatch_integration_redirect';

jest.mock('@kbn/kibana-react-plugin/public');

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;

const setup = () => {
  const get = jest.fn().mockResolvedValue({ item: { version: '0.2.1' } });
  const navigateToApp = jest.fn();
  const getUrlForApp = jest.fn(() => '/app/observabilityOnboarding?category=cloud');

  mockUseKibana.mockReturnValue({
    services: {
      http: { get },
      application: { navigateToApp, getUrlForApp },
    },
  } as unknown as ReturnType<typeof useKibana<ObservabilityOnboardingAppServices>>);

  return { get, navigateToApp, getUrlForApp };
};

describe('CloudwatchIntegrationRedirect', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves the package version and redirects to the Fleet add-integration page with back-link state', async () => {
    const { get, navigateToApp, getUrlForApp } = setup();

    render(<CloudwatchIntegrationRedirect />);

    expect(screen.getByTestId('cloudwatchIntegrationRedirectLoading')).toBeInTheDocument();

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    expect(get).toHaveBeenCalledWith(
      '/api/fleet/epm/packages/aws_cloudwatch_input_otel',
      expect.objectContaining({
        query: { prerelease: true },
        signal: expect.any(AbortSignal),
      })
    );

    expect(getUrlForApp).toHaveBeenCalledWith(OBSERVABILITY_ONBOARDING_APP_ID, {
      path: '?category=cloud',
    });

    await waitFor(() =>
      expect(navigateToApp).toHaveBeenCalledWith('fleet', {
        path: '/integrations/aws_cloudwatch_input_otel-0.2.1/add-integration',
        state: {
          onCancelNavigateTo: ['observabilityOnboarding', { path: '?category=cloud' }],
          onCancelUrl: '/app/observabilityOnboarding?category=cloud',
        },
        replace: true,
      })
    );
  });

  it('shows a recoverable error state when version resolution fails', async () => {
    const { get, navigateToApp } = setup();
    get.mockRejectedValueOnce(new Error('boom'));

    render(<CloudwatchIntegrationRedirect />);

    await waitFor(() =>
      expect(screen.getByTestId('cloudwatchIntegrationRedirectError')).toBeInTheDocument()
    );
    expect(navigateToApp).not.toHaveBeenCalled();
  });

  it('shows a recoverable error state when the package version is missing or empty', async () => {
    const { get, navigateToApp } = setup();
    get.mockResolvedValueOnce({ item: { version: '' } });

    render(<CloudwatchIntegrationRedirect />);

    await waitFor(() =>
      expect(screen.getByTestId('cloudwatchIntegrationRedirectError')).toBeInTheDocument()
    );
    expect(navigateToApp).not.toHaveBeenCalledWith(
      'fleet',
      expect.objectContaining({ path: expect.stringContaining('add-integration') })
    );
  });

  it('returns to the Cloud category when the user clicks the back button on the error state', async () => {
    const { get, navigateToApp } = setup();
    get.mockRejectedValueOnce(new Error('boom'));

    render(<CloudwatchIntegrationRedirect />);

    await waitFor(() =>
      expect(screen.getByTestId('cloudwatchIntegrationRedirectBack')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId('cloudwatchIntegrationRedirectBack'));

    expect(navigateToApp).toHaveBeenCalledWith(OBSERVABILITY_ONBOARDING_APP_ID, {
      path: '?category=cloud',
      replace: true,
    });
  });

  it('retries version resolution and redirects when the user clicks try again', async () => {
    const { get, navigateToApp } = setup();
    get.mockRejectedValueOnce(new Error('boom'));

    render(<CloudwatchIntegrationRedirect />);

    await waitFor(() =>
      expect(screen.getByTestId('cloudwatchIntegrationRedirectRetry')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId('cloudwatchIntegrationRedirectRetry'));

    await waitFor(() =>
      expect(navigateToApp).toHaveBeenCalledWith(
        'fleet',
        expect.objectContaining({
          path: '/integrations/aws_cloudwatch_input_otel-0.2.1/add-integration',
        })
      )
    );
  });

  it('aborts version resolution on unmount', async () => {
    const { get } = setup();
    let capturedSignal: AbortSignal | undefined;
    get.mockImplementation((_path: string, options: { signal: AbortSignal }) => {
      capturedSignal = options.signal;
      return new Promise(() => {}); // never resolves
    });

    const { unmount } = render(<CloudwatchIntegrationRedirect />);

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });
});
