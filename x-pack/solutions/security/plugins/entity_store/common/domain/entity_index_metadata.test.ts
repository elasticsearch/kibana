/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ENTITY_METADATA, getEntityIndexPattern } from './entity_index';

describe('entity_index dataset constants', () => {
  it('allows getEntityIndexPattern to accept the new "metadata" dataset', () => {
    // If the `Dataset` union is not extended, this call fails TypeScript
    // strict compilation. We assert here that it succeeds at both type
    // and runtime level (the function is pure string concatenation).
    const pattern = getEntityIndexPattern({
      dataset: ENTITY_METADATA,
      schemaVersion: 'v2',
      namespace: 'default',
    });
    expect(pattern).toBe('.entities.v2.metadata.security_default');
  });
});
