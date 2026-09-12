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
  WorkflowsManagementApi: jest.fn().mockImplementation(() => ({
    setAuditLog: jest.fn(),
  })),
}));
jest.mock('./api/workflows_management_service');
jest.mock('@kbn/workflows-execution-engine/server', () => ({
  registerHitlLifecycleAuditor: jest.fn(() => jest.fn()),
}));

import { actionsMock } from '@kbn/actions-plugin/server/mocks';
import { coreMock } from '@kbn/core/server/mocks';
import { registerHitlLifecycleAuditor } from '@kbn/workflows-execution-engine/server';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/server/mocks';

import { WorkflowsService } from './api/workflows_management_service';
import { WorkflowsPlugin } from './plugin';

const MockedWorkflowsService = WorkflowsService as jest.MockedClass<typeof WorkflowsService>;
const mockRegisterHitlLifecycleAuditor = registerHitlLifecycleAuditor as jest.MockedFunction<
  typeof registerHitlLifecycleAuditor
>;

describe('WorkflowsPlugin', () => {
  const setStopping = jest.fn();
  const cleanupUnregisteredOrphans = jest.fn().mockResolvedValue(undefined);
  const unregisterHitlLifecycleAuditor = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisterHitlLifecycleAuditor.mockReturnValue(unregisterHitlLifecycleAuditor);
    MockedWorkflowsService.mockImplementation(
      () =>
        ({
          getCoreStart: jest.fn().mockResolvedValue({ security: { authc: {} } }),
          cleanupUnregisteredOrphans,
          setStopping,
        } as unknown as WorkflowsService)
    );
  });

  it('returns an empty start contract and clears the stopping flag', () => {
    const initializerContext = coreMock.createPluginInitializerContext({
      enabled: true,
      logging: { console: false },
      available: true,
      library: { ttlMs: 600_000 },
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
      dataViews: {} as any,
    });

    expect(start).toEqual({});
    expect(setStopping).toHaveBeenCalledWith(false);
    expect(mockRegisterHitlLifecycleAuditor).toHaveBeenCalled();
  });

  it('marks the workflows service as stopping on stop()', () => {
    const initializerContext = coreMock.createPluginInitializerContext({
      enabled: true,
      logging: { console: false },
      available: true,
      library: { ttlMs: 600_000 },
    });

    const plugin = new WorkflowsPlugin(initializerContext);
    plugin.setup(coreMock.createSetup(), {
      spaces: { spacesService: { getActiveSpace: jest.fn() } } as any,
      workflowsExtensions: workflowsExtensionsMock.createSetup(),
    });
    plugin.start(coreMock.createStart(), {
      taskManager: {} as any,
      workflowsExecutionEngine: {} as any,
      actions: {} as any,
      spaces: {} as any,
      workflowsExtensions: workflowsExtensionsMock.createStart(),
      licensing: {} as any,
      dataViews: {} as any,
    });

    setStopping.mockClear();
    plugin.stop();

    expect(setStopping).toHaveBeenCalledWith(true);
    expect(unregisterHitlLifecycleAuditor).toHaveBeenCalled();
  });

  it('does not register connector-event triggers when inbound events are disabled', () => {
    const actions = actionsMock.createSetup();
    (
      actions.getActionsConfigurationUtilities().isInboundEventsEnabled as jest.Mock
    ).mockReturnValue(false);
    const workflowsExtensions = workflowsExtensionsMock.createSetup();
    const plugin = new WorkflowsPlugin(
      coreMock.createPluginInitializerContext({
        enabled: true,
        logging: { console: false },
        available: true,
        library: { ttlMs: 600_000 },
      })
    );

    plugin.setup(coreMock.createSetup(), {
      actions,
      spaces: { spacesService: { getActiveSpace: jest.fn() } } as any,
      workflowsExtensions,
    });

    const connectorEventRegistrations =
      workflowsExtensions.registerTriggerDefinition.mock.calls.filter(
        ([definition]) => definition.id === 'inboundWebhook.received'
      );
    expect(connectorEventRegistrations).toHaveLength(0);
  });

  it('registers inboundWebhook.received when inbound events are enabled', () => {
    const actions = actionsMock.createSetup();
    (
      actions.getActionsConfigurationUtilities().isInboundEventsEnabled as jest.Mock
    ).mockReturnValue(true);
    const workflowsExtensions = workflowsExtensionsMock.createSetup();
    const plugin = new WorkflowsPlugin(
      coreMock.createPluginInitializerContext({
        enabled: true,
        logging: { console: false },
        available: true,
        library: { ttlMs: 600_000 },
      })
    );

    plugin.setup(coreMock.createSetup(), {
      actions,
      spaces: { spacesService: { getActiveSpace: jest.fn() } } as any,
      workflowsExtensions,
    });

    expect(workflowsExtensions.registerTriggerDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inboundWebhook.received',
        stability: 'tech_preview',
        requiresConnectorId: true,
      })
    );
  });
});
