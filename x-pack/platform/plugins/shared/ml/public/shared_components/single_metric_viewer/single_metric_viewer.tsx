/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import moment from 'moment';
import useMountedState from 'react-use/lib/useMountedState';
import type { FC } from 'react';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiResizeObserver } from '@elastic/eui';
import type { CoreStart } from '@kbn/core-lifecycle-browser';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { UI_SETTINGS } from '@kbn/data-plugin/common';
import type { MlJob, MlJobStats } from '@elastic/elasticsearch/lib/api/types';
import { DatePickerContextProvider, type DatePickerDependencies } from '@kbn/ml-date-picker';
import type { TimeRangeBounds } from '@kbn/ml-time-buckets';
import usePrevious from 'react-use/lib/usePrevious';
import { extractErrorProperties } from '@kbn/ml-error-utils';
import { tz } from 'moment';
import { pick, throttle } from 'lodash';
import type { MlDependencies } from '../../application/app';
import { TimeSeriesExplorerEmbeddableChart } from '../../application/timeseriesexplorer/timeseriesexplorer_embeddable_chart';
import { APP_STATE_ACTION } from '../../application/timeseriesexplorer/timeseriesexplorer_constants';
import type {
  SingleMetricViewerServices,
  MlEntity,
  SingleMetricViewerEmbeddableApi,
} from '../../embeddables/types';
import {
  useTimeseriesExplorerStyles,
  useAnnotationStyles,
} from '../../application/timeseriesexplorer/styles';
import { useDefaultSeverity } from '../../application/components/controls/select_severity/select_severity';

const containerPadding = 20;
const minElemAndChartDiff = 20;
const RESIZE_THROTTLE_TIME_MS = 500;
interface AppStateZoom {
  from?: string;
  to?: string;
}

const basicErrorMessage = i18n.translate('xpack.ml.singleMetricViewerEmbeddable.errorMessage"', {
  defaultMessage: 'Unable to load the ML single metric viewer data',
});

const jobNotFoundErrorMessage = i18n.translate(
  'xpack.ml.singleMetricViewerEmbeddable.jobNotFoundErrorMessage"',
  {
    defaultMessage: 'No known job with the selected id',
  }
);

export type SingleMetricViewerSharedComponent = FC<SingleMetricViewerProps>;

/**
 * Only used to initialize internally
 */
export type SingleMetricViewerPropsWithDeps = SingleMetricViewerProps & {
  api?: SingleMetricViewerEmbeddableApi;
  coreStart: CoreStart;
  pluginStart: MlDependencies;
  mlServices: SingleMetricViewerServices;
};

export interface SingleMetricViewerProps {
  shouldShowForecastButton?: boolean;
  bounds?: TimeRangeBounds;
  forecastId?: string;
  selectedEntities?: MlEntity;
  selectedDetectorIndex?: number;
  functionDescription?: string;
  selectedJobId: string | undefined;
  /**
   * Last reload request time, can be used for manual reload
   */
  lastRefresh?: number;
  onRenderComplete?: () => void;
  onError?: (error?: Error) => void;
  onForecastIdChange?: (forecastId: string | undefined) => void;
  uuid: string;
}

type Zoom = AppStateZoom | undefined;
type ForecastId = string | undefined;

