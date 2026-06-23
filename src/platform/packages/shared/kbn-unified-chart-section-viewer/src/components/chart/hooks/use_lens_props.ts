/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  LensConfigBuilder,
  type LensAttributes,
  type LensConfig,
  type LensESQLDataset,
  type LensLegendConfig,
  type LensSeriesLayer,
  type LensYBoundsConfig,
} from '@kbn/lens-embeddable-utils';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EmbeddableComponentProps } from '@kbn/lens-plugin/public';
import useLatest from 'react-use/lib/useLatest';
import { useStableCallback } from '@kbn/react-hooks';
import type { ESQLControlVariable } from '@kbn/esql-types';
import {
  filter,
  Observable,
  distinctUntilChanged,
  from,
  merge,
  shareReplay,
  BehaviorSubject,
  switchMap,
  combineLatest,
  map,
  catchError,
  of,
  tap,
} from 'rxjs';
import type { TimeRange } from '@kbn/data-plugin/common';
import { useEuiTheme } from '@elastic/eui';
import type { UnifiedMetricsGridProps } from '../../../types';
import { useReportChartSectionError } from './use_report_chart_section_error';

export type LensProps = Pick<
  EmbeddableComponentProps,
  | 'id'
  | 'viewMode'
  | 'timeRange'
  | 'attributes'
  | 'esqlVariables'
  | 'noPadding'
  | 'searchSessionId'
  | 'executionContext'
  | 'lastReloadRequestTime'
  | 'userMessages'
  | 'description'
>;

