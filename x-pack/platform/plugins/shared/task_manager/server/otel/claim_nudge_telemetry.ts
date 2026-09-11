/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type Attributes, type Counter, metrics, ValueType } from '@opentelemetry/api';

/**
 * Which API requested the nudge. Orthogonal sources of the same event, so they live as an
 * attribute on one counter rather than as separate counters.
 */
export type ClaimNudgeSource = 'run_soon' | 'schedule';

class TaskManagerClaimNudgeTelemetry {
  private readonly meter = metrics.getMeter('kibana.task_manager');

  private readonly claimNudgeCounter: Counter<Attributes>;

  constructor() {
    this.claimNudgeCounter = this.meter.createCounter('kibana.task_manager.claim_nudge.count', {
      description:
        'Number of claim nudges requested, each of which also forces one refresh of the task index.',
      unit: '1',
      valueType: ValueType.INT,
    });
  }

  recordClaimNudge = (source: ClaimNudgeSource) => {
    this.claimNudgeCounter.add(1, { 'nudge.source': source });
  };
}

export const taskManagerClaimNudgeTelemetry = new TaskManagerClaimNudgeTelemetry();