const SingleMetricViewerWrapper: FC<SingleMetricViewerPropsWithDeps> = ({
  // Component dependencies
  api,
  coreStart,
  pluginStart,
  mlServices,
  // Component props
  bounds,
  functionDescription,
  lastRefresh,
  onError,
  onForecastIdChange,
  onRenderComplete,
  forecastId,
  selectedDetectorIndex,
  selectedEntities,
  selectedJobId,
  shouldShowForecastButton,
  uuid,
}) => {
  const timeseriesExplorerStyles = useTimeseriesExplorerStyles();
  const annotationStyles = useAnnotationStyles();
  const { val: defaultSeverity } = useDefaultSeverity();
  const [chartDimensions, setChartDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [zoom, setZoom] = useState<Zoom>();
  const [selectedForecastId, setSelectedForecastId] = useState<ForecastId>(forecastId);
  const [selectedJobWrapper, setSelectedJobWrapper] = useState<
    { job: MlJob; stats: MlJobStats } | undefined
  >();
  const [errorEncountered, setErrorEncountered] = useState<number | undefined>();

  const isMounted = useMountedState();
  const { mlApi, mlTimeSeriesExplorerService, toastNotificationService } = mlServices;
  const startServices = pick(coreStart, 'analytics', 'i18n', 'theme', 'userProfile');
  const datePickerDeps: DatePickerDependencies = {
    ...pick(coreStart, ['http', 'notifications', 'theme', 'uiSettings', 'userProfile', 'i18n']),
    data: pluginStart.data,
    uiSettingsKeys: UI_SETTINGS,
    showFrozenDataTierChoice: false,
  };

  const previousRefresh = usePrevious(lastRefresh ?? 0);

  useEffect(
    function resetErrorOnJobChange() {
      // Calling onError to clear any previous error
      setErrorEncountered(undefined);
      onError?.();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedJobId]
  );

  useEffect(
    function setUpSelectedJob() {
      async function fetchSelectedJob() {
        if (mlApi && selectedJobId !== undefined) {
          try {
            const [{ jobs }, { jobs: jobStats }] = await Promise.all([
              mlApi.getJobs({ jobId: selectedJobId }),
              mlApi.getJobStats({ jobId: selectedJobId }),
            ]);
            setSelectedJobWrapper({ job: jobs[0], stats: jobStats[0] });
          } catch (e) {
            const error = extractErrorProperties(e);
            // Could get 404 because job has been deleted and also avoid infinite refetches on any error
            setErrorEncountered(error.statusCode);
            if (onError) {
              onError(
                new Error(errorEncountered === 404 ? jobNotFoundErrorMessage : basicErrorMessage)
              );
            }
          }
        }
      }
      if (isMounted() === false || errorEncountered !== undefined) {
        return;
      }
      fetchSelectedJob();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedJobId, isMounted, errorEncountered]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resizeHandler = useCallback(
    throttle((e: { width: number; height: number }) => {
      if (
        Math.abs(chartDimensions.width - e.width) > minElemAndChartDiff ||
        Math.abs(chartDimensions.height - e.height) > minElemAndChartDiff
      ) {
        setChartDimensions(e);
      }
    }, RESIZE_THROTTLE_TIME_MS),
    [chartDimensions.width, chartDimensions.height]
  );

  const autoZoomDuration = useMemo(() => {
    if (!selectedJobWrapper) return;
    return mlTimeSeriesExplorerService?.getAutoZoomDuration(
      selectedJobWrapper.job.analysis_config?.bucket_span
    );
  }, [mlTimeSeriesExplorerService, selectedJobWrapper]);

  const appStateHandler = useCallback(
    (action: string, payload?: Zoom | ForecastId) => {
      /**
       * Empty zoom indicates that chart hasn't been rendered yet,
       * hence any updates prior that should replace the URL state.
       */
      switch (action) {
        case APP_STATE_ACTION.SET_FORECAST_ID:
          if (onForecastIdChange) {
            onForecastIdChange(payload as ForecastId);
          }
          setSelectedForecastId(payload as ForecastId);
          setZoom(undefined);
          break;

        case APP_STATE_ACTION.SET_ZOOM:
          setZoom(payload as Zoom);
          break;

        case APP_STATE_ACTION.UNSET_ZOOM:
          setZoom(undefined);
          break;
      }
    },

    [setZoom, setSelectedForecastId, onForecastIdChange]
  );

  const onForecastComplete = (forecastEndTimestamp?: number) => {
    const { timefilter } = pluginStart.data.query.timefilter;
    const currentBounds = timefilter.getActiveBounds();

    if (
      forecastEndTimestamp &&
      currentBounds?.max &&
      currentBounds?.min &&
      currentBounds.max.unix() * 1000 < forecastEndTimestamp
    ) {
      const to = moment(forecastEndTimestamp);
      timefilter.setTime({
        from: currentBounds.min,
        to,
        mode: 'absolute',
      });
    }
  };

  return (
    <EuiResizeObserver onResize={resizeHandler}>
      {(resizeRef) => (
        <div
          id={`mlSingleMetricViewerEmbeddableWrapper-${uuid}`}
          style={{
            width: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '8px',
          }}
          data-test-subj={`mlSingleMetricViewer_${uuid}`}
          ref={resizeRef}
          css={[timeseriesExplorerStyles, annotationStyles]}
          data-shared-item="" // TODO: Remove data-shared-item as part of https://github.com/elastic/kibana/issues/179376
          data-rendering-count={1}
        >
          <KibanaRenderContextProvider {...startServices}>
            <KibanaContextProvider
              services={{
                mlServices: {
                  ...mlServices,
                },
                ...coreStart,
                ...pluginStart,
              }}
            >
              <DatePickerContextProvider {...datePickerDeps}>
                {selectedJobId !== undefined &&
                  autoZoomDuration !== undefined &&
                  selectedJobId === selectedJobWrapper?.job.job_id && (
                    <TimeSeriesExplorerEmbeddableChart
                      api={api}
                      chartWidth={chartDimensions.width - containerPadding}
                      chartHeight={chartDimensions.height - containerPadding}
                      dataViewsService={pluginStart.data.dataViews}
                      toastNotificationService={toastNotificationService}
                      appStateHandler={appStateHandler}
                      autoZoomDuration={autoZoomDuration}
                      bounds={bounds}
                      dateFormatTz={tz.guess()}
                      lastRefresh={lastRefresh ?? 0}
                      previousRefresh={previousRefresh}
                      selectedJobId={selectedJobId}
                      selectedDetectorIndex={selectedDetectorIndex}
                      selectedEntities={selectedEntities}
                      selectedForecastId={selectedForecastId}
                      tableInterval="auto"
                      tableSeverity={defaultSeverity}
                      zoom={zoom}
                      functionDescription={functionDescription}
                      selectedJob={selectedJobWrapper.job}
                      selectedJobStats={selectedJobWrapper.stats}
                      onRenderComplete={onRenderComplete}
                      onForecastComplete={onForecastComplete}
                      shouldShowForecastButton={shouldShowForecastButton}
                    />
                  )}
              </DatePickerContextProvider>
            </KibanaContextProvider>
          </KibanaRenderContextProvider>
        </div>
      )}
    </EuiResizeObserver>
  );
};

// eslint-disable-next-line import/no-default-export
export default SingleMetricViewerWrapper;