export const useLensProps = ({
  chartId,
  title,
  description,
  query,
  services,
  fetchParams,
  discoverFetch$,
  chartRef,
  chartLayers,
  yBounds,
  legend,
  error,
  userMessages,
  profileId,
}: {
  chartId: string;
  title: string;
  description?: string;
  query: string;
  discoverFetch$: UnifiedMetricsGridProps['fetch$'];
  chartRef?: React.RefObject<HTMLDivElement>;
  chartLayers: LensSeriesLayer[];
  yBounds?: LensYBoundsConfig;
  legend?: LensLegendConfig;
  error?: Error;
  userMessages?: EmbeddableComponentProps['userMessages'];
  profileId: string;
} & Pick<UnifiedMetricsGridProps, 'services' | 'fetchParams'>) => {
  const { euiTheme } = useEuiTheme();
  const reportError = useReportChartSectionError();
  const chartConfigUpdates$ = useRef<BehaviorSubject<void>>(new BehaviorSubject<void>(undefined));

  // Builder errors are folded into `effectiveError` so the same "no datasource" fallback applies.
  const [buildError, setBuildError] = useState<Error | undefined>();
  const effectiveError = error ?? buildError;
  // Read inside the rxjs subscription without rebuilding it on identifier changes.
  const profileIdRef = useLatest(profileId);
  const chartIdRef = useLatest(chartId);
  // Dedup persistent failures by name+message so a fresh Error reference per retry
  // doesn't loop through setBuildError -> effectiveError -> rebuild.
  const lastBuildErrorKeyRef = useRef<string | null>(null);

  useEffect(() => {
    chartConfigUpdates$.current.next(void 0);
  }, [
    query,
    title,
    description,
    chartLayers,
    yBounds,
    legend,
    effectiveError,
    userMessages,
    profileId,
  ]);

  // creates a stable function that builds the Lens attributes
  const buildAttributesFn = useLatest(async () => {
    // keep Lens from building if there are no chart layers and no error
    // force Lens to build with no datasource on error to show the error message
    if (!chartLayers.length && !effectiveError) return null;

    const lensParams = buildLensParams({
      query,
      title,
      description,
      chartLayers,
      yBounds,
      legend,
    });
    const builder = new LensConfigBuilder(services.dataViews);

    const result = (await builder.build(lensParams, {
      query: {
        esql: (lensParams.dataset as LensESQLDataset).esql,
      },
    })) as LensAttributes;

    return result;
  });

  const buildLensProps = useCallback(
    (attributes: LensAttributes) => {
      return getLensProps({
        searchSessionId: fetchParams.searchSessionId,
        timeRange: fetchParams.relativeTimeRange, // same as in the time picker
        esqlVariables: fetchParams.esqlVariables,
        attributes,
        lastReloadRequestTime: fetchParams.lastReloadRequestTime,
        description,
        userMessages,
        profileId,
        chartId,
      });
    },
    [
      fetchParams.searchSessionId,
      fetchParams.relativeTimeRange,
      fetchParams.lastReloadRequestTime,
      fetchParams.esqlVariables,
      description,
      userMessages,
      profileId,
      chartId,
    ]
  );

  const [lensPropsContext, setLensPropsContext] = useState<ReturnType<typeof buildLensProps>>();
  const updateLensPropsContext = useStableCallback((attributes: LensAttributes) =>
    setLensPropsContext(buildLensProps(attributes))
  );

  useEffect(() => {
    const chartRefCurrent = chartRef?.current;
    const configUpdates$ = chartConfigUpdates$.current;

    // progressively load Lens when the chart becomes visible
    const intersecting$ = new Observable<boolean>((subscriber) => {
      const observer = new IntersectionObserver(
        ([entry]) => subscriber.next(entry.isIntersecting),
        { threshold: 0.1, rootMargin: euiTheme.size.base }
      );

      if (chartRefCurrent) {
        observer.observe(chartRefCurrent);
      } else {
        subscriber.next(true);
        subscriber.complete();
      }

      return () => observer.disconnect();
    }).pipe(distinctUntilChanged(), shareReplay(1));

    // load lens props when any trigger emits;
    const triggers$ = merge(
      // dependencies that change the chart configuration
      configUpdates$,
      // discover state update
      discoverFetch$
    ).pipe(
      // any new emission cancels previous load to avoid race conditions.
      switchMap(() =>
        from(buildAttributesFn.current()).pipe(
          // Clear latched buildError and dedup key on successful rebuild.
          tap((attributes) => {
            if (attributes !== null) {
              lastBuildErrorKeyRef.current = null;
              setBuildError(undefined);
            }
          }),
          catchError((buildErr: unknown) => {
            const errorKey =
              buildErr instanceof Error ? `${buildErr.name}:${buildErr.message}` : null;
            if (errorKey !== null && errorKey === lastBuildErrorKeyRef.current) {
              return of(null);
            }
            lastBuildErrorKeyRef.current = errorKey;
            reportError({
              error: buildErr,
              source: 'useLensProps',
              labels: {
                profile_id: profileIdRef.current,
                chart_id: chartIdRef.current,
              },
            });
            if (buildErr instanceof Error) {
              setBuildError(buildErr);
            }
            return of(null);
          })
        )
      ),
      filter((attributes): attributes is LensAttributes => attributes !== null)
    );

    // Update Lens props when new attributes load AND chart is visible
    // OR when chart becomes visible (using latest attributes)
    const subscription = combineLatest([triggers$, intersecting$])
      .pipe(
        filter(([, isIntersecting]) => isIntersecting),
        map(([attributes]) => attributes)
      )
      .subscribe((attributes) => {
        updateLensPropsContext(attributes);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [
    discoverFetch$,
    buildAttributesFn,
    updateLensPropsContext,
    chartRef,
    euiTheme.size.base,
    profileIdRef,
    chartIdRef,
    reportError,
  ]);

  return lensPropsContext;
};

const buildLensParams = ({
  query,
  title,
  description,
  chartLayers,
  yBounds,
  legend,
}: {
  query: string;
  title: string;
  description?: string;
  chartLayers: LensSeriesLayer[];
  yBounds?: LensYBoundsConfig;
  legend?: LensLegendConfig;
}): LensConfig => {
  return {
    chartType: 'xy',
    description,
    dataset: {
      esql: query,
    },
    title,
    legend: legend ?? { show: false },
    axisTitleVisibility: {
      showXAxisTitle: false,
      showYAxisTitle: false,
      showYRightAxisTitle: false,
    },
    layers: chartLayers,
    fittingFunction: 'Linear',
    yBounds,
  };
};

const getLensProps = ({
  searchSessionId,
  timeRange,
  attributes,
  lastReloadRequestTime,
  description,
  esqlVariables,
  userMessages,
  profileId,
  chartId,
}: {
  searchSessionId?: string;
  attributes: LensAttributes;
  esqlVariables: ESQLControlVariable[] | undefined;
  timeRange: TimeRange;
  lastReloadRequestTime?: number;
  description?: string;
  userMessages?: EmbeddableComponentProps['userMessages'];
  profileId: string;
  chartId: string;
}): LensProps => ({
  id: 'metricsExperienceLensComponent',
  viewMode: 'view',
  timeRange,
  attributes,
  noPadding: true,
  description,
  esqlVariables,
  searchSessionId,
  executionContext: {
    description: 'metrics experience chart data',
    meta: {
      profile_id: profileId,
      metric_id: chartId,
      metric_type: attributes.visualizationType,
    },
  },
  lastReloadRequestTime,
  userMessages,
});
