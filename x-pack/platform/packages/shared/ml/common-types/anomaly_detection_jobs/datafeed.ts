/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';

export type DatafeedId = string;

export type Datafeed = estypes.MlDatafeed & {
  // remove this when the datafeed types are correct
  project_routing?: string;
};

export type ChunkingConfig = estypes.MlChunkingConfig;

export type Aggregation = Record<string, estypes.AggregationsAggregationContainer>;

export type IndicesOptions = estypes.IndicesOptions;
