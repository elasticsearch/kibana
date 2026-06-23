/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { fireEvent, render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MetricsGridProps } from './metrics_grid';
import { MetricsGrid } from './metrics_grid';
import { Chart } from '../../chart';
import type { UnifiedHistogramServices } from '@kbn/unified-histogram';
import { getFetchParamsMock, getFetch$Mock } from '@kbn/unified-histogram/__mocks__/fetch_params';
import { ES_FIELD_TYPES } from '@kbn/field-types';
import { fieldsMetadataPluginPublicMock } from '@kbn/fields-metadata-plugin/public/mocks';
import type { UnifiedHistogramFetch$ } from '@kbn/unified-histogram/types';
import type { UnifiedMetricsGridProps } from '../../../types';
import { createESQLQuery } from '../../../common/utils';
import { dismissAllFlyoutsExceptFor } from '@kbn/discover-utils';
import { MetricsExperienceStateProvider } from './context/metrics_experience_state_provider';
import { withRestorableState } from '../../../restorable_state';
import type { FlyoutState } from '../../../restorable_state';

jest.mock('@kbn/discover-utils', () => ({
  DiscoverFlyouts: { metricInsights: 'metricInsights' },
  dismissAllFlyoutsExceptFor: jest.fn(),
}));

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    useIsWithinMinBreakpoint: jest.fn(() => true),
  };
});

jest.mock('../../chart', () => ({
  Chart: jest.fn(() => <div data-test-subj="chart" />),
}));

