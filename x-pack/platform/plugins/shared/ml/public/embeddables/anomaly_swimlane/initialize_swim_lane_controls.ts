/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StateComparators, TitlesApi } from '@kbn/presentation-publishing';
import { BehaviorSubject, combineLatest, map, merge, skip } from 'rxjs';
import type {
  AnomalySwimLaneEmbeddableState,
  SwimlaneType,
} from '@kbn/ml-server-schemas/embeddables/anomaly_swimlane';
import { SWIMLANE_TYPE } from '@kbn/ml-common-types/embeddables/swimlane_type';
import type { JobId } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import { SWIM_LANE_DEFAULT_PAGE_SIZE } from '../../application/explorer/explorer_constants';
import type { AnomalySwimLaneComponentApi, AnomalySwimLaneControlsState } from './types';

export const swimLaneComparators: StateComparators<AnomalySwimLaneControlsState> = {
  job_ids: 'deepEquality',
  swimlane_type: 'referenceEquality',
  view_by: 'referenceEquality',
  per_page: 'referenceEquality',
  severity_threshold: 'deepEquality',
};

export const initializeSwimLaneControls = (
  initialState: AnomalySwimLaneEmbeddableState,
  titlesApi: TitlesApi
) => {
  const jobIds = new BehaviorSubject<JobId[]>(initialState.job_ids);
  const swimlaneType = new BehaviorSubject<SwimlaneType>(initialState.swimlane_type);
  const viewBy = new BehaviorSubject<string | undefined>(
    initialState.swimlane_type === SWIMLANE_TYPE.VIEW_BY ? initialState.view_by : undefined
  );
  const fromPage = new BehaviorSubject<number>(1);
  const perPage = new BehaviorSubject<number | undefined>(
    initialState.per_page ?? SWIM_LANE_DEFAULT_PAGE_SIZE
  );
  const severityThreshold = new BehaviorSubject<number | undefined>(
    initialState.severity_threshold
  );

  const updateUserInput = (update: AnomalySwimLaneEmbeddableState) => {
    jobIds.next(update.job_ids);
    swimlaneType.next(update.swimlane_type);
    viewBy.next(update.swimlane_type === SWIMLANE_TYPE.VIEW_BY ? update.view_by : undefined);
    severityThreshold.next(update.severity_threshold);
    titlesApi.setTitle(update.title);
  };

  const updateSeverityThreshold = (threshold: number | undefined) => {
    severityThreshold.next(threshold);
  };

  const updatePagination = (update: { perPage?: number; fromPage: number }) => {
    fromPage.next(update.fromPage);
    if (update.perPage) {
      perPage.next(update.perPage);
    }
  };

  const subscription = combineLatest([jobIds, swimlaneType, viewBy]).subscribe(() => {
    updatePagination({ fromPage: 1 });
  });

  const getLatestState = (): AnomalySwimLaneControlsState => {
    return {
      job_ids: jobIds.value,
      swimlane_type: swimlaneType.value,
      view_by: viewBy.value,
      per_page: perPage.value,
      severity_threshold: severityThreshold.value,
    };
  };

  return {
    api: {
      jobIds,
      swimlaneType,
      viewBy,
      fromPage,
      perPage,
      severityThreshold,
      updateUserInput,
      updatePagination,
      updateSeverityThreshold,
    } as unknown as AnomalySwimLaneComponentApi,
    anyStateChange$: merge(
      jobIds.pipe(
        skip(1),
        map(() => undefined)
      ),
      swimlaneType.pipe(
        skip(1),
        map(() => undefined)
      ),
      viewBy.pipe(
        skip(1),
        map(() => undefined)
      ),
      perPage.pipe(
        skip(1),
        map(() => undefined)
      ),
      severityThreshold.pipe(
        skip(1),
        map(() => undefined)
      )
    ),
    getLatestState,
    reinitializeState: (lastSavedState: AnomalySwimLaneEmbeddableState) => {
      jobIds.next(lastSavedState.job_ids);
      swimlaneType.next(lastSavedState.swimlane_type);
      viewBy.next(
        lastSavedState.swimlane_type === SWIMLANE_TYPE.VIEW_BY ? lastSavedState.view_by : undefined
      );
      perPage.next(lastSavedState.per_page);
      severityThreshold.next(lastSavedState.severity_threshold);
    },
    cleanup: () => {
      subscription.unsubscribe();

      jobIds.complete();
      swimlaneType.complete();
      viewBy.complete();
      fromPage.complete();
      perPage.complete();
      severityThreshold.complete();
    },
  };
};
