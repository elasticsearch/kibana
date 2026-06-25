/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DATA_STREAM_PHASES } from '../../common';
import { PhaseCallbackHandler } from './phase_callback_handler';

describe('PhaseCallbackHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps task tool invocations to sub-agent phases', () => {
    const handler = new PhaseCallbackHandler(jest.fn());

    expect(
      handler.resolvePhase('task', JSON.stringify({ subagent_name: 'log_and_ecs_analyzer' }))
    ).toBe(DATA_STREAM_PHASES.analyzingLogs);
    expect(handler.resolvePhase('task', JSON.stringify({ subagent_name: 'review_agent' }))).toBe(
      DATA_STREAM_PHASES.reviewing
    );
    expect(
      handler.resolvePhase('task', JSON.stringify({ subagent_name: 'ingest_pipeline_generator' }))
    ).toBe(DATA_STREAM_PHASES.buildingPipeline);
  });

  it('maps fixing pipeline after review has started', () => {
    const handler = new PhaseCallbackHandler(jest.fn());
    handler.reportPhaseIfAdvanced(DATA_STREAM_PHASES.reviewing);

    expect(
      handler.resolvePhase('task', JSON.stringify({ subagent_name: 'ingest_pipeline_generator' }))
    ).toBe(DATA_STREAM_PHASES.fixingPipeline);
    expect(handler.resolvePhase('modify_pipeline', '{}')).toBe(DATA_STREAM_PHASES.fixingPipeline);
  });

  it('reports phases monotonically with debounce', async () => {
    const reportPhase = jest.fn();
    const handler = new PhaseCallbackHandler(reportPhase);

    handler.reportPhaseIfAdvanced(DATA_STREAM_PHASES.mappingToEcs);
    handler.reportPhaseIfAdvanced(DATA_STREAM_PHASES.analyzingLogs);
    handler.reportPhaseIfAdvanced(DATA_STREAM_PHASES.buildingPipeline);

    expect(reportPhase).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(reportPhase).toHaveBeenCalledTimes(1);
    expect(reportPhase).toHaveBeenCalledWith(DATA_STREAM_PHASES.buildingPipeline);
  });

  it('flushes pending phase immediately', async () => {
    const reportPhase = jest.fn();
    const handler = new PhaseCallbackHandler(reportPhase);

    handler.reportPhaseIfAdvanced(DATA_STREAM_PHASES.analyzingLogs);
    await handler.flushPendingPhase();

    expect(reportPhase).toHaveBeenCalledWith(DATA_STREAM_PHASES.analyzingLogs);
  });
});
