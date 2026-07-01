/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TimeRangeBounds } from '@kbn/ml-time-buckets';
import type { Duration, Moment } from 'moment';
import { lastValueFrom } from 'rxjs';

import type { CriteriaField } from '@kbn/ml-common-types/results';

import type { CombinedJob } from '@kbn/ml-common-types/anomaly_detection_jobs/combined_job';
import type { Datafeed } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import {
  isModelPlotEnabled,
  isModelPlotChartableForDetector,
  isSourceDataChartableForDetector,
  mlFunctionToESAggregation,
} from '../../../../common/util/job_utils';
import { isMetricDetector } from '../get_function_description';
import { CHARTS_POINT_TARGET } from '../timeseriesexplorer_constants';
import type { TimeSeriesExplorerZoomState } from './resolve_context_finish_focus_range';
import { resolveContextFinishFocusRange } from './resolve_context_finish_focus_range';

/*
 * Loads context (wide bounds) data for Single Metric Viewer: metric series, swimlane scores,
 * chart metadata, optional forecast. Returns a statePatch for React hosts and an optional
 * zoomSelection so the host can drive the focus chart / URL brush via resolveContextFinishFocusRange.
 *
 * Fail-fast: any parallel request rejection cancels the whole load (no partial UI). Rejection
 * indices must stay aligned with `errorLabels` in executeLoadSingleMetricContextData.
 */

/**
 * Forecast aggregation override for context / focus loads when model plot is off
 * and the detector uses sum or count (matches SMV + embeddable behavior).
 */
export function getForecastAggTypeForContextLoad(
  modelPlotEnabled: boolean,
  detector: { function: string }
): { avg: string; max: string; min: string } | undefined {
  const esAgg = mlFunctionToESAggregation(detector.function);
  if (modelPlotEnabled === false && (esAgg === 'sum' || esAgg === 'count')) {
    return { avg: 'sum', max: 'sum', min: 'sum' };
  }
  return undefined;
}

/**
 * If `signal` aborts before `task()` settles, resolves `null` immediately so hosts can ignore stale work.
 * In-flight Elasticsearch requests are not cancelled unless lower layers pass `signal` into HTTP clients.
 */
async function runUnlessAborted<T>(
  signal: AbortSignal | undefined,
  task: () => Promise<T | null>
): Promise<T | null> {
  if (!signal) {
    return safeRunTask(task);
  }
  if (signal.aborted) {
    return null;
  }
  const onAbort = new Promise<null>((resolve) => {
    signal.addEventListener('abort', () => resolve(null), { once: true });
  });
  return Promise.race([safeRunTask(task), onAbort]);
}

async function safeRunTask<T>(task: () => Promise<T | null>): Promise<T | null> {
  try {
    return await task();
  } catch (e) {
    // Fetch layers that honor fetch() abort may reject with AbortError; treat as cancelled load.
    if (e instanceof DOMException && e.name === 'AbortError') {
      return null;
    }
    throw e;
  }
}

export interface LoadSingleMetricContextDataEntityControl {
  fieldValue: string | null;
  fieldName: string;
}

/**
 * Shape of the chart-details result returned by `mlTimeSeriesSearchService.getChartDetails`.
 * Mirrors `TimeSeriesExplorerChartDetails.results` in `time_series_search_service.ts` (not exported).
 */
export interface SmvChartDetails {
  functionLabel: string | null;
  entityData: {
    count?: number;
    entities: Array<{ fieldName: string; cardinality?: number }>;
  };
}

