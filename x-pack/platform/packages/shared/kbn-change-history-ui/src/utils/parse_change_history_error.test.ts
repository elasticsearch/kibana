/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parseChangeHistoryError } from './parse_change_history_error';

describe('parseChangeHistoryError', () => {
  it('parses structured change history errors', () => {
    expect(
      parseChangeHistoryError({
        code: 'HISTORY_DISABLED',
        message: 'Change history is not available.',
      })
    ).toEqual({
      code: 'HISTORY_DISABLED',
      message: 'Change history is not available.',
    });
  });

  it('parses Kibana error responses with attributes.code', () => {
    expect(
      parseChangeHistoryError({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Change history is disabled.',
        attributes: {
          code: 'HISTORY_DISABLED',
        },
      })
    ).toEqual({
      code: 'HISTORY_DISABLED',
      message: 'Change history is disabled.',
    });
  });

  it('falls back to UNKNOWN for unrecognized codes with a message', () => {
    expect(
      parseChangeHistoryError({
        code: 'CUSTOM',
        message: 'Something went wrong',
      })
    ).toEqual({
      code: 'UNKNOWN',
      message: 'Something went wrong',
    });
  });
});
