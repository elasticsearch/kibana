/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock, httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import type { StartServicesAccessor } from '@kbn/core/server';
import type { RouterMock } from '@kbn/core-http-router-server-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { SECURITY_ALERT_VALIDATION_WORKFLOW_ID } from '@kbn/workflows/managed';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/server/mocks';
import {
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MAX_THRESHOLD,
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MIN_THRESHOLD,
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_ENABLED,
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_CONNECTOR_ID,
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_CREATE_CONVERSATION,
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_ENABLED,
} from '@kbn/management-settings-ids';
import type { StartPlugins } from '../plugin';
import type {
  SecuritySolutionApiRequestHandlerContext,
  SecuritySolutionPluginRouter,
  SecuritySolutionRequestHandlerContext,
} from '../types';
import {
  ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE,
  registerAlertValidationWorkflowSettingsRoutes,
} from './alert_validation_workflow_settings_routes';

describe('registerAlertValidationWorkflowSettingsRoutes', () => {
  let router: RouterMock;
  let coreStart: ReturnType<typeof coreMock.createStart>;
  let getStartServices: jest.MockedFunction<StartServicesAccessor<StartPlugins>>;
  let mockResponse: ReturnType<typeof httpServerMock.createResponseFactory>;
  let uiSettingsClient: { get: jest.Mock; set: jest.Mock };
  let managedWorkflowsClient: {
    install: jest.Mock;
    uninstall: jest.Mock;
    ready: jest.Mock;
    getWorkflowStatus: jest.Mock;
    execute: jest.Mock;
  };

  const createContext = (): SecuritySolutionRequestHandlerContext => {
    const securitySolutionContext = {
      getSpaceId: jest.fn().mockReturnValue('space-1'),
    } as Pick<SecuritySolutionApiRequestHandlerContext, 'getSpaceId'>;

    return {
      securitySolution: Promise.resolve(
        securitySolutionContext as unknown as SecuritySolutionApiRequestHandlerContext
      ),
    } as unknown as SecuritySolutionRequestHandlerContext;
  };

  const createRequest = (body?: unknown) =>
    httpServerMock.createKibanaRequest({
      method: body ? 'put' : 'get',
      path: ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE,
      body: body as Record<string, unknown>,
    });

  beforeEach(() => {
    router = httpServiceMock.createRouter() as unknown as RouterMock;
    coreStart = coreMock.createStart();
    mockResponse = httpServerMock.createResponseFactory();
    uiSettingsClient = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
    };
    managedWorkflowsClient = {
      install: jest.fn().mockResolvedValue(undefined),
      uninstall: jest.fn().mockResolvedValue(undefined),
      ready: jest.fn().mockResolvedValue(undefined),
      getWorkflowStatus: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValue('mock-execution-id'),
    };

    (coreStart.uiSettings.asScopedToClient as jest.Mock).mockReturnValue(uiSettingsClient);
    coreStart.featureFlags.getBooleanValue.mockResolvedValue(true);

    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managedWorkflowsClient);

    getStartServices = jest
      .fn()
      .mockResolvedValue([
        coreStart,
        { workflowsExtensions } as unknown as StartPlugins,
        undefined,
      ] as unknown as Awaited<ReturnType<StartServicesAccessor<StartPlugins>>>);

    registerAlertValidationWorkflowSettingsRoutes(
      router as unknown as SecuritySolutionPluginRouter,
      getStartServices as unknown as StartServicesAccessor<StartPlugins>,
      loggerMock.create()
    );
  });

  it('returns the current space-scoped settings', async () => {
    uiSettingsClient.get
      .mockResolvedValueOnce(true) // workflowEnabled
      .mockResolvedValueOnce(false) // autoCloseEnabled
      .mockResolvedValueOnce(0.7) // autoCloseConfidenceScoreMinThreshold
      .mockResolvedValueOnce(0.9) // autoCloseConfidenceScoreMaxThreshold
      .mockResolvedValueOnce('connector-abc') // connectorId
      .mockResolvedValueOnce(true); // createConversation

    const handler = router.versioned.getRoute('get', ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE)
      .versions['1'].handler;

    await handler(createContext(), createRequest(), mockResponse);

    expect(mockResponse.ok).toHaveBeenCalledWith({
      body: {
        settings: {
          workflowEnabled: true,
          autoCloseEnabled: false,
          autoCloseConfidenceScoreMinThreshold: 0.7,
          autoCloseConfidenceScoreMaxThreshold: 0.9,
          connectorId: 'connector-abc',
          createConversation: true,
        },
        workflowId: 'system-security-alert-validation-space-1',
      },
    });
  });

  it('persists settings and installs the per-space managed workflow', async () => {
    const settings = {
      workflowEnabled: true,
      autoCloseEnabled: true,
      autoCloseConfidenceScoreMinThreshold: 0.75,
      autoCloseConfidenceScoreMaxThreshold: 0.95,
      connectorId: 'connector-xyz',
      createConversation: false,
    };
    const handler = router.versioned.getRoute('put', ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE)
      .versions['1'].handler;

    await handler(createContext(), createRequest(settings), mockResponse);

    expect(uiSettingsClient.set).toHaveBeenCalledWith(
      SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_ENABLED,
      settings.workflowEnabled
    );
    expect(uiSettingsClient.set).toHaveBeenCalledWith(
      SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_ENABLED,
      settings.autoCloseEnabled
    );
    expect(uiSettingsClient.set).toHaveBeenCalledWith(
      SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MIN_THRESHOLD,
      settings.autoCloseConfidenceScoreMinThreshold
    );
    expect(uiSettingsClient.set).toHaveBeenCalledWith(
      SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MAX_THRESHOLD,
      settings.autoCloseConfidenceScoreMaxThreshold
    );
    expect(uiSettingsClient.set).toHaveBeenCalledWith(
      SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_CONNECTOR_ID,
      settings.connectorId
    );
    expect(uiSettingsClient.set).toHaveBeenCalledWith(
      SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_CREATE_CONVERSATION,
      settings.createConversation
    );
    expect(managedWorkflowsClient.install).toHaveBeenCalledWith(
      SECURITY_ALERT_VALIDATION_WORKFLOW_ID,
      {
        spaceId: 'space-1',
        workflowIdSuffix: 'space-1',
        values: settings,
      }
    );
    expect(mockResponse.ok).toHaveBeenCalledWith({
      body: {
        settings,
        installed: true,
        workflowId: 'system-security-alert-validation-space-1',
      },
    });
  });

  it('does not persist or install when the feature flag is disabled', async () => {
    coreStart.featureFlags.getBooleanValue.mockResolvedValue(false);
    const handler = router.versioned.getRoute('put', ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE)
      .versions['1'].handler;

    await handler(
      createContext(),
      createRequest({
        autoCloseEnabled: true,
        autoCloseConfidenceScoreMinThreshold: 0.7,
        autoCloseConfidenceScoreMaxThreshold: 0.9,
      }),
      mockResponse
    );

    expect(mockResponse.notFound).toHaveBeenCalled();
    expect(uiSettingsClient.set).not.toHaveBeenCalled();
    expect(managedWorkflowsClient.install).not.toHaveBeenCalled();
  });
});
