/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getChangeHistoryErrorMessage } from './get_change_history_error_message';

describe('getChangeHistoryErrorMessage', () => {
  it('prefers structured change history error payloads', () => {
    const error = new Error('Bad Request');
    (error as { body?: unknown }).body = {
      code: 'FORBIDDEN',
      message: 'You do not have permission to view change history.',
    };

    expect(getChangeHistoryErrorMessage(error)).toBe(
      'You do not have permission to view change history.'
    );
  });

  it('falls back to HttpFetchError body message', () => {
    const error = new Error('Bad Request');
    (error as { body?: unknown }).body = {
      message: 'Workflow not found',
    };

    expect(getChangeHistoryErrorMessage(error)).toBe('Workflow not found');
  });
});
