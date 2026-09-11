/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { metrics, ValueType } from '@opentelemetry/api';

const meter = metrics.getMeter('kibana.workflows.execution');

export const syncExecutionRequestsCounter = meter.createCounter(
  'kibana.workflows.execution.sync.requests',
  {
    description: 'Number of synchronous workflow execution requests',
    unit: '{request}',
    valueType: ValueType.INT,
  }
);

export const syncExecutionDurationHistogram = meter.createHistogram(
  'kibana.workflows.execution.sync.duration',
  {
    description: 'Duration of synchronous workflow executions, in milliseconds',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  }
);
