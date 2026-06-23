/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { OccConflictError, isElasticsearchWriteConflict, isOccConflictError } from './errors';

describe('isOccConflictError', () => {
  it('returns true only for OccConflictError instances', () => {
    expect(isOccConflictError(new OccConflictError())).toBe(true);
  });

  it('returns false for duck-typed 409 errors', () => {
    expect(isOccConflictError(Object.assign(new Error('conflict'), { statusCode: 409 }))).toBe(
      false
    );
  });
});

describe('isElasticsearchWriteConflict', () => {
  it('returns true for OccConflictError', () => {
    expect(isElasticsearchWriteConflict(new OccConflictError())).toBe(true);
  });

  it('returns true for duck-typed 409 errors', () => {
    expect(
      isElasticsearchWriteConflict(Object.assign(new Error('conflict'), { statusCode: 409 }))
    ).toBe(true);
    expect(
      isElasticsearchWriteConflict(
        Object.assign(new Error('conflict'), { meta: { statusCode: 409 } })
      )
    ).toBe(true);
  });

  it('returns false for non-conflict errors', () => {
    expect(isElasticsearchWriteConflict(new Error('nope'))).toBe(false);
    expect(isElasticsearchWriteConflict(null)).toBe(false);
  });
});
