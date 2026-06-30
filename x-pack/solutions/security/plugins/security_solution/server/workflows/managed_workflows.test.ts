/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SECURITY_ALERT_VALIDATION_WORKFLOW_ID } from '@kbn/workflows/managed';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { APP_ID } from '../../common/constants';
import {
  getSecurityAlertValidationWorkflowIdForSpace,
  initSecurityManagedWorkflowsClient,
  installSecurityAlertValidationWorkflow,
  markSecurityManagedWorkflowsReady,
  registerSecurityManagedWorkflowOwner,
} from './managed_workflows';

describe('managed workflows', () => {
  const createManagedClient = () => ({
    install: jest.fn().mockResolvedValue(undefined),
    uninstall: jest.fn().mockResolvedValue(undefined),
    ready: jest.fn().mockResolvedValue(undefined),
    getWorkflowStatus: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn().mockResolvedValue('execution-id'),
  });

  it('registers Security Solution as a managed workflow owner', () => {
    const workflowsExtensions = workflowsExtensionsMock.createSetup();

    registerSecurityManagedWorkflowOwner(workflowsExtensions);

    expect(workflowsExtensions.registerManagedWorkflowOwner).toHaveBeenCalledWith(APP_ID);
  });

  it('initializes the Security-scoped managed workflows client', async () => {
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    const managed = createManagedClient();

    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);

    await initSecurityManagedWorkflowsClient(workflowsExtensions);

    expect(workflowsExtensions.initManagedWorkflowsClient).toHaveBeenCalledWith(APP_ID);
  });

  it('installs the per-space alert validation workflow with template values', async () => {
    const managed = createManagedClient();
    const settings = {
      workflowEnabled: true,
      autoCloseEnabled: true,
      autoCloseConfidenceScoreMinThreshold: 0.8,
      autoCloseConfidenceScoreMaxThreshold: 0.95,
      connectorId: '',
      createConversation: true,
    };

    await installSecurityAlertValidationWorkflow({
      managedWorkflowsClient: managed,
      spaceId: 'security',
      settings,
    });

    expect(managed.install).toHaveBeenCalledWith(SECURITY_ALERT_VALIDATION_WORKFLOW_ID, {
      spaceId: 'security',
      workflowIdSuffix: 'security',
      values: settings,
    });
    expect(managed.ready).not.toHaveBeenCalled();
  });

  it('builds the per-space alert validation workflow id from the managed id and space id', () => {
    expect(getSecurityAlertValidationWorkflowIdForSpace('security')).toBe(
      'system-security-alert-validation-security'
    );
  });

  it('marks Security managed workflows ready without installing workflows', async () => {
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    const managed = createManagedClient();

    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);

    await markSecurityManagedWorkflowsReady({
      workflowsExtensions,
      logger: loggerMock.create(),
    });

    expect(managed.ready).toHaveBeenCalledTimes(1);
    expect(managed.install).not.toHaveBeenCalled();
  });
});
