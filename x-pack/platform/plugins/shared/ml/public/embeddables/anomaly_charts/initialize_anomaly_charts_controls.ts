/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject, map, merge, skip } from 'rxjs';
import type { MlEntityField } from '@kbn/ml-anomaly-utils';
import type { StateComparators, TitlesApi } from '@kbn/presentation-publishing';
import type {
  SeverityThreshold,
  AnomalyChartsEmbeddableState,
} from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import type { JobId } from '@kbn/ml-common-types/anomaly_detection_jobs/job';

import { DEFAULT_MAX_SERIES_TO_PLOT } from '../../application/services/anomaly_explorer_charts_service';
import type { AnomalyChartsComponentApi, AnomalyChartsDataLoadingApi } from '../types';
import {
  normalizeAnomalyChartsLegacyFields,
  type RawAnomalyChartsState,
} from '../../../common/embeddables/anomaly_charts/normalize_legacy_state';

type AnomalyChartsControlState = Pick<
  AnomalyChartsEmbeddableState,
  'job_ids' | 'max_series_to_plot' | 'severity_threshold'
>;

export const anomalyChartsComparators: StateComparators<AnomalyChartsControlState> = {
  job_ids: 'deepEquality',
  max_series_to_plot: 'referenceEquality',
  severity_threshold: 'deepEquality',
};

export const initializeAnomalyChartsControls = (
  initialState: AnomalyChartsEmbeddableState,
  titlesApi?: TitlesApi,
  parentApi?: unknown
) => {
  const normalizedInitialState = normalizeAnomalyChartsLegacyFields(
    initialState as RawAnomalyChartsState
  );
  const jobIds$ = new BehaviorSubject<JobId[]>(normalizedInitialState.job_ids);
  const maxSeriesToPlot$ = new BehaviorSubject<number>(
    normalizedInitialState.max_series_to_plot ?? DEFAULT_MAX_SERIES_TO_PLOT
  );

  const severityThreshold$ = new BehaviorSubject<SeverityThreshold[] | undefined>(
    normalizedInitialState.severity_threshold
  );
  const selectedEntities$ = new BehaviorSubject<MlEntityField[] | undefined>(undefined);
  const interval$ = new BehaviorSubject<number | undefined>(undefined);
  const dataLoading$ = new BehaviorSubject<boolean | undefined>(true);
  const blockingError$ = new BehaviorSubject<Error | undefined>(undefined);

  const updateUserInput = (update: AnomalyChartsEmbeddableState) => {
    jobIds$.next(update.job_ids);
    maxSeriesToPlot$.next(update.max_series_to_plot ?? DEFAULT_MAX_SERIES_TO_PLOT);
    if (update.severity_threshold !== undefined) {
      severityThreshold$.next(update.severity_threshold);
    }
    if (titlesApi) {
      titlesApi.setTitle(update.title);
    }
  };

  const updateSeverityThreshold = (v?: SeverityThreshold[]) => severityThreshold$.next(v);
  const updateSelectedEntities = (v?: MlEntityField[]) => selectedEntities$.next(v);
  const setInterval = (v: number) => interval$.next(v);

  const getLatestState = (): AnomalyChartsControlState => {
    return {
      job_ids: jobIds$.value,
      max_series_to_plot: maxSeriesToPlot$.value,
      ...(severityThreshold$.value !== undefined
        ? { severity_threshold: severityThreshold$.value }
        : {}),
    };
  };

  const onRenderComplete = () => dataLoading$.next(false);
  const onLoading = (v: boolean) => dataLoading$.next(v);
  const onError = (error?: Error) => blockingError$.next(error);

  return {
    api: {
      jobIds$,
      maxSeriesToPlot$,
      severityThreshold$,
      selectedEntities$,
      updateUserInput,
      updateSeverityThreshold,
      updateSelectedEntities,
    } as AnomalyChartsComponentApi,
    dataLoadingApi: {
      dataLoading$,
      setInterval,
      onRenderComplete,
      onLoading,
      onError,
    } as AnomalyChartsDataLoadingApi,
    anyStateChange$: merge(
      jobIds$.pipe(
        skip(1),
        map(() => undefined)
      ),
      maxSeriesToPlot$.pipe(
        skip(1),
        map(() => undefined)
      ),
      severityThreshold$.pipe(
        skip(1),
        map(() => undefined)
      )
    ),
    getLatestState,
    reinitializeState: (lastSavedState: AnomalyChartsEmbeddableState) => {
      jobIds$.next(lastSavedState.job_ids);
      maxSeriesToPlot$.next(lastSavedState.max_series_to_plot ?? DEFAULT_MAX_SERIES_TO_PLOT);
      severityThreshold$.next(lastSavedState.severity_threshold);
      selectedEntities$.next(undefined);
    },
    cleanup: () => {
      jobIds$.complete();
      maxSeriesToPlot$.complete();
      severityThreshold$.complete();
      selectedEntities$.complete();
    },
  };
};
