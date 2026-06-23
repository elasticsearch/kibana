/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { transformTimeRangeOut, transformTitlesOut } from '@kbn/presentation-publishing';
import type { AnomalyChartsEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { flow } from 'lodash';
import {
  normalizeAnomalyChartsLegacyFields,
  type RawAnomalyChartsState,
} from './normalize_legacy_state';

export function transformOut(
  storedState: AnomalyChartsEmbeddableState
): AnomalyChartsEmbeddableState {
  const transformsFlow = flow(
    transformTitlesOut<AnomalyChartsEmbeddableState>,
    transformTimeRangeOut<AnomalyChartsEmbeddableState>
  );
  const state = transformsFlow(storedState) as RawAnomalyChartsState;

  const normalized = normalizeAnomalyChartsLegacyFields(state);

  const {
    jobIds: _jobIds,
    maxSeriesToPlot: _maxSeriesToPlot,
    severityThreshold: _severityThreshold,
    selectedEntities: _selectedEntities,
    id: _id,
    query: _query,
    filters: _filters,
    refreshConfig: _refreshConfig,
    ...passthrough
  } = state;

  return {
    ...passthrough,
    ...normalized,
  };
}
