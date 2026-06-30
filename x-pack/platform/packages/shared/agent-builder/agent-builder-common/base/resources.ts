/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Represents the type of a "searchable" resource in the cluster.
 * Concrete resources are indices, aliases and data streams.
 * `indexPattern` denotes a multi-target or wildcard target resolved via field caps.
 * `dataset` denotes an external ES|QL dataset (registered via `_query/dataset`), only
 * queryable through ES|QL `FROM <name>`.
 */
export enum EsResourceType {
  index = 'index',
  alias = 'alias',
  dataStream = 'data_stream',
  indexPattern = 'index_pattern',
  dataset = 'dataset',
}
