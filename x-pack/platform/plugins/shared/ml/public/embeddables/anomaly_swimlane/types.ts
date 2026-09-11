/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import type {
  HasEditCapabilities,
  PublishesDataViews,
  PublishesUnifiedSearch,
  PublishesWritableTitle,
  PublishingSubject,
} from '@kbn/presentation-publishing';
import { apiIsOfType } from '@kbn/presentation-publishing';

import type {
  AnomalySwimLaneEmbeddableState,
  SwimlaneType,
} from '@kbn/ml-server-schemas/embeddables/anomaly_swimlane';
import { ANOMALY_SWIMLANE_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_swimlane';
import type { JobId } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import type { AppStateSelectedCells } from '../../application/explorer/explorer_utils';
import type { MlEmbeddableBaseApi } from '../types';

export type AnomalySwimLaneControlsState = Pick<
  AnomalySwimLaneEmbeddableState,
  'job_ids' | 'swimlane_type' | 'per_page' | 'severity_threshold'
> & { view_by?: string };

export interface AnomalySwimLaneComponentApi {
  jobIds: PublishingSubject<JobId[]>;
  swimlaneType: PublishingSubject<SwimlaneType>;
  viewBy: PublishingSubject<string | undefined>;
  perPage: PublishingSubject<number | undefined>;
  fromPage: PublishingSubject<number>;
  interval: PublishingSubject<number | undefined>;
  severityThreshold: PublishingSubject<number | undefined>;
  setInterval: (interval: number | undefined) => void;
  updateUserInput: (input: AnomalySwimLaneEmbeddableState) => void;
  updatePagination: (update: { perPage?: number; fromPage: number }) => void;
  updateSeverityThreshold: (threshold: number | undefined) => void;
}

export type AnomalySwimLaneEmbeddableApi = MlEmbeddableBaseApi<AnomalySwimLaneEmbeddableState> &
  PublishesDataViews &
  PublishesUnifiedSearch &
  PublishesWritableTitle &
  HasEditCapabilities &
  AnomalySwimLaneComponentApi;

export interface AnomalySwimLaneActionContext {
  embeddable: AnomalySwimLaneEmbeddableApi;
  data?: AppStateSelectedCells;
}

export function isSwimLaneEmbeddableContext(arg: unknown): arg is AnomalySwimLaneActionContext {
  return (
    isPopulatedObject(arg, ['embeddable']) &&
    apiIsOfType(arg.embeddable, ANOMALY_SWIMLANE_EMBEDDABLE_TYPE)
  );
}
