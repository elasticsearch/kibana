/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { aggregationTypeTransform } from '@kbn/ml-anomaly-utils';
import type { SingleMetricViewerEmbeddableState } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';

// Pre 9.5 stored state used camelCase for these fields; older state may also carry
// id/query/filters/refreshConfig/panelTitle — the factory's serializeState never wrote
// them, but they were exposed in the previous schema and may exist in cases attachments
// or migrated dashboards.
export interface LegacySingleMetricViewerFields {
  jobIds?: SingleMetricViewerEmbeddableState['job_ids'];
  selectedDetectorIndex?: number;
  selectedEntities?: SingleMetricViewerEmbeddableState['selected_entities'];
  functionDescription?: SingleMetricViewerEmbeddableState['function_description'];
  forecastId?: SingleMetricViewerEmbeddableState['forecast_id'];
  id?: unknown;
  query?: unknown;
  filters?: unknown;
  refreshConfig?: unknown;
  panelTitle?: unknown;
}

export type RawSingleMetricViewerState = Partial<SingleMetricViewerEmbeddableState> &
  LegacySingleMetricViewerFields;

export interface NormalizedSingleMetricViewerFields {
  job_ids: string[];
  selected_detector_index: number;
  selected_entities?: SingleMetricViewerEmbeddableState['selected_entities'];
  function_description?: string;
  forecast_id?: string;
}

export const normalizeSingleMetricViewerLegacyFields = (
  state: RawSingleMetricViewerState
): NormalizedSingleMetricViewerFields => {
  const jobIds = state.job_ids ?? state.jobIds;
  const selectedDetectorIndex = state.selected_detector_index ?? state.selectedDetectorIndex ?? 0;
  const selectedEntities = state.selected_entities ?? state.selectedEntities;
  const forecastId = state.forecast_id ?? state.forecastId;

  // Some older panels saved `avg` here instead of `mean` (an old bug in how the default got
  // picked). toML maps it back to `mean`.
  const rawFunctionDescription = state.function_description ?? state.functionDescription;
  const functionDescription =
    rawFunctionDescription !== undefined
      ? aggregationTypeTransform.toML(rawFunctionDescription)
      : undefined;

  if (!jobIds || jobIds.length === 0) {
    throw new Error('Invalid single metric viewer embeddable state: missing job_ids');
  }

  return {
    job_ids: jobIds,
    selected_detector_index: selectedDetectorIndex,
    ...(selectedEntities !== undefined ? { selected_entities: selectedEntities } : {}),
    ...(functionDescription !== undefined ? { function_description: functionDescription } : {}),
    ...(forecastId !== undefined ? { forecast_id: forecastId } : {}),
  };
};
