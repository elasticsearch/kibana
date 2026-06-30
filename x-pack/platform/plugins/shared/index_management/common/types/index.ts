/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type * from './aliases';

export type * from './indices';

export type * from './mappings';

export type * from './templates';

export type {
  EnhancedDataStreamFromEs,
  Health,
  DataStream,
  DataStreamIndex,
  DataRetention,
  IndexMode,
} from './data_streams';

export type * from './component_templates';

export type * from './enrich_policies';

export type * from './snapshot_repositories';
