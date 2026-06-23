/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FieldStatsTableEmbeddableState } from '@kbn/data-visualizer-server-schemas/embeddables/field_stats';

export enum FieldStatsInitializerViewType {
  DATA_VIEW = 'dataview',
  ESQL = 'esql',
}

// data_view_id is persisted as a saved-object reference, so it is absent from stored state.
// Distributive omit keeps the ES|QL branch's `query` while removing only data_view_id.
type DistributiveOmit<T, K extends PropertyKey> = T extends T ? Omit<T, K> : never;
export type StoredFieldStatisticsTableEmbeddableState = DistributiveOmit<
  FieldStatsTableEmbeddableState,
  'data_view_id'
>;

// Loose editing/UI shape — the editor holds fields independently while toggling modes.
export interface FieldStatsInitialState {
  view_type?: FieldStatsTableEmbeddableState['view_type'];
  data_view_id?: string;
  query?: { esql: string };
  show_distributions?: boolean;
}
