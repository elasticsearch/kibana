/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

jest.mock('./api/routes', () => ({ defineRoutes: jest.fn() }));
jest.mock('./api/workflows_management_api', () => ({
  WorkflowsManagementApi: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('./api/workflows_management_service');

import { coreMock } from '@kbn/core/server/mocks';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/server/mocks';

import { WorkflowsService } from './api/workflows_management_service';
import { WorkflowsPlugin } from './plugin';

const MockedWorkflowsService = WorkflowsService as jest.MockedClass<typeof WorkflowsService>;

describe('WorkflowsPlugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockedWorkflowsService.mockImplementation(
      () =>
        ({
          getCoreStart: jest.fn().mockResolvedValue({ security: { authc: {} } }),
          cleanupUnregisteredOrphans: jest.fn().mockResolvedValue(undefined),
        } as unknown as WorkflowsService)
    );
  });

  it('returns an empty start contract', () => {
    const initializerContext = coreMock.createPluginInitializerContext({
      enabled: true,
      logging: { console: false },
      available: true,
      globalExecutionsView: { enabled: false },
    });

    const plugin = new WorkflowsPlugin(initializerContext);
    const coreSetup = coreMock.createSetup();

    plugin.setup(coreSetup, {
      spaces: { spacesService: { getActiveSpace: jest.fn() } } as any,
      workflowsExtensions: workflowsExtensionsMock.createSetup(),
    });

    const start = plugin.start(coreMock.createStart(), {
      taskManager: {} as any,
      workflowsExecutionEngine: {} as any,
      actions: {} as any,
      spaces: {} as any,
      workflowsExtensions: workflowsExtensionsMock.createStart(),
      licensing: {} as any,
    });

    expect(start).toEqual({});
  });
});
