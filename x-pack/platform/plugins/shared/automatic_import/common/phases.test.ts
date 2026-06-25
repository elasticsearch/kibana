/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DATA_STREAM_PHASES,
  DATA_STREAM_PHASE_ORDER,
  getDataStreamPhaseIndex,
  getDataStreamPhaseProgress,
} from './phases';

describe('phases', () => {
  it('defines all phases in order', () => {
    expect(DATA_STREAM_PHASE_ORDER).toEqual([
      'analyzing_logs',
      'mapping_to_ecs',
      'building_pipeline',
      'reviewing',
      'fixing_pipeline',
      'mapping_event_fields',
      'mapping_related_fields',
      'finalizing',
    ]);
  });

  it('returns phase index and progress', () => {
    expect(getDataStreamPhaseIndex(DATA_STREAM_PHASES.analyzingLogs)).toBe(0);
    expect(getDataStreamPhaseProgress(DATA_STREAM_PHASES.finalizing)).toBe(
      DATA_STREAM_PHASE_ORDER.length
    );
    expect(getDataStreamPhaseProgress(undefined)).toBe(0);
  });
});