jest.mock('../../../common/utils', () => ({
  ...jest.requireActual('../../../common/utils'),
  createESQLQuery: jest.fn((params) => {
    const { metricItem, splitAccessors = [] } = params;
    const splitAccessorsStr =
      splitAccessors.length > 0
        ? `, ${splitAccessors.map((field: string) => `\`${field}\``).join(', ')}`
        : '';
    return `FROM ${metricItem.indexName} | STATS AVG(${metricItem.metricName}) BY TBUCKET(100)${splitAccessorsStr}`;
  }),
}));

describe('MetricsGrid', () => {
  let discoverFetch$: UnifiedHistogramFetch$;

  const actions: UnifiedMetricsGridProps['actions'] = {
    openInNewTab: jest.fn(),
    updateESQLQuery: jest.fn(),
  };

  const fetchParams: MetricsGridProps['fetchParams'] = getFetchParamsMock({
    filters: [],
    query: {
      esql: 'FROM metrics-*',
    },
    esqlVariables: [],
    relativeTimeRange: { from: 'now-1h', to: 'now' },
  });

  const services = {
    fieldsMetadata: fieldsMetadataPluginPublicMock.createStartContract(),
  } as unknown as UnifiedHistogramServices;

  const metricItems: MetricsGridProps['metricItems'] = [
    {
      metricName: 'system.cpu.utilization',
      indexName: 'metrics-*',
      units: ['ms'],
      metricTypes: ['counter'],
      fieldTypes: [ES_FIELD_TYPES.LONG],
      dimensionFields: [{ name: 'host.name' }],
    },
    {
      metricName: 'system.memory.utilization',
      indexName: 'metrics-*',
      units: ['ms'],
      metricTypes: ['counter'],
      fieldTypes: [ES_FIELD_TYPES.LONG],
      dimensionFields: [{ name: 'host.name' }],
    },
  ];

  const defaultProps: MetricsGridProps = {
    columns: 2,
    dimensions: [],
    discoverFetch$: undefined as unknown as UnifiedHistogramFetch$,
    metricItems,
    fetchParams,
    services,
    actions,
    isTabSelected: true,
  };

  const renderMetricsGrid = (props: Partial<MetricsGridProps> = {}) => {
    return render(
      <MetricsExperienceStateProvider profileId="test-profile">
        <MetricsGrid {...defaultProps} discoverFetch$={discoverFetch$} {...props} />
      </MetricsExperienceStateProvider>
    );
  };

  const MetricsGridWithRestorableState = withRestorableState(
    (props: MetricsGridProps & { profileId: string }) => (
      <MetricsExperienceStateProvider profileId={props.profileId}>
        <MetricsGrid {...props} />
      </MetricsExperienceStateProvider>
    )
  );

  const renderMetricsGridWithInitialFlyoutState = (
    initialFlyoutState: FlyoutState | undefined,
    props: Partial<MetricsGridProps> = {}
  ) => {
    return render(
      <MetricsGridWithRestorableState
        {...defaultProps}
        discoverFetch$={discoverFetch$}
        profileId="test-profile"
        initialState={{ flyoutState: initialFlyoutState }}
        {...props}
      />
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    discoverFetch$ = getFetch$Mock(fetchParams);
  });

  afterEach(() => {
    discoverFetch$.complete();
  });

  it('renders MetricChart for each metric field when pivotOn is metric', () => {
    const { getAllByTestId } = renderMetricsGrid({ columns: 3 });

    const charts = getAllByTestId('chart');
    expect(charts).toHaveLength(metricItems.length);
  });

  it('passes syncCursor and syncTooltips={false} to each chart for cross-panel cursor sync', () => {
    renderMetricsGrid();

    metricItems.forEach((_, index) => {
      expect(Chart).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({ syncCursor: true, syncTooltips: false }),
        expect.anything()
      );
    });
  });

  it('passes the correct size prop', () => {
    const { rerender } = render(
      <MetricsExperienceStateProvider profileId="test-profile">
        <MetricsGrid
          {...defaultProps}
          columns={3}
          dimensions={[{ name: 'host.name' }]}
          discoverFetch$={discoverFetch$}
        />
      </MetricsExperienceStateProvider>
    );

    expect(Chart).toHaveBeenCalledWith(expect.objectContaining({ size: 's' }), expect.anything());

    rerender(
      <MetricsExperienceStateProvider profileId="test-profile">
        <MetricsGrid
          {...defaultProps}
          columns={4}
          dimensions={[{ name: 'host.name' }]}
          discoverFetch$={discoverFetch$}
        />
      </MetricsExperienceStateProvider>
    );

    expect(Chart).toHaveBeenCalledWith(expect.objectContaining({ size: 's' }), expect.anything());
  });

  it('passes getUserMessages(metric) result to each chart when getUserMessages is provided', () => {
    const messagesForCpu = [
      {
        uniqueId: 'cpu-message',
        severity: 'warning' as const,
        shortMessage: 'CPU',
        longMessage: 'CPU message',
        fixableInEditor: false,
        displayLocations: [{ id: 'embeddableBadge' as const }],
      },
    ];

    const getUserMessages = jest.fn((metric: (typeof metricItems)[0]) =>
      metric.metricName === 'system.cpu.utilization' ? messagesForCpu : undefined
    );

    renderMetricsGrid({ getUserMessages });

    expect(getUserMessages).toHaveBeenCalledTimes(metricItems.length);
    expect(getUserMessages).toHaveBeenNthCalledWith(1, metricItems[0]);
    expect(getUserMessages).toHaveBeenNthCalledWith(2, metricItems[1]);

    expect(Chart).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ userMessages: messagesForCpu }),
      expect.anything()
    );
    expect(Chart).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ userMessages: undefined }),
      expect.anything()
    );
  });

  it('passes getDescription(metric) result to each chart when getDescription is provided', () => {
    const descriptionForFirst = 'Data stream: metrics-system.cpu-default';

    const getDescription = jest.fn((metric: (typeof metricItems)[0]) =>
      metric.metricName === 'system.cpu.utilization' ? descriptionForFirst : undefined
    );

    renderMetricsGrid({ getDescription });

    expect(getDescription).toHaveBeenCalledTimes(metricItems.length);
    expect(getDescription).toHaveBeenNthCalledWith(1, metricItems[0]);
    expect(getDescription).toHaveBeenNthCalledWith(2, metricItems[1]);

    expect(Chart).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ description: descriptionForFirst }),
      expect.anything()
    );
    expect(Chart).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ description: undefined }),
      expect.anything()
    );
  });

  it('filters dimensions to only those applicable to each metric', () => {
    // mockMetricItems only have dimensionFields: [{ name: 'host.name' }]
    // so service.name and container.id should be filtered out
    const multipleDimensions = [
      { name: 'host.name' },
      { name: 'service.name' },
      { name: 'container.id' },
    ];

    renderMetricsGrid({ dimensions: multipleDimensions });

    expect(createESQLQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        metricItem: expect.any(Object),
        splitAccessors: ['host.name'],
      })
    );

    expect(Chart).toHaveBeenCalledWith(
      expect.objectContaining({
        chartLayers: expect.arrayContaining([
          expect.objectContaining({
            breakdown: ['host.name'],
          }),
        ]),
      }),
      expect.anything()
    );
  });

  it('applies breakdown per-metric when metrics have different dimensionFields', () => {
    const heterogeneousMetrics: MetricsGridProps['metricItems'] = [
      {
        metricName: 'fieldsense.energy.battery.voltage',
        indexName: 'fieldsense-station-metrics',
        units: [null],
        metricTypes: ['gauge'],
        fieldTypes: [ES_FIELD_TYPES.DOUBLE],
        dimensionFields: [{ name: 'station.id' }, { name: 'sensor.type' }],
      },
      {
        metricName: 'system.cpu.utilization',
        indexName: 'metrics-hostmetricsreceiver.otel-default',
        units: [null],
        metricTypes: ['gauge'],
        fieldTypes: [ES_FIELD_TYPES.DOUBLE],
        dimensionFields: [{ name: 'attributes.cpu' }, { name: 'host.name' }],
      },
    ];

    // Select station.id, which only exists in the fieldsense metric
    renderMetricsGrid({
      metricItems: heterogeneousMetrics,
      dimensions: [{ name: 'station.id' }],
    });

    // First chart (fieldsense) should get the breakdown
    expect(createESQLQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        metricItem: expect.objectContaining({ metricName: 'fieldsense.energy.battery.voltage' }),
        splitAccessors: ['station.id'],
      })
    );

    // Second chart (hostmetrics) should get no breakdown
    expect(createESQLQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        metricItem: expect.objectContaining({ metricName: 'system.cpu.utilization' }),
        splitAccessors: [],
      })
    );
  });

  // Regression coverage for issue #262360: the user-typed source must be threaded
  // from `fetchParams.query` through `MetricsGrid` into `createESQLQuery` as
  // `originalSource`, so backing-index queries stay at the same scope METRICS_INFO
  // scanned (avoiding cross-backing-index field-type conflicts being re-introduced
  // when the chart query widens back to the parent data stream).
  describe('originalSource plumbing (issue #262360)', () => {
    const backingIndex = '.ds-edge-case-gauge-to-counter-2026.04.29-000001';

    const backingIndexFetchParams: MetricsGridProps['fetchParams'] = getFetchParamsMock({
      filters: [],
      query: { esql: `TS ${backingIndex}` },
      esqlVariables: [],
      relativeTimeRange: { from: 'now-1h', to: 'now' },
    });

    const sourceFetchParams: MetricsGridProps['fetchParams'] = getFetchParamsMock({
      filters: [],
      query: { esql: 'TS edge-case-gauge-to-counter' },
      esqlVariables: [],
      relativeTimeRange: { from: 'now-1h', to: 'now' },
    });

    const globFetchParams: MetricsGridProps['fetchParams'] = getFetchParamsMock({
      filters: [],
      query: { esql: 'TS edge-case-*' },
      esqlVariables: [],
      relativeTimeRange: { from: 'now-1h', to: 'now' },
    });

    it('forwards the user-typed backing index as originalSource', () => {
      renderMetricsGrid({ fetchParams: backingIndexFetchParams });

      expect(createESQLQuery).toHaveBeenCalledWith(
        expect.objectContaining({ originalSource: backingIndex })
      );
    });

    it('forwards the user-typed data stream as originalSource', () => {
      renderMetricsGrid({ fetchParams: sourceFetchParams });

      expect(createESQLQuery).toHaveBeenCalledWith(
        expect.objectContaining({ originalSource: 'edge-case-gauge-to-counter' })
      );
    });

    it('forwards the raw glob pattern as originalSource (createESQLQuery falls back to indexName)', () => {
      renderMetricsGrid({ fetchParams: globFetchParams });

      expect(createESQLQuery).toHaveBeenCalledWith(
        expect.objectContaining({ originalSource: 'edge-case-*' })
      );
    });
  });

  describe('MetricsGrid keyboard navigation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('renders with proper ARIA grid attributes', () => {
      renderMetricsGrid();

      const gridElement = screen.getByRole('grid');
      expect(gridElement).toBeInTheDocument();
      expect(gridElement).toHaveAttribute('aria-rowcount', '1'); // 2 fields, 2 columns = 1 row
      expect(gridElement).toHaveAttribute('aria-colcount', '2');
      expect(gridElement).toHaveAttribute('tabindex', '0');
      expect(gridElement).toHaveAttribute(
        'aria-label',
        'Metric charts grid. Use arrow keys to navigate.'
      );
    });

    it('renders grid cells with proper ARIA attributes', () => {
      renderMetricsGrid();

      const gridCells = screen.getAllByRole('gridcell');
      expect(gridCells).toHaveLength(2);

      // First cell should be focusable initially (default focus position)
      expect(gridCells[0]).toHaveAttribute('tabindex', '0');
      expect(gridCells[0]).toHaveAttribute('aria-rowindex', '1');
      expect(gridCells[0]).toHaveAttribute('aria-colindex', '1');

      // Second cell should not be focusable initially
      expect(gridCells[1]).toHaveAttribute('tabindex', '-1');
      expect(gridCells[1]).toHaveAttribute('aria-rowindex', '1');
      expect(gridCells[1]).toHaveAttribute('aria-colindex', '2');
    });

    it('should handle arrow key navigation correctly', async () => {
      const user = userEvent.setup({ delay: null });

      renderMetricsGrid();

      const gridElement = screen.getByRole('grid');
      const gridCells = screen.getAllByRole('gridcell');

      await user.click(gridElement);
      await user.keyboard('{ArrowRight}');

      // Second cell should be focused
      expect(gridCells[0]).toHaveAttribute('tabindex', '-1');
      expect(gridCells[1]).toHaveAttribute('tabindex', '0');

      await user.keyboard('{ArrowLeft}');

      // First cell should be focused again
      expect(gridCells[0]).toHaveAttribute('tabindex', '0');
      expect(gridCells[1]).toHaveAttribute('tabindex', '-1');
    });

    it('should handle clicking on cells to focus them', async () => {
      const user = userEvent.setup({ delay: null });

      renderMetricsGrid();

      const gridCells = screen.getAllByRole('gridcell');

      await user.click(gridCells[1]);

      // Second cell should be focused
      expect(gridCells[0]).toHaveAttribute('tabindex', '-1');
      expect(gridCells[1]).toHaveAttribute('tabindex', '0');
    });

    it('should handle vertical arrow navigation in multi-row grid', async () => {
      const user = userEvent.setup({ delay: null });
      const multipleFields: MetricsGridProps['metricItems'] = [
        ...metricItems,
        {
          metricName: 'system.disk.utilization',
          indexName: 'metrics-*',
          units: ['ms'],
          metricTypes: ['counter'],
          fieldTypes: [ES_FIELD_TYPES.LONG],
          dimensionFields: [{ name: 'host.name' }],
        },
        {
          metricName: 'system.network.utilization',
          indexName: 'metrics-*',
          units: ['ms'],
          metricTypes: ['counter'],
          fieldTypes: [ES_FIELD_TYPES.LONG],
          dimensionFields: [{ name: 'host.name' }],
        },
      ];

      renderMetricsGrid({ metricItems: multipleFields });

      const gridElement = screen.getByRole('grid');
      const gridCells = screen.getAllByRole('gridcell');

      await user.click(gridElement);

      // Initially at cell 0 (row 0, col 0)
      expect(gridCells[0]).toHaveAttribute('tabindex', '0');

      await user.keyboard('{ArrowDown}');
      expect(gridCells[0]).toHaveAttribute('tabindex', '-1');
      expect(gridCells[2]).toHaveAttribute('tabindex', '0');

      await user.keyboard('{ArrowUp}');
      expect(gridCells[2]).toHaveAttribute('tabindex', '-1');
      expect(gridCells[0]).toHaveAttribute('tabindex', '0');
    });
  });

  describe('MetricsGrid focus management', () => {
    beforeEach(() => {
      // Mock setTimeout to run synchronously in tests
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 0 as any;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe('Chart ref management', () => {
      it('should generate unique chart IDs for each metric', () => {
        renderMetricsGrid();

        const chartDiv1 = document.getElementById('system.cpu.utilization-0');
        const chartDiv2 = document.getElementById('system.memory.utilization-1');

        expect(chartDiv1).toBeTruthy();
        expect(chartDiv2).toBeTruthy();
      });

      it('should store chart refs with proper data attributes', () => {
        renderMetricsGrid();

        const gridCells = screen.getAllByRole('gridcell');

        // Verify grid cells have proper tracking attributes
        expect(gridCells[0]).toHaveAttribute('data-grid-cell', '0-0');
        expect(gridCells[1]).toHaveAttribute('data-grid-cell', '0-1');
      });
    });

    describe('Focus state management', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should update focus state when cell receives focus', async () => {
        const user = userEvent.setup({ delay: null });

        renderMetricsGrid();

        const gridCells = screen.getAllByRole('gridcell');

        // Focus the second cell
        await user.click(gridCells[1]);

        // Verify focus state updated correctly
        expect(gridCells[0]).toHaveAttribute('tabindex', '-1');
        expect(gridCells[1]).toHaveAttribute('tabindex', '0');
      });

      it('should handle programmatic focus correctly', () => {
        renderMetricsGrid();

        const gridCells = screen.getAllByRole('gridcell');

        // Simulate programmatic focus (like from flyout closing)
        act(() => gridCells[1].focus());
        act(() => fireEvent.focus(gridCells[1]));

        // Verify focus state and DOM focus
        expect(document.activeElement).toBe(gridCells[1]);
        expect(gridCells[1]).toHaveAttribute('tabindex', '0');
        expect(gridCells[0]).toHaveAttribute('tabindex', '-1');
      });
    });
  });

  describe('flyout dismissal on view details', () => {
    it('should call dismissAllFlyoutsExceptFor with metricInsights when handleViewDetails is triggered', () => {
      renderMetricsGrid();

      // Get the onViewDetails callback passed to the first Chart
      const chartCalls = (Chart as jest.Mock).mock.calls;
      expect(chartCalls.length).toBeGreaterThan(0);

      const firstChartProps = chartCalls[0][0];
      expect(firstChartProps.onViewDetails).toBeDefined();

      // Clear mock to isolate calls from handleViewDetails vs flyout mount useEffect
      (dismissAllFlyoutsExceptFor as jest.Mock).mockClear();

      // Trigger the onViewDetails callback
      act(() => {
        firstChartProps.onViewDetails();
      });

      // Verify dismissAllFlyoutsExceptFor was called from handleViewDetails
      // AND from the flyout's useEffect on mount (2 calls total).
      // The first call is the early dismissal in handleViewDetails (before flyout mounts),
      // the second is the safety-net useEffect inside MetricInsightsFlyout.
      expect(dismissAllFlyoutsExceptFor).toHaveBeenCalledTimes(2);
      expect(dismissAllFlyoutsExceptFor).toHaveBeenCalledWith('metricInsights');
    });
  });

  describe('flyout state persistence', () => {
    it('renders the metrics insights flyout when View details is triggered', () => {
      const { queryByTestId } = renderMetricsGrid();

      expect(queryByTestId('metricsExperienceFlyout')).not.toBeInTheDocument();

      const firstChartProps = (Chart as jest.Mock).mock.calls[0][0];

      act(() => {
        firstChartProps.onViewDetails();
      });

      expect(queryByTestId('metricsExperienceFlyout')).toBeInTheDocument();
    });

    it('renders the flyout when initial restorable flyoutState references an existing metric', () => {
      const { queryByTestId } = renderMetricsGridWithInitialFlyoutState({
        gridPosition: 1,
        metricUniqueKey: `${metricItems[1].indexName}::${metricItems[1].metricName}`,
        esqlQuery: 'FROM metrics-* | STATS AVG(system.memory.utilization) BY TBUCKET(100)',
        selectedTabId: 'overview',
      });

      expect(queryByTestId('metricsExperienceFlyout')).toBeInTheDocument();
    });

    it('does not render the flyout when initial restorable flyoutState references a missing metric', () => {
      const { queryByTestId } = renderMetricsGridWithInitialFlyoutState({
        gridPosition: 0,
        metricUniqueKey: 'metrics-*::no.longer.here',
        esqlQuery: 'FROM metrics-* | STATS AVG(no.longer.here) BY TBUCKET(100)',
        selectedTabId: 'overview',
      });

      expect(queryByTestId('metricsExperienceFlyout')).not.toBeInTheDocument();
    });

    it('preserves restored flyoutState during initial render when metric items are empty (duplicate-tab scenario)', () => {
      const onInitialStateChange = jest.fn();
      const initialFlyoutState: FlyoutState = {
        gridPosition: 0,
        metricUniqueKey: `${metricItems[0].indexName}::${metricItems[0].metricName}`,
        esqlQuery: 'FROM metrics-* | STATS AVG(system.cpu.utilization) BY TBUCKET(100)',
        selectedTabId: 'overview',
      };

      render(
        <MetricsGridWithRestorableState
          {...defaultProps}
          discoverFetch$={discoverFetch$}
          profileId="test-profile"
          metricItems={[]}
          initialState={{ flyoutState: initialFlyoutState }}
          onInitialStateChange={onInitialStateChange}
        />
      );

      const clearedWithUndefined = onInitialStateChange.mock.calls.some(
        ([state]) => state?.flyoutState === undefined
      );
      expect(clearedWithUndefined).toBe(false);
    });

    it('clears stale flyoutState when the referenced metric is no longer present', () => {
      const onInitialStateChange = jest.fn();

      render(
        <MetricsGridWithRestorableState
          {...defaultProps}
          discoverFetch$={discoverFetch$}
          profileId="test-profile"
          initialState={{
            flyoutState: {
              gridPosition: 0,
              metricUniqueKey: 'metrics-*::no.longer.here',
              esqlQuery: 'FROM metrics-* | STATS AVG(no.longer.here) BY TBUCKET(100)',
              selectedTabId: 'overview',
            },
          }}
          onInitialStateChange={onInitialStateChange}
        />
      );

      const lastCall = onInitialStateChange.mock.calls.at(-1)?.[0];
      expect(lastCall?.flyoutState).toBeUndefined();
    });

    it('clears flyoutState when the flyout is closed', () => {
      const onInitialStateChange = jest.fn();

      const { getByTestId, queryByTestId } = render(
        <MetricsGridWithRestorableState
          {...defaultProps}
          discoverFetch$={discoverFetch$}
          profileId="test-profile"
          initialState={{
            flyoutState: {
              gridPosition: 0,
              metricUniqueKey: `${metricItems[0].indexName}::${metricItems[0].metricName}`,
              esqlQuery: 'FROM metrics-* | STATS AVG(system.cpu.utilization) BY TBUCKET(100)',
              selectedTabId: 'overview',
            },
          }}
          onInitialStateChange={onInitialStateChange}
        />
      );

      expect(getByTestId('metricsExperienceFlyout')).toBeInTheDocument();

      act(() => {
        fireEvent.keyDown(getByTestId('metricsExperienceFlyout'), {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        });
      });

      expect(queryByTestId('metricsExperienceFlyout')).not.toBeInTheDocument();

      const lastCall = onInitialStateChange.mock.calls.at(-1)?.[0];
      expect(lastCall?.flyoutState).toBeUndefined();
    });

    it('does not render the flyout when isTabSelected is false even with restored flyoutState', () => {
      const { queryByTestId } = renderMetricsGridWithInitialFlyoutState(
        {
          gridPosition: 1,
          metricUniqueKey: `${metricItems[1].indexName}::${metricItems[1].metricName}`,
          esqlQuery: 'FROM metrics-* | STATS AVG(system.memory.utilization) BY TBUCKET(100)',
          selectedTabId: 'overview',
        },
        { isTabSelected: false }
      );

      expect(queryByTestId('metricsExperienceFlyout')).not.toBeInTheDocument();
    });

    it('renders the restored flyout once the owning tab becomes active', () => {
      const initialFlyoutState: FlyoutState = {
        gridPosition: 1,
        metricUniqueKey: `${metricItems[1].indexName}::${metricItems[1].metricName}`,
        esqlQuery: 'FROM metrics-* | STATS AVG(system.memory.utilization) BY TBUCKET(100)',
        selectedTabId: 'overview',
      };

      const { queryByTestId, rerender } = render(
        <MetricsGridWithRestorableState
          {...defaultProps}
          discoverFetch$={discoverFetch$}
          profileId="test-profile"
          initialState={{ flyoutState: initialFlyoutState }}
          isTabSelected={false}
        />
      );

      expect(queryByTestId('metricsExperienceFlyout')).not.toBeInTheDocument();

      rerender(
        <MetricsGridWithRestorableState
          {...defaultProps}
          discoverFetch$={discoverFetch$}
          profileId="test-profile"
          initialState={{ flyoutState: initialFlyoutState }}
          isTabSelected={true}
        />
      );

      expect(queryByTestId('metricsExperienceFlyout')).toBeInTheDocument();
    });

    it('returns focus to the originating grid cell after closing the flyout', () => {
      jest
        .spyOn(global, 'requestAnimationFrame')
        .mockImplementation((cb: FrameRequestCallback): number => {
          cb(0);
          return 0;
        });

      const { getByTestId, getAllByRole } = render(
        <MetricsGridWithRestorableState
          {...defaultProps}
          discoverFetch$={discoverFetch$}
          profileId="test-profile"
          initialState={{
            flyoutState: {
              gridPosition: 1,
              metricUniqueKey: `${metricItems[1].indexName}::${metricItems[1].metricName}`,
              esqlQuery: 'FROM metrics-* | STATS AVG(system.memory.utilization) BY TBUCKET(100)',
              selectedTabId: 'overview',
            },
          }}
        />
      );

      const gridCells = getAllByRole('gridcell');

      act(() => {
        fireEvent.keyDown(getByTestId('metricsExperienceFlyout'), {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        });
      });

      expect(document.activeElement).toBe(gridCells[1]);

      (global.requestAnimationFrame as unknown as jest.SpyInstance).mockRestore();
    });

    it('returns focus to the live metric position when the grid reordered while the flyout was open', () => {
      jest
        .spyOn(global, 'requestAnimationFrame')
        .mockImplementation((cb: FrameRequestCallback): number => {
          cb(0);
          return 0;
        });

      const { getByTestId, getAllByRole } = render(
        <MetricsGridWithRestorableState
          {...defaultProps}
          discoverFetch$={discoverFetch$}
          profileId="test-profile"
          initialState={{
            flyoutState: {
              gridPosition: 0,
              metricUniqueKey: `${metricItems[1].indexName}::${metricItems[1].metricName}`,
              esqlQuery: 'FROM metrics-* | STATS AVG(system.memory.utilization) BY TBUCKET(100)',
              selectedTabId: 'overview',
            },
          }}
        />
      );

      const gridCells = getAllByRole('gridcell');

      act(() => {
        fireEvent.keyDown(getByTestId('metricsExperienceFlyout'), {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        });
      });

      expect(document.activeElement).toBe(gridCells[1]);

      (global.requestAnimationFrame as unknown as jest.SpyInstance).mockRestore();
    });
  });

  describe('render efficiency', () => {
    // Two metrics whose dimensionFields do NOT overlap.
    // Selecting 'host.name' is only meaningful for the first metric.
    const nonOverlappingMetrics: MetricsGridProps['metricItems'] = [
      {
        metricName: 'system.cpu.utilization',
        indexName: 'metrics-system',
        units: ['ms'],
        metricTypes: ['counter'],
        fieldTypes: [ES_FIELD_TYPES.LONG],
        dimensionFields: [{ name: 'host.name' }],
      },
      {
        metricName: 'k8s.container.cpu',
        indexName: 'metrics-k8s',
        units: ['ms'],
        metricTypes: ['counter'],
        fieldTypes: [ES_FIELD_TYPES.LONG],
        dimensionFields: [{ name: 'container.id' }],
      },
    ];

    it('recomputes esqlQuery only for metrics whose applicable dimensions changed', () => {
      const { rerender } = render(
        <MetricsExperienceStateProvider profileId="test-profile">
          <MetricsGrid
            {...defaultProps}
            discoverFetch$={discoverFetch$}
            metricItems={nonOverlappingMetrics}
            dimensions={[]}
          />
        </MetricsExperienceStateProvider>
      );

      expect(createESQLQuery).toHaveBeenCalledTimes(nonOverlappingMetrics.length);
      (createESQLQuery as jest.Mock).mockClear();

      // Select 'host.name'. Only system.cpu.utilization supports it —
      // k8s.container.cpu stays at [] → [] with a stable empty array reference.
      rerender(
        <MetricsExperienceStateProvider profileId="test-profile">
          <MetricsGrid
            {...defaultProps}
            discoverFetch$={discoverFetch$}
            metricItems={nonOverlappingMetrics}
            dimensions={[{ name: 'host.name' }]}
          />
        </MetricsExperienceStateProvider>
      );

      expect(createESQLQuery).toHaveBeenCalledTimes(1);
    });

    it('does not recompute esqlQuery when dimensions get a new array with identical content', () => {
      const dimensions = [{ name: 'host.name' }];
      const { rerender } = render(
        <MetricsExperienceStateProvider profileId="test-profile">
          <MetricsGrid
            {...defaultProps}
            discoverFetch$={discoverFetch$}
            metricItems={nonOverlappingMetrics}
            dimensions={dimensions}
          />
        </MetricsExperienceStateProvider>
      );

      expect(createESQLQuery).toHaveBeenCalledTimes(nonOverlappingMetrics.length);
      (createESQLQuery as jest.Mock).mockClear();

      rerender(
        <MetricsExperienceStateProvider profileId="test-profile">
          <MetricsGrid
            {...defaultProps}
            discoverFetch$={discoverFetch$}
            metricItems={nonOverlappingMetrics}
            dimensions={[{ name: 'host.name' }]}
          />
        </MetricsExperienceStateProvider>
      );

      expect(createESQLQuery).not.toHaveBeenCalled();
    });

    it('recomputes esqlQuery when a dimension type changes but the name stays the same', () => {
      const hostMetric = nonOverlappingMetrics[0];
      const { rerender } = render(
        <MetricsExperienceStateProvider profileId="test-profile">
          <MetricsGrid
            {...defaultProps}
            discoverFetch$={discoverFetch$}
            metricItems={[hostMetric]}
            dimensions={[{ name: 'host.name', type: 'keyword' }]}
          />
        </MetricsExperienceStateProvider>
      );

      expect(createESQLQuery).toHaveBeenCalledTimes(1);
      (createESQLQuery as jest.Mock).mockClear();

      rerender(
        <MetricsExperienceStateProvider profileId="test-profile">
          <MetricsGrid
            {...defaultProps}
            discoverFetch$={discoverFetch$}
            metricItems={[hostMetric]}
            dimensions={[{ name: 'host.name', type: 'ip' }]}
          />
        </MetricsExperienceStateProvider>
      );

      expect(createESQLQuery).toHaveBeenCalledTimes(1);
    });

    it('re-renders every ChartItem when flyoutState changes, exposing a spurious context subscription', () => {
      renderMetricsGrid();

      expect(Chart).toHaveBeenCalledTimes(metricItems.length);

      // Capture the onViewDetails handler before clearing the mock.
      const onViewDetails = (Chart as jest.Mock).mock.calls[0][0].onViewDetails;
      (Chart as jest.Mock).mockClear();

      // Trigger a flyoutState change. No ChartItem prop changes — metricItems,
      // dimensions, fetchParams, handleViewDetails, and isFocused are all
      // unchanged. React.memo on ChartItem should therefore skip all re-renders.
      //
      // It does not, because ChartItem calls useMetricsExperienceState() to
      // read `profileId`. That gives it a live subscription to the context
      // object, which receives a new reference on every state update. When
      // flyoutState changes, all N ChartItems re-render via the subscription
      // even though `profileId` itself is static.
      act(() => {
        onViewDetails();
      });

      // BUG: Chart is called once per ChartItem (N = metricItems.length) despite
      // no prop change. After the fix (pass profileId as a prop from MetricsGrid
      // instead of reading it inside ChartItem), this count should be 0.
      expect(Chart).toHaveBeenCalledTimes(metricItems.length);
    });
  });
});
