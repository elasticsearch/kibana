/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HttpStart } from '@kbn/core-http-browser';
import { ElbLogsPanel } from './elb_logs_panel';

const mockFlowData = {
  onboardingId: 'test-id',
  apiKeyEncoded: 'test-api-key',
  managedOtlpServiceUrl: 'https://otlp.example.com',
};

const createMockHttp = (flowData = mockFlowData): Pick<HttpStart, 'post'> => ({
  post: jest.fn().mockResolvedValue(flowData) as HttpStart['post'],
});

describe('ElbLogsPanel', () => {
  it('renders the ELB Logs toggle', () => {
    const http = createMockHttp();
    render(<ElbLogsPanel http={http} />);

    expect(screen.getByTestId('fleetIntegrationElbLogsSwitch')).toBeInTheDocument();
  });

  it('does not show the S3 field or launch button when toggle is off', () => {
    const http = createMockHttp();
    render(<ElbLogsPanel http={http} />);

    expect(
      screen.queryByTestId('fleetIntegrationElbLogsS3BucketNameInput')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('fleetIntegrationElbLogsLaunchStackButton')
    ).not.toBeInTheDocument();
  });

  it('shows the S3 field and launch button after enabling the toggle and loading', async () => {
    const http = createMockHttp();
    render(<ElbLogsPanel http={http} />);

    await userEvent.click(screen.getByTestId('fleetIntegrationElbLogsSwitch'));

    await waitFor(() => {
      expect(screen.getByTestId('fleetIntegrationElbLogsS3BucketNameInput')).toBeInTheDocument();
      expect(screen.getByTestId('fleetIntegrationElbLogsLaunchStackButton')).toBeInTheDocument();
    });
  });

  it('calls the cloudforwarder/flow endpoint when the toggle is enabled', async () => {
    const http = createMockHttp();
    render(<ElbLogsPanel http={http} />);

    await userEvent.click(screen.getByTestId('fleetIntegrationElbLogsSwitch'));

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledWith(
        '/internal/observability_onboarding/cloudforwarder/flow'
      );
    });
  });

  it('disables the launch button when the bucket name is empty', async () => {
    const http = createMockHttp();
    render(<ElbLogsPanel http={http} />);

    await userEvent.click(screen.getByTestId('fleetIntegrationElbLogsSwitch'));
    await waitFor(() =>
      expect(screen.getByTestId('fleetIntegrationElbLogsLaunchStackButton')).toBeInTheDocument()
    );

    expect(screen.getByTestId('fleetIntegrationElbLogsLaunchStackButton')).toBeDisabled();
  });

  it('disables the launch button when the bucket name is invalid', async () => {
    const http = createMockHttp();
    render(<ElbLogsPanel http={http} />);

    await userEvent.click(screen.getByTestId('fleetIntegrationElbLogsSwitch'));
    await waitFor(() =>
      expect(screen.getByTestId('fleetIntegrationElbLogsS3BucketNameInput')).toBeInTheDocument()
    );

    await userEvent.type(screen.getByTestId('fleetIntegrationElbLogsS3BucketNameInput'), 'AB');

    expect(screen.getByTestId('fleetIntegrationElbLogsLaunchStackButton')).toBeDisabled();
  });

  it('enables the launch button with a valid bucket name', async () => {
    const http = createMockHttp();
    render(<ElbLogsPanel http={http} />);

    await userEvent.click(screen.getByTestId('fleetIntegrationElbLogsSwitch'));
    await waitFor(() =>
      expect(screen.getByTestId('fleetIntegrationElbLogsS3BucketNameInput')).toBeInTheDocument()
    );

    await userEvent.type(
      screen.getByTestId('fleetIntegrationElbLogsS3BucketNameInput'),
      'my-logs-bucket'
    );

    expect(screen.getByTestId('fleetIntegrationElbLogsLaunchStackButton')).not.toBeDisabled();
  });

  it('builds a CloudFormation href with elbaccess log type for valid bucket', async () => {
    const http = createMockHttp();
    render(<ElbLogsPanel http={http} />);

    await userEvent.click(screen.getByTestId('fleetIntegrationElbLogsSwitch'));
    await waitFor(() =>
      expect(screen.getByTestId('fleetIntegrationElbLogsS3BucketNameInput')).toBeInTheDocument()
    );

    await userEvent.type(
      screen.getByTestId('fleetIntegrationElbLogsS3BucketNameInput'),
      'my-logs-bucket'
    );

    const button = screen.getByTestId('fleetIntegrationElbLogsLaunchStackButton');
    const href = button.getAttribute('href') ?? '';

    expect(href).toContain('console.aws.amazon.com/cloudformation');
    expect(href).toContain('stackName=edot-cloud-forwarder-elbaccess');
    expect(href).toContain('param_EdotCloudForwarderS3LogsType=elbaccess');
    expect(href).toContain('param_ElasticAPIKey=test-api-key');
    expect(href).toContain('param_OTLPEndpoint=https%3A%2F%2Fotlp.example.com');
    expect(href).toContain('param_SourceS3BucketARN=arn%3Aaws%3As3%3A%3A%3Amy-logs-bucket');
  });

  it('shows an error callout and retry button when the API call fails', async () => {
    const http: Pick<HttpStart, 'post'> = {
      post: jest.fn().mockRejectedValue(new Error('Network error')) as HttpStart['post'],
    };
    render(<ElbLogsPanel http={http} />);

    await userEvent.click(screen.getByTestId('fleetIntegrationElbLogsSwitch'));

    await waitFor(() => {
      expect(screen.getByTestId('fleetIntegrationElbLogsRetryButton')).toBeInTheDocument();
    });
    expect(screen.getByText('Unable to load ELB logs configuration')).toBeInTheDocument();
  });
});
