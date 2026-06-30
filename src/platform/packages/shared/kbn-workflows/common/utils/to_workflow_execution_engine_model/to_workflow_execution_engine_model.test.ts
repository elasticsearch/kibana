/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { toWorkflowExecutionEngineModel } from './to_workflow_execution_engine_model';

describe('toWorkflowExecutionEngineModel', () => {
  const baseSource = {
    id: 'wf-1',
    name: 'Test Workflow',
    enabled: true,
    yaml: 'name: Test Workflow',
    definition: {
      name: 'Test Workflow',
      version: '1' as const,
      enabled: true,
      triggers: [],
      steps: [],
    },
  };

  it('includes version when present on the workflow source', () => {
    expect(toWorkflowExecutionEngineModel({ ...baseSource, version: 4 })).toMatchObject({
      id: 'wf-1',
      version: 4,
    });
  });

  it('omits version when absent', () => {
    expect(toWorkflowExecutionEngineModel(baseSource).version).toBeUndefined();
  });

  it('passes through managed workflow fields and execution options', () => {
    expect(
      toWorkflowExecutionEngineModel(
        {
          ...baseSource,
          version: 2,
          managed: true,
          managedBy: 'plugin-a',
          billable: true,
          originManagedWorkflowId: 'origin-1',
          managedVersion: 1,
        },
        { isTestRun: true, isEphemeral: true, spaceId: 'default' }
      )
    ).toEqual({
      id: 'wf-1',
      name: 'Test Workflow',
      enabled: true,
      definition: baseSource.definition,
      yaml: 'name: Test Workflow',
      version: 2,
      managed: true,
      managedBy: 'plugin-a',
      billable: true,
      originManagedWorkflowId: 'origin-1',
      managedVersion: 1,
      isTestRun: true,
      isEphemeral: true,
      spaceId: 'default',
    });
  });
});
