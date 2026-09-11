/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const PLUGIN_ID = 'apmDataAccess';
export const PLUGIN_NAME = 'apmDataAccess';

export type { ApmDataSource, ApmDataSourceWithSummary } from '@kbn/apm-types';
export {
  ApmDocumentType,
  type ApmServiceTransactionDocumentType,
  type ApmTransactionDocumentType,
} from './document_type';

export type { TimeRangeMetadata } from './time_range_metadata';

export { getPreferredBucketSizeAndDataSource } from './utils/get_preferred_bucket_size_and_data_source';
export { getBucketSize } from './utils/get_bucket_size';

export { RollupInterval } from './rollup';
