/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { transformTimeRangeOut, transformTitlesOut } from '@kbn/presentation-publishing';
import type { SingleMetricViewerEmbeddableState } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import { flow } from 'lodash';
import {
  normalizeSingleMetricViewerLegacyFields,
  type RawSingleMetricViewerState,
} from './normalize_legacy_state';

export function transformOut(
  storedState: SingleMetricViewerEmbeddableState
): SingleMetricViewerEmbeddableState {
  const transformsFlow = flow(
    transformTitlesOut<SingleMetricViewerEmbeddableState>,
    transformTimeRangeOut<SingleMetricViewerEmbeddableState>
  );
  const state = transformsFlow(storedState) as RawSingleMetricViewerState;

  const normalized = normalizeSingleMetricViewerLegacyFields(state);

  const {
    jobIds: _jobIds,
    selectedDetectorIndex: _selectedDetectorIndex,
    selectedEntities: _selectedEntities,
    functionDescription: _functionDescription,
    forecastId: _forecastId,
    id: _id,
    query: _query,
    filters: _filters,
    refreshConfig: _refreshConfig,
    panelTitle: _panelTitle,
    ...passthrough
  } = state;

  return {
    ...passthrough,
    ...normalized,
  };
}
