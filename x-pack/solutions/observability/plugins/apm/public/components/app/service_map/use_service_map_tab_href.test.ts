/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MouseEvent } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useServiceMapTabHref, useServiceMapTabNavigate } from './use_service_map_tab_href';
import { useApmRouter } from '../../../hooks/use_apm_router';
import { useAnyOfApmParams } from '../../../hooks/use_apm_params';
import { useApmRoutePath } from '../../../hooks/use_apm_route_path';
import { useApmPluginContext } from '../../../context/apm_plugin/use_apm_plugin_context';

jest.mock('../../../hooks/use_apm_router', () => ({
  useApmRouter: jest.fn(),
}));

jest.mock('../../../hooks/use_apm_params', () => ({
  useAnyOfApmParams: jest.fn(),
}));

jest.mock('../../../hooks/use_apm_route_path', () => ({
  useApmRoutePath: jest.fn(),
}));

jest.mock('../../../context/apm_plugin/use_apm_plugin_context', () => ({
  useApmPluginContext: jest.fn(),
}));

const mockedUseApmRouter = jest.mocked(useApmRouter);
const mockedUseAnyOfApmParams = jest.mocked(useAnyOfApmParams);
const mockedUseApmRoutePath = jest.mocked(useApmRoutePath);
const mockedUseApmPluginContext = jest.mocked(useApmPluginContext);

const mockedLink = jest.fn(
  (path: string, args: { path?: Record<string, string>; query?: Record<string, unknown> }) => {
    const concretePath = path.replace(/\{serviceName\}/, args.path?.serviceName ?? '');
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(args.query ?? {})) {
      if (v !== undefined) search.set(k, String(v));
    }
    const qs = search.toString();
    return `/app/apm${concretePath}${qs ? `?${qs}` : ''}`;
  }
);

const serviceMapQuery = {
  rangeFrom: 'now-15m',
  rangeTo: 'now',
  environment: 'production',
  kuery: 'service.name: "opbeans-node"',
  comparisonEnabled: false,
  offset: '15m',
  serviceGroup: '',
};

describe('useServiceMapTabHref', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseApmRouter.mockReturnValue({ link: mockedLink } as unknown as ReturnType<
      typeof useApmRouter
    >);
    mockedUseAnyOfApmParams.mockReturnValue({ query: serviceMapQuery } as unknown as ReturnType<
      typeof useAnyOfApmParams
    >);
  });

  it('builds an overview-tab link and resets the map kuery', () => {
    mockedUseApmRoutePath.mockReturnValue(
      '/service-map' as unknown as ReturnType<typeof useApmRoutePath>
    );

    const { result } = renderHook(() => useServiceMapTabHref('overview', 'opbeans-node'));

    expect(result.current).toContain('/app/apm/services/opbeans-node/overview');
    const search = new URL(`http://x${result.current}`).searchParams;
    expect(search.get('kuery')).toBe('');
    expect(search.get('environment')).toBe('production');
  });

  it('builds a mobile-services overview-tab link on the mobile map context', () => {
    mockedUseApmRoutePath.mockReturnValue(
      '/mobile-services/{serviceName}/service-map' as unknown as ReturnType<typeof useApmRoutePath>
    );

    const { result } = renderHook(() => useServiceMapTabHref('overview', 'opbeans-rum'));

    expect(result.current).toContain('/app/apm/mobile-services/opbeans-rum/overview');
    const search = new URL(`http://x${result.current}`).searchParams;
    expect(search.get('kuery')).toBe('');
  });
});

describe('useServiceMapTabNavigate', () => {
  const navigateToUrl = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseApmRouter.mockReturnValue({ link: mockedLink } as unknown as ReturnType<
      typeof useApmRouter
    >);
    mockedUseAnyOfApmParams.mockReturnValue({ query: serviceMapQuery } as unknown as ReturnType<
      typeof useAnyOfApmParams
    >);
    mockedUseApmRoutePath.mockReturnValue(
      '/service-map' as unknown as ReturnType<typeof useApmRoutePath>
    );
    mockedUseApmPluginContext.mockReturnValue({
      core: { application: { navigateToUrl } },
    } as unknown as ReturnType<typeof useApmPluginContext>);
  });

  it('navigates to the kuery-stripped overview URL on click', () => {
    const { result } = renderHook(() => useServiceMapTabNavigate('overview', 'opbeans-node'));

    const event = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    } as unknown as MouseEvent;

    act(() => {
      result.current(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(navigateToUrl).toHaveBeenCalledTimes(1);

    const href = navigateToUrl.mock.calls[0][0] as string;
    expect(href).toContain('/app/apm/services/opbeans-node/overview');
    const search = new URL(`http://x${href}`).searchParams;
    expect(search.get('kuery')).toBe('');
  });
});
