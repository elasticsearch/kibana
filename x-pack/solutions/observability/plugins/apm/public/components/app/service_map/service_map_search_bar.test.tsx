/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import type { Filter } from '@kbn/es-query';
import { Subject } from 'rxjs';
import { ServiceMapSearchBar } from './service_map_search_bar';

let mockSetEsQuery: jest.Mock;
let mockOnFiltersChange: (filters: Filter[]) => void;
let mockHistoryReplace: jest.Mock;
let mockLocationSearch: string;
let mockInitialAppFilters: Filter[];
// Field names that should be reported as absent from the data view.
let mockMissingFields: string[];
const filterUpdates$ = new Subject<void>();

jest.mock('../../../hooks/use_apm_params', () => ({
  useAnyOfApmParams: () => ({
    query: {
      rangeFrom: 'now-15m',
      rangeTo: 'now',
      kuery: 'service.name:"opbeans-go"',
      environment: 'production',
    },
  }),
}));

jest.mock('../../../hooks/use_service_name', () => ({
  useServiceName: () => undefined,
}));

jest.mock('../../../hooks/use_adhoc_apm_data_view', () => ({
  useAdHocApmDataView: () => ({
    dataView: {
      id: 'apm-data-view',
      title: 'apm-*',
      fields: {
        getByName: (name: string) => (mockMissingFields.includes(name) ? undefined : { name }),
      },
      getFieldByName: (name: string) => (mockMissingFields.includes(name) ? undefined : { name }),
    },
  }),
}));

jest.mock('@kbn/observability-shared-plugin/public', () => ({
  useKibanaQuerySettings: () => ({}),
}));

jest.mock('./service_map_search_context', () => ({
  useServiceMapSearchContext: () => ({
    setEsQuery: (...args: unknown[]) => mockSetEsQuery(...args),
  }),
}));

jest.mock('./use_filter_url_sync', () => ({
  useFilterUrlSync: () => ({
    initialAppFilters: mockInitialAppFilters,
    persistControlSelections: jest.fn(),
    getRestoredControlSelections: () => undefined,
  }),
}));

jest.mock('react-router-dom', () => ({
  useHistory: () => ({ replace: mockHistoryReplace }),
  useLocation: () => ({ search: mockLocationSearch, pathname: '/service-map' }),
}));

const mockFilterManager = {
  getAppFilters: jest.fn().mockReturnValue([]),
  getGlobalFilters: jest.fn().mockReturnValue([]),
  getUpdates$: () => filterUpdates$.asObservable(),
};

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: () => ({
    services: {
      data: { query: { filterManager: mockFilterManager } },
    },
  }),
}));

jest.mock('../../shared/search_bar/search_bar', () => ({
  SearchBar: () => <div data-testid="search-bar" />,
}));

jest.mock('../../shared/time_comparison', () => ({
  TimeComparison: () => <div data-testid="time-comparison" />,
}));

jest.mock('./service_map_controls', () => ({
  ServiceMapControls: ({
    onFiltersChange,
    controlsConfig,
  }: {
    onFiltersChange: (filters: Filter[]) => void;
    controlsConfig: Array<{ field_name: string; width: string; grow: boolean }>;
  }) => {
    mockOnFiltersChange = onFiltersChange;
    return (
      <div
        data-testid="service-map-controls"
        data-fields={controlsConfig.map((c) => c.field_name).join(',')}
        data-widths={controlsConfig.map((c) => c.width).join(',')}
        data-grows={controlsConfig.map((c) => String(c.grow)).join(',')}
      />
    );
  },
}));

// Mock buildEsQuery to return a predictable structure based on filters
jest.mock('@kbn/es-query', () => ({
  buildEsQuery: (_dataView: unknown, _queries: unknown, filters: Filter[]) => ({
    bool: {
      must: [],
      filter: filters.map((f: Filter) => ({
        match_phrase: { [f.meta?.key ?? '']: 'value' },
      })),
      should: [],
      must_not: [],
    },
  }),
  isPhraseFilter: (f: Filter) =>
    f.query && typeof f.query === 'object' && 'match_phrase' in f.query,
  getPhraseFilterValue: (f: Filter) => {
    const mp = (f as unknown as { query: { match_phrase: Record<string, string> } }).query
      .match_phrase;
    return Object.values(mp)[0];
  },
  isPhrasesFilter: () => false,
}));

