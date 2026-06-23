/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/public/mocks';
import { I18nProvider } from '@kbn/i18n-react';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type { ObservabilityPublicStart } from '@kbn/observability-plugin/public';
import { sharePluginMock } from '@kbn/share-plugin/public/mocks';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { CompatRouter } from 'react-router-dom-v5-compat';
import type { CoreStart } from '@kbn/core/public';
import type { ObservabilityOnboardingAppServices } from '../..';
import { IS_ADD_DATA_PAGE_V2_ENABLED } from '../../../common/feature_flags';
import { ObservabilityOnboardingFlow } from '../observability_onboarding_flow';

jest.mock('../pages', () => ({
  AutoDetectPage: () => null,
  LandingPage: () => <div data-test-subj="landingPageStub" />,
  OtelLogsPage: () => null,
  FirehosePage: () => null,
  OtelApmPage: () => null,
  CloudForwarderPage: () => null,
  OtelKubernetesPage: () => null,
  KubernetesPage: () => null,
}));

jest.mock('../pages/host', () => ({
  HostLinuxAutoDetectPage: () => null,
  HostLinuxOtelPage: () => null,
  HostMacosAutoDetectPage: () => null,
  HostMacosOtelPage: () => null,
  HostWindowsOtelPage: () => null,
}));

jest.mock('../cloudwatch_integration_redirect', () => ({
  CloudwatchIntegrationRedirect: () => <div data-test-subj="cloudwatchIntegrationRedirectStub" />,
}));

jest.mock('../shared/use_flow_breadcrumbs', () => ({
  useFlowBreadcrumb: jest.fn(),
}));

jest.mock('../shared/use_managed_otlp_service_availability', () => ({
  useManagedOtlpServiceAvailability: () => false,
}));

beforeAll(() => {
  window.scrollTo = jest.fn();
});

const createObservabilityServices = (
  coreStart: ReturnType<typeof coreMock.createStart>
): ObservabilityOnboardingAppServices => ({
  ...coreStart,
  share: sharePluginMock.createStartContract(),
  context: {
    isDev: false,
    isCloud: false,
    isServerless: false,
    stackVersion: '9.0.0',
  },
  config: {
    ui: { enabled: true },
    serverless: { enabled: false },
  },
  observability: {
    config: {
      unsafe: {
        alertDetails: {
          uptime: { enabled: false },
        },
      },
      managedOtlpServiceUrl: '',
    },
    observabilityRuleTypeRegistry: {
      register: jest.fn(),
      getFormatter: jest.fn(() => undefined),
      list: jest.fn(() => []),
    },
    useRulesLink: jest.fn(() => ({ href: '/' })),
  } as ObservabilityPublicStart,
});

const renderFlow = (flagEnabled: boolean, path: string) => {
  const coreStart = coreMock.createStart();
  const services = createObservabilityServices(coreStart);
  const featureFlags = services.featureFlags as CoreStart['featureFlags'] & {
    getBooleanValue: jest.Mock;
  };
  featureFlags.getBooleanValue.mockImplementation((id: string, fallback: boolean) =>
    id === IS_ADD_DATA_PAGE_V2_ENABLED ? flagEnabled : fallback
  );
  return render(
    <I18nProvider>
      <KibanaContextProvider services={services}>
        <MemoryRouter initialEntries={[path]}>
          <CompatRouter>
            <ObservabilityOnboardingFlow />
          </CompatRouter>
        </MemoryRouter>
      </KibanaContextProvider>
    </I18nProvider>
  );
};

describe('CloudWatch routes', () => {
  it('renders CloudwatchIntegrationRedirect at /aws', () => {
    renderFlow(false, '/aws');
    expect(screen.getByTestId('cloudwatchIntegrationRedirectStub')).toBeInTheDocument();
    expect(screen.queryByTestId('landingPageStub')).toBeNull();
  });

  it('renders CloudwatchIntegrationRedirect at /aws when the add data page V2 flag is on', () => {
    renderFlow(true, '/aws');
    expect(screen.getByTestId('cloudwatchIntegrationRedirectStub')).toBeInTheDocument();
    expect(screen.queryByTestId('landingPageStub')).toBeNull();
  });
});