export interface LoadSingleMetricContextDataDeps {
  mlTimeSeriesSearchService: {
    getMetricData: (
      job: CombinedJob,
      detectorIndex: number,
      entities: LoadSingleMetricContextDataEntityControl[],
      earliestMs: number,
      latestMs: number,
      intervalMs: number,
      /** `aggregationTypeTransform.toES(functionDescription)` for metric detectors. */
      functionToPlotByIfMetric: string | undefined
    ) => import('rxjs').Observable<{ results: Record<string, unknown> }>;
    getChartDetails: (
      job: CombinedJob,
      datafeed: Datafeed,
      detectorIndex: number,
      entityFields: LoadSingleMetricContextDataEntityControl[],
      earliestMs: number,
      latestMs: number,
      metricFunctionDescription?: string
    ) => Promise<{ success: boolean; results: SmvChartDetails }>;
  };
  mlResultsService: {
    getRecordMaxScoreByTime: (
      jobId: string,
      criteriaFields: CriteriaField[],
      earliestMs: number,
      latestMs: number,
      intervalMs: number,
      /** `aggregationTypeTransform.toES(functionDescription)` for metric detectors. */
      functionToPlotByIfMetric: string | undefined
    ) => Promise<{ results: Record<string, unknown> }>;
  };
  mlForecastService: {
    getForecastData: (
      job: CombinedJob,
      detectorIndex: number,
      forecastId: string,
      entities: LoadSingleMetricContextDataEntityControl[],
      earliestMs: number,
      latestMs: number,
      intervalMs: number,
      aggType: ReturnType<typeof getForecastAggTypeForContextLoad>
    ) => import('rxjs').Observable<{ results: Record<string, unknown> }>;
  };
  mlTimeSeriesExplorer: {
    calculateAggregationInterval: (
      bounds: TimeRangeBounds,
      target: number,
      job: CombinedJob
    ) => Duration;
    processMetricPlotResults: (
      results: Record<string, unknown>,
      modelPlotEnabled: boolean
    ) => unknown[];
    processRecordScoreResults: (results: Record<string, unknown>) => unknown[];
    processForecastResults: (results: Record<string, unknown>) => unknown[];
    calculateInitialFocusRange: (
      zoom: TimeSeriesExplorerZoomState | undefined,
      contextAggregationInterval: Duration,
      bounds: TimeRangeBounds
    ) => [Date, Date] | undefined;
    calculateDefaultFocusRange: (
      autoZoomDuration: number,
      contextAggregationInterval: Duration,
      contextChartData: unknown[],
      contextForecastData: unknown[] | undefined
    ) => [Date, Date] | undefined;
  };
  getBoundsRoundedToInterval: (
    bounds: TimeRangeBounds,
    interval: Duration,
    inclusiveEnd?: boolean
  ) => { min: Moment; max: Moment };
}

export interface LoadSingleMetricContextDataParams {
  signal?: AbortSignal;
  bounds: TimeRangeBounds;
  selectedJob: CombinedJob;
  detectorIndex: number;
  entityControls: LoadSingleMetricContextDataEntityControl[];
  modelPlotEnabled: boolean;
  selectedForecastId: string | undefined;
  /** Result of `aggregationTypeTransform.toES(functionDescription)` when metric job. */
  functionToPlotByIfMetric: string | undefined;
  /** Raw function description from app state (metric jobs). */
  functionDescription: string | undefined;
  zoom: TimeSeriesExplorerZoomState | undefined;
  previousSelectedForecastId: string | undefined;
  autoZoomDuration: number;
  arePartitioningFieldsProvided: boolean;
  criteriaFields: CriteriaField[];
  displayError: (error: unknown, message: string) => void;
  errorMessages: {
    metric: string;
    swimlane: string;
    entityCounts: string;
    forecast: string;
  };
  deps: LoadSingleMetricContextDataDeps;
}

export interface LoadSingleMetricContextDataSuccess {
  statePatch: Record<string, unknown>;
  zoomSelection?: { from: Date; to: Date };
  shouldUpdatePreviousSelectedForecastId: boolean;
}

/**
 * Parallel context-chart queries for SMV (page + embeddable). React callers own `setState`
 * and `contextChartSelected`; this module only performs I/O + pure merge math.
 *
 * Pass `signal` from a per-load `AbortController`: when aborted, this function resolves **`null`**
 * as soon as the abort wins the race (still combine with `loadCounter` checks in React). Underlying
 * HTTP may complete in the background until services accept `AbortSignal`.
 */
