/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StateComparators, TitlesApi } from '@kbn/presentation-publishing';
import { BehaviorSubject, map, merge, skip } from 'rxjs';
import type { JobId } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import type { SingleMetricViewerEmbeddableState } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import type { SingleMetricViewerControlsState } from '../types';

export const singleMetricViewerComparators: StateComparators<SingleMetricViewerControlsState> = {
  job_ids: 'deepEquality',
  forecast_id: 'referenceEquality',
  selected_detector_index: 'referenceEquality',
  selected_entities: 'deepEquality',
  function_description: 'referenceEquality',
};

export const initializeSingleMetricViewerControls = (
  initialState: SingleMetricViewerEmbeddableState,
  titlesApi: TitlesApi
) => {
  const functionDescription = new BehaviorSubject<string | undefined>(
    initialState.function_description
  );
  const jobIds = new BehaviorSubject<JobId[]>(initialState.job_ids);
  const selectedDetectorIndex = new BehaviorSubject<number>(
    initialState.selected_detector_index ?? 0
  );
  const selectedEntities = new BehaviorSubject<Record<string, any> | undefined>(
    initialState.selected_entities
  );
  const forecastId = new BehaviorSubject<string | undefined>(initialState.forecast_id);

  const updateUserInput = (update: SingleMetricViewerEmbeddableState) => {
    jobIds.next(update.job_ids);
    functionDescription.next(update.function_description);
    selectedDetectorIndex.next(update.selected_detector_index);
    selectedEntities.next(update.selected_entities);
    titlesApi.setTitle(update.title);
  };

  const updateForecastId = (id: string | undefined) => {
    forecastId.next(id);
  };

  const getLatestState = (): SingleMetricViewerControlsState => {
    return {
      job_ids: jobIds.getValue(),
      forecast_id: forecastId.getValue(),
      selected_detector_index: selectedDetectorIndex.getValue(),
      selected_entities: selectedEntities.getValue(),
      function_description: functionDescription?.getValue(),
    };
  };

  return {
    api: {
      jobIds,
      forecastId,
      selectedDetectorIndex,
      selectedEntities,
      functionDescription,
      updateForecastId,
      updateUserInput,
    },
    anyStateChange$: merge(
      jobIds.pipe(
        skip(1),
        map(() => undefined)
      ),
      forecastId.pipe(
        skip(1),
        map(() => undefined)
      ),
      selectedDetectorIndex.pipe(
        skip(1),
        map(() => undefined)
      ),
      selectedEntities.pipe(
        skip(1),
        map(() => undefined)
      ),
      functionDescription.pipe(
        skip(1),
        map(() => undefined)
      )
    ),
    getLatestState,
    reinitializeState: (lastSavedState: SingleMetricViewerEmbeddableState) => {
      jobIds.next(lastSavedState.job_ids);
      forecastId.next(lastSavedState.forecast_id);
      selectedDetectorIndex.next(lastSavedState.selected_detector_index ?? 0);
      selectedEntities.next(lastSavedState.selected_entities);
      functionDescription.next(lastSavedState.function_description);
    },
    cleanup: () => {
      forecastId.complete();
      jobIds.complete();
      selectedDetectorIndex.complete();
      selectedEntities.complete();
      functionDescription.complete();
    },
  };
};