describe('ServiceMapSearchBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetEsQuery = jest.fn();
    mockHistoryReplace = jest.fn();
    mockLocationSearch = '?environment=production&kuery=service.name%3A%22opbeans-go%22';
    mockInitialAppFilters = [];
    mockMissingFields = [];
    mockFilterManager.getAppFilters.mockReturnValue([]);
    mockFilterManager.getGlobalFilters.mockReturnValue([]);
  });

  it('builds esQuery WITHOUT the kuery (server handles it separately)', async () => {
    render(<ServiceMapSearchBar />);

    await waitFor(() => {
      expect(mockSetEsQuery).toHaveBeenCalled();
    });

    const esQuery = mockSetEsQuery.mock.calls[0][0];
    // buildEsQuery was called with [{ query: '', language: 'kuery' }] so the mock
    // only includes filters, not the kuery content.
    expect(esQuery.bool.filter).toEqual([]);
  });

  it('excludes controls whose field is missing from the data view', async () => {
    mockMissingFields = ['cloud.region'];

    const { container } = render(<ServiceMapSearchBar />);

    let controls: Element | null = null;
    await waitFor(() => {
      controls = container.querySelector('[data-testid="service-map-controls"]');
      expect(controls).not.toBeNull();
    });

    const fields = controls!.getAttribute('data-fields') ?? '';
    expect(fields.split(',')).toEqual([
      'service.environment',
      'service.name',
      'cloud.availability_zone',
    ]);
  });

  it('renders a single remaining control at a fixed medium width', async () => {
    mockMissingFields = ['service.name', 'cloud.region', 'cloud.availability_zone'];

    const { container } = render(<ServiceMapSearchBar />);

    let controls: Element | null = null;
    await waitFor(() => {
      controls = container.querySelector('[data-testid="service-map-controls"]');
      expect(controls).not.toBeNull();
    });

    expect(controls!.getAttribute('data-fields')).toBe('service.environment');
    expect(controls!.getAttribute('data-widths')).toBe('medium');
    expect(controls!.getAttribute('data-grows')).toBe('false');
  });

  it('renders two remaining controls at a fixed medium width', async () => {
    mockMissingFields = ['cloud.region', 'cloud.availability_zone'];

    const { container } = render(<ServiceMapSearchBar />);

    let controls: Element | null = null;
    await waitFor(() => {
      controls = container.querySelector('[data-testid="service-map-controls"]');
      expect(controls).not.toBeNull();
    });

    expect(controls!.getAttribute('data-fields')).toBe('service.environment,service.name');
    expect(controls!.getAttribute('data-widths')).toBe('medium,medium');
    expect(controls!.getAttribute('data-grows')).toBe('false,false');
  });

  it('keeps small growing controls when three or more remain', async () => {
    mockMissingFields = ['cloud.availability_zone'];

    const { container } = render(<ServiceMapSearchBar />);

    let controls: Element | null = null;
    await waitFor(() => {
      controls = container.querySelector('[data-testid="service-map-controls"]');
      expect(controls).not.toBeNull();
    });

    expect(controls!.getAttribute('data-fields')).toBe(
      'service.environment,service.name,cloud.region'
    );
    expect(controls!.getAttribute('data-widths')).toBe('small,small,small');
    expect(controls!.getAttribute('data-grows')).toBe('true,true,true');
  });

  it('does not include inherited app filters from another app on initial render', async () => {
    mockFilterManager.getAppFilters.mockReturnValue([
      {
        meta: { key: 'dashboard.only', negate: false, disabled: false },
        query: { match_phrase: { 'dashboard.only': 'value' } },
      } as unknown as Filter,
    ]);

    render(<ServiceMapSearchBar />);

    await waitFor(() => {
      expect(mockSetEsQuery).toHaveBeenCalled();
    });

    const esQuery = mockSetEsQuery.mock.calls[0][0];
    expect(esQuery.bool.filter).toEqual([]);
  });

  it('includes restored Service Map app filters on initial render', async () => {
    mockInitialAppFilters = [
      {
        meta: { key: 'transaction.type', negate: false, disabled: false },
        query: { match_phrase: { 'transaction.type': 'request' } },
      } as unknown as Filter,
    ];

    render(<ServiceMapSearchBar />);

    await waitFor(() => {
      expect(mockSetEsQuery).toHaveBeenCalled();
    });

    const esQuery = mockSetEsQuery.mock.calls[0][0];
    expect(esQuery.bool.filter).toEqual([
      {
        match_phrase: { 'transaction.type': 'value' },
      },
    ]);
  });

  it('preserves global filters on initial render', async () => {
    mockFilterManager.getGlobalFilters.mockReturnValue([
      {
        meta: { key: 'host.name', negate: false, disabled: false },
        query: { match_phrase: { 'host.name': 'host-1' } },
      } as unknown as Filter,
    ]);

    render(<ServiceMapSearchBar />);

    await waitFor(() => {
      expect(mockSetEsQuery).toHaveBeenCalled();
    });

    const esQuery = mockSetEsQuery.mock.calls[0][0];
    expect(esQuery.bool.filter).toEqual([
      {
        match_phrase: { 'host.name': 'value' },
      },
    ]);
  });

  it('excludes environment filter from esQuery when Controls fire', async () => {
    render(<ServiceMapSearchBar />);

    const envFilter: Filter = {
      meta: { key: 'service.environment', negate: false, disabled: false, params: ['production'] },
      query: { match_phrase: { 'service.environment': 'production' } },
    } as unknown as Filter;

    const regionFilter: Filter = {
      meta: { key: 'cloud.region', negate: false, disabled: false, params: ['us-east-1'] },
      query: { match_phrase: { 'cloud.region': 'us-east-1' } },
    } as unknown as Filter;

    act(() => {
      mockOnFiltersChange([envFilter, regionFilter]);
    });

    await waitFor(() => {
      // esQuery should only contain cloud.region, not service.environment
      const lastCall = mockSetEsQuery.mock.calls[mockSetEsQuery.mock.calls.length - 1][0];
      expect(lastCall.bool.filter).toHaveLength(1);
      expect(lastCall.bool.filter[0]).toEqual({
        match_phrase: { 'cloud.region': 'value' },
      });
    });
  });

  it('writes environment from Controls back to the URL param', async () => {
    mockLocationSearch = '?environment=ENVIRONMENT_ALL&kuery=';

    render(<ServiceMapSearchBar />);

    const envFilter: Filter = {
      meta: { key: 'service.environment', negate: false, disabled: false },
      query: { match_phrase: { 'service.environment': 'staging' } },
    } as unknown as Filter;

    act(() => {
      mockOnFiltersChange([envFilter]);
    });

    await waitFor(() => {
      expect(mockHistoryReplace).toHaveBeenCalled();
      const call = mockHistoryReplace.mock.calls[0][0];
      expect(call.search).toContain('environment=staging');
    });
  });
});
