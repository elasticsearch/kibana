/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ServiceContents } from './service_contents';
import type { ServiceMapNode } from '../../../../../common/service_map';

jest.mock('../../../../hooks/use_apm_params', () => ({
  useAnyOfApmParams: () => ({
    query: {
      rangeFrom: 'now-15m',
      rangeTo: 'now',
      comparisonEnabled: false,
      offset: undefined,
    },
  }),
}));

// Name must start with `mock*` so jest.mock factories can reference it (hoisting).
const mockApmRouterLink = jest.fn((path: string, opts?: { query?: Record<string, unknown> }) => {
  const params = new URLSearchParams();
  Object.entries(opts?.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  });
  const qs = params.toString();
  return `/app/apm${path}${qs ? `?${qs}` : ''}`;
});

jest.mock('../../../../hooks/use_apm_router', () => ({
  useApmRouter: () => ({
    link: mockApmRouterLink,
  }),
}));

jest.mock('../../../../hooks/use_time_range', () => ({
  useTimeRange: () => ({
    start: '2023-01-01T00:00:00.000Z',
    end: '2023-01-01T01:00:00.000Z',
  }),
}));

jest.mock('../../../../hooks/use_fetcher', () => ({
  FETCH_STATUS: {
    LOADING: 'loading',
    SUCCESS: 'success',
    FAILURE: 'failure',
    NOT_INITIATED: 'not_initiated',
  },
  useFetcher: () => ({
    data: { currentPeriod: {}, previousPeriod: undefined },
    status: 'success',
  }),
}));

jest.mock('./stats_list', () => ({
  StatsList: () => <div data-testid="stats-list" />,
}));

function serviceNode(serviceName: string): ServiceMapNode {
  return {
    id: serviceName,
    type: 'service',
    position: { x: 0, y: 0 },
    data: {
      id: serviceName,
      label: serviceName,
      isService: true,
    },
  };
}

describe('ServiceContents', () => {
  const defaultProps = {
    selection: serviceNode('test-service'),
    environment: 'production' as const,
    kuery: '',
    start: '2023-01-01T00:00:00.000Z',
    end: '2023-01-01T01:00:00.000Z',
    onFocusClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Service Details button', () => {
    render(<ServiceContents {...defaultProps} />);
    expect(screen.getByTestId('apmServiceContentsServiceDetailsButton')).toBeInTheDocument();
  });

  describe('Focus map button', () => {
    it('renders when isEmbedded is false', () => {
      render(<ServiceContents {...defaultProps} isEmbedded={false} />);
      expect(screen.getByTestId('apmServiceContentsFocusMapButton')).toBeInTheDocument();
    });

    it('renders when isEmbedded is undefined', () => {
      render(<ServiceContents {...defaultProps} />);
      expect(screen.getByTestId('apmServiceContentsFocusMapButton')).toBeInTheDocument();
    });

    it('does not render when isEmbedded is true', () => {
      render(<ServiceContents {...defaultProps} isEmbedded={true} />);
      expect(screen.queryByTestId('apmServiceContentsFocusMapButton')).not.toBeInTheDocument();
    });

    it('renders when showFocusMap is true even if isEmbedded is true', () => {
      render(<ServiceContents {...defaultProps} isEmbedded={true} showFocusMap={true} />);
      expect(screen.getByTestId('apmServiceContentsFocusMapButton')).toBeInTheDocument();
    });

    it('does not render when showFocusMap is false even if isEmbedded is false', () => {
      render(<ServiceContents {...defaultProps} isEmbedded={false} showFocusMap={false} />);
      expect(screen.queryByTestId('apmServiceContentsFocusMapButton')).not.toBeInTheDocument();
    });
  });

  describe('navigation URL kuery handling', () => {
    function getQueryFor(path: string): Record<string, unknown> | undefined {
      const call = mockApmRouterLink.mock.calls.find(([p]) => p === path);
      return call?.[1]?.query as Record<string, unknown> | undefined;
    }

    it('keeps the caller-provided kuery on Service Details but clears it on Focus URL by default', () => {
      render(
        <ServiceContents
          {...defaultProps}
          kuery='service.name:"opbeans-go" and transaction.name:"GET /api/products"'
          isEmbedded
          showFocusMap
        />
      );
      expect(getQueryFor('/services/{serviceName}')).toMatchObject({
        kuery: 'service.name:"opbeans-go" and transaction.name:"GET /api/products"',
        environment: 'production',
      });
      expect(getQueryFor('/services/{serviceName}/service-map')).toMatchObject({
        kuery: '',
        environment: 'production',
      });
    });

    it('clears kuery on Service Details URL when clearKueryOnNavigation is true (Focus URL always clears kuery)', () => {
      render(
        <ServiceContents
          {...defaultProps}
          kuery='service.name:"opbeans-go" and transaction.name:"GET /api/products"'
          isEmbedded
          showFocusMap
          clearKueryOnNavigation
        />
      );
      expect(getQueryFor('/services/{serviceName}')).toMatchObject({
        kuery: '',
        environment: 'production',
      });
      expect(getQueryFor('/services/{serviceName}/service-map')).toMatchObject({
        kuery: '',
        environment: 'production',
      });
    });
  });
});
