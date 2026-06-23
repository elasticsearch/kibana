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
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CompatRouter } from 'react-router-dom-v5-compat';
import type { ObservabilityOnboardingAppServices } from '../..';
import { IS_ADD_DATA_PAGE_V2_ENABLED } from '../../../common/feature_flags';
import { createCallApi } from '../../services/rest/create_call_api';
import { ObservabilityOnboardingFlow } from '../observability_onboarding_flow';
import { LandingPage } from './landing';

jest.mock('../onboarding_flow_form/onboarding_flow_form', () => ({
  OnboardingFlowForm: () => <div data-test-subj="onboardingFlowFormStub" />,
}));

jest.mock('./host', () => ({
  HostLinuxOtelPage: () => <div data-test-subj="hostLinuxOtelPageStub" />,
  HostLinuxAutoDetectPage: () => null,
  HostMacosOtelPage: () => null,
  HostMacosAutoDetectPage: () => null,
  HostWindowsOtelPage: () => null,
}));

jest.mock('./auto_detect', () => ({ AutoDetectPage: () => null }));
jest.mock('./otel_logs', () => ({ OtelLogsPage: () => null }));
jest.mock('./firehose', () => ({ FirehosePage: () => null }));
jest.mock('./otel_apm', () => ({ OtelApmPage: () => null }));
jest.mock('./cloudforwarder', () => ({ CloudForwarderPage: () => null }));

jest.mock('../shared/use_flow_breadcrumbs', () => ({
  useFlowBreadcrumb: jest.fn(),
}));

jest.mock('../shared/use_managed_otlp_service_availability', () => ({
  useManagedOtlpServiceAvailability: () => false,
}));

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-test-subj="locationPathname">{location.pathname}</div>;
};

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

const renderWithFlag = (enabled: boolean, initialPath: string = '/') => {
  const coreStart = coreMock.createStart();
  coreStart.featureFlags.getBooleanValue.mockImplementation((id, fallback) =>
    id === IS_ADD_DATA_PAGE_V2_ENABLED ? enabled : fallback
  );
  createCallApi(coreStart);
  const services = createObservabilityServices(coreStart);
  return render(
    <I18nProvider>
      <KibanaContextProvider services={services}>
        <MemoryRouter initialEntries={[initialPath]}>
          <CompatRouter>
            <LandingPage />
          </CompatRouter>
        </MemoryRouter>
      </KibanaContextProvider>
    </I18nProvider>
  );
};

const renderLandingWithRouter = (enabled: boolean) => {
  const coreStart = coreMock.createStart();
  coreStart.featureFlags.getBooleanValue.mockImplementation((id, fallback) =>
    id === IS_ADD_DATA_PAGE_V2_ENABLED ? enabled : fallback
  );
  createCallApi(coreStart);
  const services = createObservabilityServices(coreStart);
  return render(
    <I18nProvider>
      <KibanaContextProvider services={services}>
        <MemoryRouter initialEntries={['/']}>
          <CompatRouter>
            <LandingPage />
            <LocationDisplay />
          </CompatRouter>
        </MemoryRouter>
      </KibanaContextProvider>
    </I18nProvider>
  );
};

const renderFlowAtPath = (enabled: boolean, path: string) => {
  const coreStart = coreMock.createStart();
  coreStart.featureFlags.getBooleanValue.mockImplementation((id, fallback) =>
    id === IS_ADD_DATA_PAGE_V2_ENABLED ? enabled : fallback
  );
  createCallApi(coreStart);
  const services = createObservabilityServices(coreStart);
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

beforeAll(() => {
  window.scrollTo = jest.fn();
});

describe('LandingPage', () => {
  it('renders the V2 layout when the flag is on', () => {
    expect(renderWithFlag(true).queryByTestId('addDataPageV2')).toBeInTheDocument();
  });

  it('does not render the V2 layout when the flag is off', () => {
    expect(renderWithFlag(false).queryByTestId('addDataPageV2')).not.toBeInTheDocument();
  });

  it('renders the API endpoints section in the V2 layout', () => {
    expect(
      renderWithFlag(true).queryByTestId('observabilityOnboardingApiEndpointTab-elasticsearch')
    ).toBeInTheDocument();
  });
});

describe('LandingPage host tiles (V2)', () => {
  it.each([
    ['linux', '/host/linux'],
    ['macos', '/host/macos'],
    ['windows', '/host/windows'],
  ] as const)('navigates to %s sub-page when its tile is clicked', async (tileId, expectedPath) => {
    const user = userEvent.setup();
    const { getByTestId } = renderLandingWithRouter(true);
    const tile = getByTestId(`observabilityOnboardingIntegrationTile-${tileId}`);
    await user.click(tile);
    expect(getByTestId('locationPathname')).toHaveTextContent(expectedPath);
  });
});

describe('LandingPage Kubernetes tile (V2)', () => {
  it('navigates to the Kubernetes page when its tile is clicked', async () => {
    const user = userEvent.setup();
    const { getByTestId } = renderLandingWithRouter(true);
    const tile = getByTestId('observabilityOnboardingIntegrationTile-kubernetes');
    await user.click(tile);
    expect(getByTestId('locationPathname')).toHaveTextContent('/kubernetes');
  });
});

describe('LandingPage host tile routes (V2 gated)', () => {
  it('renders the V1 landing page when the flag is off and the path is /host/linux', () => {
    renderFlowAtPath(false, '/host/linux');
    expect(screen.getByTestId('onboardingFlowFormStub')).toBeInTheDocument();
    expect(screen.queryByTestId('hostLinuxOtelPageStub')).toBeNull();
    expect(screen.queryByTestId('addDataPageV2')).toBeNull();
  });
});
