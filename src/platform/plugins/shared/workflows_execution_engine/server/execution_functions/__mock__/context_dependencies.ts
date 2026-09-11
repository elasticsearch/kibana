/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { actionsMock } from '@kbn/actions-plugin/server/mocks';
import { cloudMock } from '@kbn/cloud-plugin/server/mocks';
import { ByteSizeValue } from '@kbn/config-schema';
import { coreMock } from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/server/mocks';

export const mockContextDependencies = () => ({
  cloudSetup: cloudMock.createSetup(),
  coreStart: coreMock.createStart(),
  actions: actionsMock.createStart(),
  taskManager: taskManagerMock.createStart(),
  workflowsExtensions: workflowsExtensionsMock.createStart(),
  config: {
    enabled: true,
    eventDriven: { enabled: true, logEvents: true, maxChainDepth: 10 },
    maxWorkflowDepth: 10,
    logging: { console: false },
    http: { allowedHosts: ['*'] },
    maxResponseSize: new ByteSizeValue(10 * 1024 * 1024), // 10mb
    eviction: {
      minPayloadSize: new ByteSizeValue(10 * 1024), // 10kb
    },
    collectQueueMetrics: false,
    hitlExternalResume: { enabled: true },
    syncExecution: { enabled: true, maxDurationMs: 60_000 },
    syncLogDrain: { enabled: true, intervalMs: 500, maxQueue: 20000, maxBatch: 4000 },
  },
});
