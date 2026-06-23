/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen } from '@testing-library/react';
import React from 'react';
import { useLocation } from 'react-router-dom';
import type { CoreStart } from '@kbn/core/public';
import { IS_ADD_DATA_PAGE_V2_ENABLED } from '../../../../../common/feature_flags';
import { ObservabilityOnboardingFlow } from '../../../observability_onboarding_flow';
import { buildHostPageServices, renderWithHostPageProviders } from './test_helpers';

const LocationProbe: React.FC = () => {
  const { pathname } = useLocation();
  return <div data-test-subj="locationProbe">{pathname}</div>;
};

jest.mock('../../landing', () => ({
  LandingPage: () => <div data-test-subj="landingPageStub" />,
}));

jest.mock('../linux_otel_page', () => ({
  HostLinuxOtelPage: () => <div data-test-subj="hostLinuxOtelPageStub" />,
}));

jest.mock('../linux_auto_detect_page', () => ({
  HostLinuxAutoDetectPage: () => <div data-test-subj="hostLinuxAutoDetectPageStub" />,
}));

jest.mock('../macos_otel_page', () => ({
  HostMacosOtelPage: () => <div data-test-subj="hostMacosOtelPageStub" />,
}));

jest.mock('../macos_auto_detect_page', () => ({
  HostMacosAutoDetectPage: () => <div data-test-subj="hostMacosAutoDetectPageStub" />,
}));

jest.mock('../windows_otel_page', () => ({
  HostWindowsOtelPage: () => <div data-test-subj="hostWindowsOtelPageStub" />,
}));

jest.mock('../../auto_detect', () => ({
  AutoDetectPage: () => null,
}));

jest.mock('../../otel_logs', () => ({
  OtelLogsPage: () => null,
}));

jest.mock('../../firehose', () => ({
  FirehosePage: () => null,
}));

jest.mock('../../otel_apm', () => ({
  OtelApmPage: () => null,
}));

jest.mock('../../cloudforwarder', () => ({
  CloudForwarderPage: () => null,
}));

jest.mock('../../../shared/use_flow_breadcrumbs', () => ({
  useFlowBreadcrumb: jest.fn(),
}));

jest.mock('../../../shared/use_managed_otlp_service_availability', () => ({
  useManagedOtlpServiceAvailability: () => false,
}));

beforeAll(() => {
  window.scrollTo = jest.fn();
});

const renderFlow = (flagEnabled: boolean, path: string) => {
  const services = buildHostPageServices();
  const featureFlags = services.featureFlags as CoreStart['featureFlags'] & {
    getBooleanValue: jest.Mock;
  };
  featureFlags.getBooleanValue.mockImplementation((id: string, fallback: boolean) =>
    id === IS_ADD_DATA_PAGE_V2_ENABLED ? flagEnabled : fallback
  );
  return renderWithHostPageProviders(
    <>
      <ObservabilityOnboardingFlow />
      <LocationProbe />
    </>,
    {
      initialEntries: [path],
      services,
    }
  );
};

const HOST_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ['/host/linux', 'hostLinuxOtelPageStub'],
  ['/host/linux/auto-detect', 'hostLinuxAutoDetectPageStub'],
  ['/host/macos', 'hostMacosOtelPageStub'],
  ['/host/macos/auto-detect', 'hostMacosAutoDetectPageStub'],
  ['/host/windows', 'hostWindowsOtelPageStub'],
] as const;

describe('Feature-flag gate on /host/* routes', () => {
  describe.each(HOST_ROUTES)('%s', (path, pageStubTestId) => {
    it('renders the host page when the flag is on', () => {
      renderFlow(true, path);
      expect(screen.getByTestId(pageStubTestId)).toBeInTheDocument();
      expect(screen.queryByTestId('landingPageStub')).toBeNull();
    });

    it('falls back to the V1 landing page when the flag is off', () => {
      renderFlow(false, path);
      expect(screen.getByTestId('landingPageStub')).toBeInTheDocument();
      expect(screen.queryByTestId(pageStubTestId)).toBeNull();
    });

    it('rewrites the URL to / when the flag is off so orphan V2 deep links normalize', () => {
      renderFlow(false, path);
      expect(screen.getByTestId('locationProbe').textContent).toBe('/');
    });
  });

  it('falls back to the V1 landing page for unmatched paths even when the flag is on', () => {
    renderFlow(true, '/some/other/unmatched/path');
    expect(screen.getByTestId('landingPageStub')).toBeInTheDocument();
    expect(screen.queryByTestId('hostLinuxOtelPageStub')).toBeNull();
  });
});
