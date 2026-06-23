/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { NOTIFICATION_TYPE_ENABLED_DEFAULT, NOTIFICATION_TYPE_FLAGS } from './feature_flags';

describe('notification type flag registry', () => {
  it('declares every flag key as a static literal string', () => {
    for (const key of Object.values(NOTIFICATION_TYPE_FLAGS)) {
      expect(typeof key).toBe('string');
      expect(key).toMatch(/^notificationCenter\./);
    }
  });

  it('keeps notification types off by default', () => {
    expect(NOTIFICATION_TYPE_ENABLED_DEFAULT).toBe(false);
  });
});
