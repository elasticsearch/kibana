/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { metrics, ValueType } from '@opentelemetry/api';

const meter = metrics.getMeter('kibana.inference.anonymization');

export const pipelineRequestsCounter = meter.createCounter(
  'kibana.inference.anonymization.pipeline.requests',
  {
    description: 'Number of around-completion anonymization pipeline executions',
    unit: '{request}',
    valueType: ValueType.INT,
  }
);

export const pipelineFirstChunkDurationHistogram = meter.createHistogram(
  'kibana.inference.anonymization.pipeline.first_chunk.duration',
  {
    description:
      'Duration from connector invocation to first restored chunk emitted downstream, in milliseconds',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  }
);
