/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getChangeHistoryErrorCode,
  getChangeHistoryErrorCodeFromBody,
} from './get_change_history_error_code';

describe('getChangeHistoryErrorCode', () => {
  it('reads a top-level code', () => {
    expect(getChangeHistoryErrorCode({ code: 'RESTORE_CONFLICT', message: 'Conflict' })).toBe(
      'RESTORE_CONFLICT'
    );
  });

  it('reads Kibana error attributes.code', () => {
    expect(
      getChangeHistoryErrorCode({
        message: 'Change history is disabled.',
        attributes: { code: 'HISTORY_DISABLED' },
      })
    ).toBe('HISTORY_DISABLED');
  });

  it('returns undefined when no code is present', () => {
    expect(getChangeHistoryErrorCode({ message: 'Something went wrong' })).toBeUndefined();
  });
});

describe('getChangeHistoryErrorCodeFromBody', () => {
  it('returns undefined for non-object bodies', () => {
    expect(getChangeHistoryErrorCodeFromBody(null)).toBeUndefined();
    expect(getChangeHistoryErrorCodeFromBody('error')).toBeUndefined();
  });
});
