/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { formatRestoreHistoryComment } from './format_restore_history_comment';

describe('formatRestoreHistoryComment', () => {
  it('formats a versioned restore comment', () => {
    expect(formatRestoreHistoryComment(3)).toBe('Restored from v3');
  });

  it('formats a fallback when the source sequence is unknown', () => {
    expect(formatRestoreHistoryComment()).toBe('Restored from a previous version');
  });
});
