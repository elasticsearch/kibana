/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen } from '@testing-library/react';
import React from 'react';
import { renderWithHostPageProviders } from '../../../pages/host/__tests__/test_helpers';
import { OtelKubernetesVisualizeStep } from './visualize_step';

jest.mock('../../kubernetes/data_ingest_status', () => ({
  DataIngestStatus: ({ onboardingId }: { onboardingId: string }) => (
    <div data-test-subj="dataIngestStatus" data-onboarding-id={onboardingId} />
  ),
}));

describe('OtelKubernetesVisualizeStep', () => {
  const defaultProps = {
    data: { onboardingId: 'test-onboarding-id' },
    actionLinks: [],
    onDataReceived: jest.fn(),
  };

  it('renders guidance before monitoring starts', () => {
    renderWithHostPageProviders(
      <OtelKubernetesVisualizeStep {...defaultProps} isMonitoringStepActive={false} />
    );

    expect(
      screen.getByText('Run the collector setup command, then return here to confirm data arrives.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('dataIngestStatus')).not.toBeInTheDocument();
  });

  it('renders data ingest status after monitoring starts', () => {
    renderWithHostPageProviders(
      <OtelKubernetesVisualizeStep {...defaultProps} isMonitoringStepActive={true} />
    );

    expect(screen.getByTestId('dataIngestStatus')).toHaveAttribute(
      'data-onboarding-id',
      'test-onboarding-id'
    );
  });
});