export async function loadSingleMetricContextData(
  params: LoadSingleMetricContextDataParams
): Promise<LoadSingleMetricContextDataSuccess | null> {
  const { signal } = params;
  return runUnlessAborted(signal, () => executeLoadSingleMetricContextData(params));
}

async function executeLoadSingleMetricContextData(
  params: LoadSingleMetricContextDataParams
): Promise<LoadSingleMetricContextDataSuccess | null> {
  const { signal, deps, displayError, errorMessages } = params;
  const {
    bounds,
    selectedJob,
    detectorIndex,
    entityControls,
    modelPlotEnabled,
    selectedForecastId,
    functionToPlotByIfMetric,
    functionDescription,
    zoom,
    previousSelectedForecastId,
    autoZoomDuration,
    arePartitioningFieldsProvided,
    criteriaFields,
  } = params;

  // Host should not call the loader until metric function is chosen; silent no-op matches legacy SMV.
  if (isMetricDetector(selectedJob, detectorIndex) && functionDescription === undefined) {
    return null;
  }

  const nonBlankEntities = entityControls.filter((entity) => entity.fieldValue !== null);

  if (
    modelPlotEnabled === false &&
    isSourceDataChartableForDetector(selectedJob, detectorIndex) === false &&
    nonBlankEntities.length > 0
  ) {
    // Partitioning on a low-cardinality metric without model plot / chartable source cannot be plotted reliably.
    return {
      statePatch: {
        hasResults: false,
        loading: false,
        dataNotChartable: true,
      },
      shouldUpdatePreviousSelectedForecastId: false,
    };
  }

  // Bucket width for the full bounds window (context chart), then align query edges to whole buckets.
  const contextAggregationInterval = deps.mlTimeSeriesExplorer.calculateAggregationInterval(
    bounds,
    CHARTS_POINT_TARGET,
    selectedJob
  );

  const searchBounds = deps.getBoundsRoundedToInterval(bounds, contextAggregationInterval, false);
  if (signal?.aborted) {
    return null;
  }

  const intervalMs = contextAggregationInterval.asMilliseconds();
  const earliestMs = searchBounds.min.valueOf();
  const latestMs = searchBounds.max.valueOf();

  // Four parallel requests — order MUST match `errorLabels` after `allSettled` (rejection index → toast).
  const metricPromise = lastValueFrom(
    deps.mlTimeSeriesSearchService.getMetricData(
      selectedJob,
      detectorIndex,
      nonBlankEntities,
      earliestMs,
      latestMs,
      intervalMs,
      functionToPlotByIfMetric
    )
  );

  const swimlanePromise = deps.mlResultsService.getRecordMaxScoreByTime(
    selectedJob.job_id,
    criteriaFields,
    earliestMs,
    latestMs,
    intervalMs,
    functionToPlotByIfMetric
  );

  const chartDetailsPromise = deps.mlTimeSeriesSearchService.getChartDetails(
    selectedJob,
    selectedJob.datafeed_config,
    detectorIndex,
    entityControls,
    earliestMs,
    latestMs,
    functionDescription
  );

  const forecastPromise =
    selectedForecastId !== undefined
      ? lastValueFrom(
          deps.mlForecastService.getForecastData(
            selectedJob,
            detectorIndex,
            selectedForecastId,
            nonBlankEntities,
            earliestMs,
            latestMs,
            intervalMs,
            // If `detectorIndex` is out of range, `detectors[detectorIndex]` is undefined and this throws.
            getForecastAggTypeForContextLoad(modelPlotEnabled, {
              function: selectedJob.analysis_config.detectors[detectorIndex].function ?? '',
            })
          )
        )
      : Promise.resolve(null);

  const settled = await Promise.allSettled([
    metricPromise,
    swimlanePromise,
    chartDetailsPromise,
    forecastPromise,
  ]);

  if (signal?.aborted) {
    return null;
  }

  const errorLabels = ['metric', 'swimlane', 'details', 'forecast'] as const;
  const errorMessageByLabel: Record<(typeof errorLabels)[number], string> = {
    metric: errorMessages.metric,
    swimlane: errorMessages.swimlane,
    // Third slot is chart-details / entity-counts query; host-facing key is `entityCounts` in params.
    details: errorMessages.entityCounts,
    forecast: errorMessages.forecast,
  };

  let hadRejection = false;
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'rejected') {
      const reason = r.reason;
      // Fetch layers that honor AbortSignal may reject with DOMException 'AbortError'.
      // Treat the same as a signal abort: bail silently without showing a toast.
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        return null;
      }
      if (signal?.aborted) {
        return null;
      }
      displayError(reason, errorMessageByLabel[errorLabels[i]]);
      hadRejection = true;
    }
  }
  if (hadRejection) {
    return null;
  }

  const metricResp = settled[0].status === 'fulfilled' ? settled[0].value : undefined;
  const swimResp = settled[1].status === 'fulfilled' ? settled[1].value : undefined;
  const detailsResp = settled[2].status === 'fulfilled' ? settled[2].value : undefined;
  const forecastRaw = settled[3].status === 'fulfilled' ? settled[3].value : undefined;

  // Defensive: all entries should be fulfilled after the rejection loop above.
  if (!metricResp || !swimResp || !detailsResp) {
    return null;
  }

  const contextChartData = deps.mlTimeSeriesExplorer.processMetricPlotResults(
    metricResp.results,
    modelPlotEnabled
  );
  const swimlaneData = deps.mlTimeSeriesExplorer.processRecordScoreResults(swimResp.results);
  const chartDetails = detailsResp.results;
  const contextForecastData =
    selectedForecastId !== undefined && forecastRaw != null
      ? deps.mlTimeSeriesExplorer.processForecastResults(forecastRaw.results)
      : undefined;

  const hasResults =
    (Array.isArray(contextChartData) && contextChartData.length > 0) ||
    (Array.isArray(contextForecastData) && contextForecastData.length > 0);

  const statePatch: Record<string, unknown> = {
    contextAggregationInterval,
    contextChartData,
    swimlaneData,
    chartDetails,
    contextForecastData,
    hasResults,
    loading: false,
  };

  // No default focus / brush until there is context series data and partition dropdowns are satisfied.
  if (!contextChartData.length || !arePartitioningFieldsProvided) {
    return {
      statePatch,
      shouldUpdatePreviousSelectedForecastId: false,
    };
  }

  // Derive focus range from URL zoom vs defaults; host applies `zoomSelection` via `contextChartSelected`.
  const { focusRange, shouldUpdatePreviousSelectedForecastId } = resolveContextFinishFocusRange({
    zoom,
    contextAggregationInterval,
    bounds,
    selectedForecastId,
    previousSelectedForecastId,
    autoZoomDuration,
    contextChartData,
    contextForecastData,
    calculateInitialFocusRange: deps.mlTimeSeriesExplorer.calculateInitialFocusRange,
    calculateDefaultFocusRange: deps.mlTimeSeriesExplorer.calculateDefaultFocusRange,
  });

  const zoomSelection =
    focusRange !== undefined ? { from: focusRange[0], to: focusRange[1] } : undefined;

  return {
    statePatch,
    zoomSelection,
    shouldUpdatePreviousSelectedForecastId,
  };
}

/**
 * Shared model-plot flag used when resetting chart state on full refresh.
 */
export function getModelPlotEnabledForDetector(
  selectedJob: CombinedJob,
  detectorIndex: number,
  entityControls: LoadSingleMetricContextDataEntityControl[]
): boolean {
  return (
    isModelPlotChartableForDetector(selectedJob, detectorIndex) &&
    isModelPlotEnabled(selectedJob, detectorIndex, entityControls as never)
  );
}
