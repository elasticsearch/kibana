/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import {
  classifyGlobalManifestVersion,
  isPinnedGlobalManifestVersion,
} from './global_manifest_version';

describe('classifyGlobalManifestVersion', () => {
  it.each([
    { value: '', status: 'unpinned', pinned: false },
    { value: 'latest', status: 'automatic', pinned: false },
    {
      value: moment.utc().subtract(1, 'day').format('YYYY-MM-DD'),
      status: 'valid',
      pinned: true,
    },
    { value: 'not-a-date', status: 'invalid_format', pinned: true },
    { value: '2020-01-01', status: 'too_old', pinned: true },
    {
      value: moment.utc().add(1, 'day').format('YYYY-MM-DD'),
      status: 'in_future',
      pinned: true,
    },
  ] as const)('classifies $value as $status', ({ value, status, pinned }) => {
    const result = classifyGlobalManifestVersion(value);

    expect(result).toBe(status);
    expect(isPinnedGlobalManifestVersion(result)).toBe(pinned);
  });
});
