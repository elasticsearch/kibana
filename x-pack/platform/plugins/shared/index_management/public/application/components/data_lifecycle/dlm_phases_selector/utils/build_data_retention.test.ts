/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { HOT_ONLY_INFINITE_DATA_RETENTION } from '../../../../../../common/lib/data_stream_utils';
import { buildDataRetentionFromSerializedDlmPhases } from './build_data_retention';

describe('buildDataRetentionFromSerializedDlmPhases', () => {
  it('returns hot-only infinite retention when no optional phases are configured', () => {
    expect(buildDataRetentionFromSerializedDlmPhases({})).toEqual(HOT_ONLY_INFINITE_DATA_RETENTION);
  });

  it('serializes delete phase configuration', () => {
    expect(buildDataRetentionFromSerializedDlmPhases({ data_retention: '60d' })).toEqual({
      enabled: true,
      value: 60,
      unit: 'd',
    });
  });

  it('serializes frozen phase without delete', () => {
    expect(buildDataRetentionFromSerializedDlmPhases({ frozen_after: '30d' })).toEqual({
      enabled: false,
      frozen: { enabled: true, value: 30, unit: 'd' },
    });
  });
});
