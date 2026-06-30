/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchHit } from '@elastic/elasticsearch/lib/api/types';
import type { BaseFeature } from '@kbn/significant-events-schema';

export const createSearchHit = (
  source: Record<string, unknown>
): SearchHit<Record<string, unknown>> => ({
  _index: 'test-index',
  _id: 'doc-1',
  _source: source,
});

export const createKI = (
  feature: Omit<BaseFeature, 'stream_name' | 'properties'>
): BaseFeature => ({
  ...feature,
  stream_name: 'test-stream',
  properties: {},
});

export const createKIs = (count: number): BaseFeature[] =>
  Array.from({ length: count }, (_, index) =>
    createKI({
      id: `entity-${index}`,
      type: 'entity',
      description: `entity ${index}`,
      confidence: 80,
    })
  );
