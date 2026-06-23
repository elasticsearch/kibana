/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen } from '@testing-library/react';
import React from 'react';
import { renderWithHostPageProviders } from '../../../pages/host/__tests__/test_helpers';
import { OtelKubernetesInstallStep } from './install_step';

jest.mock('../../shared/masked_code_block', () => ({
  MaskedCodeBlock: ({
    value,
    secrets,
    dataTestSubj,
  }: {
    value: string;
    secrets: string[];
    dataTestSubj: string;
  }) => (
    <div data-test-subj={dataTestSubj} data-value={value} data-secrets={secrets.join('|')}>
      {value}
    </div>
  ),
}));

describe('OtelKubernetesInstallStep', () => {
  it('renders the heading and masked install command when requested', () => {
    renderWithHostPageProviders(
      <OtelKubernetesInstallStep
        installStackCommand="helm upgrade --install opentelemetry-kube-stack"
        valuesFileUrl="https://example.com/values.yaml"
        secretValues={['encoded-api-key']}
        showTitle
        useInlineCopyOnly
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Install the OpenTelemetry Operator' })
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('observabilityOnboardingOtelKubernetesPanelInstallStackCopyToClipboard')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('observabilityOnboardingOtelKubernetesInstallStackSnippet')
    ).toHaveAttribute('data-value', 'helm upgrade --install opentelemetry-kube-stack');
    expect(
      screen.getByTestId('observabilityOnboardingOtelKubernetesInstallStackSnippet')
    ).toHaveAttribute('data-secrets', 'encoded-api-key');
    expect(
      screen.getByTestId('observabilityOnboardingOtelKubernetesPanelCertManagerInfoTip')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('observabilityOnboardingIngestionModeSelector')).toBeNull();
  });

  it('does not render a duplicate copy button outside the install command', () => {
    renderWithHostPageProviders(
      <OtelKubernetesInstallStep
        installStackCommand="helm upgrade --install opentelemetry-kube-stack"
        valuesFileUrl="https://example.com/values.yaml"
        secretValues={['encoded-api-key']}
      />
    );

    expect(
      screen.queryByTestId('observabilityOnboardingOtelKubernetesPanelInstallStackCopyToClipboard')
    ).not.toBeInTheDocument();
  });

  it('does not render the values-file download button without a values file URL', () => {
    renderWithHostPageProviders(
      <OtelKubernetesInstallStep installStackCommand="helm upgrade --install opentelemetry-kube-stack" />
    );

    expect(
      screen.queryByTestId('observabilityOnboardingOtelKubernetesPanelDownloadValuesFileButton')
    ).not.toBeInTheDocument();
  });
});
