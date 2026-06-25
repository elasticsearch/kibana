/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DATA_STREAM_PHASE_PROGRESS_MAX, getPhaseLabel, getPhaseProgressValue } from './constants';

describe('data streams table constants', () => {
  it('maps known phases to labels and progress values', () => {
    expect(getPhaseLabel('mapping_to_ecs')).toBe('Mapping to ECS');
    expect(getPhaseProgressValue('mapping_to_ecs')).toBe(2);
    expect(DATA_STREAM_PHASE_PROGRESS_MAX).toBe(8);
  });

  it('falls back when phase is unknown', () => {
    expect(getPhaseLabel(undefined)).toBe('Analyzing');
    expect(getPhaseProgressValue(undefined)).toBe(1);
  });
});
