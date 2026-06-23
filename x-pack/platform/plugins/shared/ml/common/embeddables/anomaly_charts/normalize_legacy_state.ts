/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AnomalyChartsEmbeddableState,
  SeverityThreshold,
} from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { resolveSeverityFormat } from '../../util/severity_threshold';

// Pre 9.5 stored state used camelCase for these fields; older state may also
// carry selectedEntities/id/query/filters/refreshConfig, which are not part of
// the core embeddable schema.
export interface LegacyAnomalyChartsFields {
  jobIds?: AnomalyChartsEmbeddableState['job_ids'];
  maxSeriesToPlot?: AnomalyChartsEmbeddableState['max_series_to_plot'];
  // Historically we stored severityThreshold as standalone number.
  severityThreshold?: SeverityThreshold[] | number;
  selectedEntities?: unknown;
  id?: unknown;
  query?: unknown;
  filters?: unknown;
  refreshConfig?: unknown;
}

export type RawAnomalyChartsState = Partial<AnomalyChartsEmbeddableState> &
  LegacyAnomalyChartsFields;

export type NormalizedAnomalyChartsFields = Pick<AnomalyChartsEmbeddableState, 'job_ids'> &
  Pick<Partial<AnomalyChartsEmbeddableState>, 'max_series_to_plot' | 'severity_threshold'>;

export const normalizeAnomalyChartsLegacyFields = (
  state: RawAnomalyChartsState
): NormalizedAnomalyChartsFields => {
  const jobIds = state.job_ids ?? state.jobIds;
  const maxSeriesToPlot = state.max_series_to_plot ?? state.maxSeriesToPlot;
  const rawSeverityThreshold = state.severity_threshold ?? state.severityThreshold;
  // Coerce legacy single-number / non-canonical severity into the canonical bucket array
  const severityThreshold =
    rawSeverityThreshold !== undefined ? resolveSeverityFormat(rawSeverityThreshold) : undefined;

  if (!jobIds || jobIds.length === 0) {
    throw new Error('Invalid anomaly charts embeddable state: missing job_ids');
  }

  return {
    job_ids: jobIds,
    ...(maxSeriesToPlot !== undefined ? { max_series_to_plot: maxSeriesToPlot } : {}),
    ...(severityThreshold !== undefined ? { severity_threshold: severityThreshold } : {}),
  };
};
