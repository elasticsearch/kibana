/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render } from '@testing-library/react';
import type { MetricsExperienceGridContentProps } from './metrics_experience_grid_content';
import { MetricsExperienceGridContent } from './metrics_experience_grid_content';
import * as hooks from './hooks';
import type {
  UnifiedHistogramFetch$,
  UnifiedHistogramFetchParams,
} from '@kbn/unified-histogram/types';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import type { ParsedMetricItem, MetricUnit, Dimension } from '../../../types';
import { METRICS_GRID_SETTINGS_DEFAULTS, METRICS_GRID_SORT_DEFAULTS } from '@kbn/discover-utils';
import { ES_FIELD_TYPES } from '@kbn/field-types';
import * as metricsExperienceStateProvider from './context/metrics_experience_state_provider';
import { getFetch$Mock, getFetchParamsMock } from '@kbn/unified-histogram/__mocks__/fetch_params';
import type { MappingTimeSeriesMetricType } from '@elastic/elasticsearch/lib/api/types';

jest.mock('./context/metrics_experience_state_provider');
jest.mock('./hooks');
jest.mock('../../chart', () => ({
  Chart: jest.fn(() => <div data-test-subj="metric-chart" />),
}));

jest.mock('./metrics_grid', () => ({
  MetricsGrid: jest.fn((props: { metricItems: any[] }) =>
    props.metricItems.length === 0 ? (
      <div data-test-subj="metricsExperienceNoData" />
    ) : (
      <div data-test-subj="unifiedMetricsExperienceGrid" />
    )
  ),
}));

/**
 * Mock EuiDelayRender to render immediately in tests.
 */
jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    EuiDelayRender: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const useMetricsExperienceStateMock =
  metricsExperienceStateProvider.useMetricsExperienceState as jest.MockedFunction<
    typeof metricsExperienceStateProvider.useMetricsExperienceState
  >;

const usePaginationMock = hooks.usePagination as jest.MockedFunction<typeof hooks.usePagination>;

const dimensions: Dimension[] = [{ name: 'foo' }, { name: 'qux' }];

const metricItems: ParsedMetricItem[] = [
  {
    metricName: 'field1',
    indexName: 'metrics-*',
    units: ['ms'],
    metricTypes: ['counter'],
    fieldTypes: [ES_FIELD_TYPES.LONG],
    dimensionFields: [dimensions[0]],
  },
  {
    metricName: 'field2',
    indexName: 'metrics-*',
    units: ['ms'],
    metricTypes: ['counter'],
    fieldTypes: [ES_FIELD_TYPES.LONG],
    dimensionFields: [dimensions[1]],
  },
];

