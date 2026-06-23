/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen } from '@testing-library/react';
import React from 'react';
import { renderWithHostPageProviders } from '../../../pages/host/__tests__/test_helpers';
import { OtelKubernetesAddRepositoryStep } from './add_repository_step';

describe('OtelKubernetesAddRepositoryStep', () => {
  it('renders the heading and inline copy affordance when requested', () => {
    renderWithHostPageProviders(
      <OtelKubernetesAddRepositoryStep
        addRepoCommand="helm repo add open-telemetry https://example.com"
        showTitle
        useInlineCopyOnly
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Add the OpenTelemetry Helm repository' })
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('observabilityOnboardingOtelKubernetesPanelAddRepositoryCopyToClipboard')
    ).not.toBeInTheDocument();
  });
});
