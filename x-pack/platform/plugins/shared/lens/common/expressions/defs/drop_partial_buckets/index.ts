/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type dropPartialBucketsTextBasedFn } from '../../impl/drop_partial_buckets/drop_partial_buckets_fn_textbased';
import type { DropPartialBucketsTextBasedExpressionFunction } from './types';

export const getDropPartialBucketsTextBased = (
  ...dropPartialBucketsFnParameters: Parameters<typeof dropPartialBucketsTextBasedFn>
): DropPartialBucketsTextBasedExpressionFunction => ({
  name: 'lens_drop_partial_buckets_textbased',
  type: 'datatable',
  help: '',
  args: {},
  inputTypes: ['datatable'],
  async fn(...args) {
    /** Build optimization: prevent adding extra code into initial bundle **/
    const { dropPartialBucketsTextBasedFn } = await import('../../impl/async_fns');
    return dropPartialBucketsTextBasedFn(...dropPartialBucketsFnParameters)(...args);
  },
});