describe('MetricsExperienceGridContent', () => {
  let fetch$: UnifiedHistogramFetch$;
  let fetchParams: UnifiedHistogramFetchParams;
  let defaultProps: MetricsExperienceGridContentProps;

  beforeEach(() => {
    jest.clearAllMocks();

    fetchParams = getFetchParamsMock({
      dataView: { getIndexPattern: () => 'metrics-*', isTimeBased: () => true } as any,
      filters: [],
      query: { esql: 'FROM metrics-*' },
      esqlVariables: [],
      relativeTimeRange: { from: 'now-15m', to: 'now' },
    });

    // Create new Subject for each test to prevent memory leaks
    fetch$ = getFetch$Mock(fetchParams);

    defaultProps = {
      metricItems,
      activeDimensions: [],
      services: {} as any,
      discoverFetch$: fetch$,
      fetchParams,
      onBrushEnd: jest.fn(),
      onFilter: jest.fn(),
      actions: {
        openInNewTab: jest.fn(),
        updateESQLQuery: jest.fn(),
      },
      histogramCss: { name: '', styles: '' },
      isTabSelected: true,
      exemplarsAvailability: { availableMetrics: new Set<string>(), hasProbeFailed: false },
    };

    useMetricsExperienceStateMock.mockReturnValue({
      currentPage: 0,
      selectedDimensions: [],
      onDimensionsChange: jest.fn(),
      onPageChange: jest.fn(),
      isFullscreen: false,
      searchTerm: '',
      onSearchTermChange: jest.fn(),
      onToggleFullscreen: jest.fn(),
      onExitFullscreen: jest.fn(),
      flyoutState: undefined,
      onFlyoutStateChange: jest.fn(),
      onFlyoutSelectedTabChange: jest.fn(),
      metricsSort: METRICS_GRID_SORT_DEFAULTS,
      onMetricsSortChange: jest.fn(),
      profileId: 'test-profile-id',
      gridSettings: METRICS_GRID_SETTINGS_DEFAULTS,
      recentlyExploredMetrics: [],
      onGridSettingsChange: jest.fn(),
    });

    usePaginationMock.mockReturnValue({
      currentPageItems: [metricItems[0]],
      totalPages: 1,
      totalCount: 1,
    });
  });

  afterEach(() => {
    // Complete the Subject to prevent memory leaks and hanging tests
    fetch$.complete();
  });

  it('renders the grid with paginated fields', () => {
    const { getByTestId } = render(<MetricsExperienceGridContent {...defaultProps} />, {
      wrapper: IntlProvider,
    });

    expect(getByTestId('metricsExperienceRendered')).toBeInTheDocument();
  });

  it('renders the no data state when filtered/paginated fields returns no fields', () => {
    usePaginationMock.mockReturnValue({
      currentPageItems: [],
      totalPages: 0,
      totalCount: 0,
    });

    const { getByTestId } = render(
      <MetricsExperienceGridContent {...defaultProps} metricItems={[]} />,
      {
        wrapper: IntlProvider,
      }
    );

    expect(getByTestId('metricsExperienceNoData')).toBeInTheDocument();
  });

  it('filters fields by search term and respects page size', () => {
    // 20 fields, 10 with "cpu" in the name
    const allFieldsSomeWithCpu = Array.from({ length: 20 }, (_, i) => ({
      metricName: i % 2 === 0 ? `cpu_field_${i}` : `mem_field_${i}`,
      dimensionFields: [dimensions[0]],
      indexName: 'metrics-*',
      units: ['ms'] as MetricUnit[],
      metricTypes: ['counter'] as MappingTimeSeriesMetricType[],
      fieldTypes: [ES_FIELD_TYPES.LONG] as ES_FIELD_TYPES[],
    }));

    useMetricsExperienceStateMock.mockReturnValue({
      currentPage: 0,
      selectedDimensions: [],
      onDimensionsChange: jest.fn(),
      onPageChange: jest.fn(),
      isFullscreen: false,
      searchTerm: 'cpu',
      onSearchTermChange: jest.fn(),
      onToggleFullscreen: jest.fn(),
      onExitFullscreen: jest.fn(),
      flyoutState: undefined,
      onFlyoutStateChange: jest.fn(),
      onFlyoutSelectedTabChange: jest.fn(),
      metricsSort: METRICS_GRID_SORT_DEFAULTS,
      onMetricsSortChange: jest.fn(),
      profileId: 'test-profile-id',
      gridSettings: METRICS_GRID_SETTINGS_DEFAULTS,
      recentlyExploredMetrics: [],
      onGridSettingsChange: jest.fn(),
    });

    const cpuMetricItems = allFieldsSomeWithCpu.filter((f) => f.metricName.includes('cpu'));

    usePaginationMock.mockReturnValue({
      currentPageItems: cpuMetricItems.slice(0, 5),
      totalPages: 2,
      totalCount: cpuMetricItems.length,
    });

    const { getByText } = render(
      <MetricsExperienceGridContent {...defaultProps} metricItems={allFieldsSomeWithCpu} />,
      {
        wrapper: IntlProvider,
      }
    );

    expect(getByText('10 metrics')).toBeInTheDocument();
  });

  it('renders the <MetricsGrid />', () => {
    const { getByTestId } = render(<MetricsExperienceGridContent {...defaultProps} />, {
      wrapper: IntlProvider,
    });

    expect(getByTestId('unifiedMetricsExperienceGrid')).toBeInTheDocument();
  });

  it('renders the loading state when Discover is reloading', () => {
    const { getByTestId } = render(
      <MetricsExperienceGridContent {...defaultProps} isDiscoverLoading />,
      {
        wrapper: IntlProvider,
      }
    );

    expect(getByTestId('metricsExperienceProgressBar')).toBeInTheDocument();
  });

  it('passes activeDimensions prop to MetricsGrid', () => {
    const { MetricsGrid } = jest.requireMock('./metrics_grid');

    render(<MetricsExperienceGridContent {...defaultProps} activeDimensions={[dimensions[0]]} />, {
      wrapper: IntlProvider,
    });

    const lastCall = (MetricsGrid as jest.Mock).mock.calls[
      (MetricsGrid as jest.Mock).mock.calls.length - 1
    ][0];
    expect(lastCall.dimensions).toEqual([dimensions[0]]);
  });
});
