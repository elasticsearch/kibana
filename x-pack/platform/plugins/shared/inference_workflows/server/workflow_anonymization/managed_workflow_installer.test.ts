/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { PluginScopedManagedWorkflowsApi } from '@kbn/workflows/server/types';
import { createInferenceAnonymizationManagedWorkflowInstaller } from './managed_workflow_installer';

const createClient = (): jest.Mocked<PluginScopedManagedWorkflowsApi> => ({
  install: jest.fn().mockResolvedValue(undefined),
  uninstall: jest.fn().mockResolvedValue(undefined),
  ready: jest.fn().mockResolvedValue(undefined),
  getWorkflowStatus: jest.fn(),
  execute: jest.fn(),
});

describe('inference anonymization managed workflow installer', () => {
  it('installs the complete startup set before signaling ready', async () => {
    const client = createClient();
    const installer = createInferenceAnonymizationManagedWorkflowInstaller({
      getClient: async () => client,
      logger: loggingSystemMock.createLogger(),
    });

    await installer.initialize(Promise.resolve(['default', 'space-a', 'space-a']));

    expect(client.install.mock.calls).toEqual([
      ['system-inference_pii_anonymization', { spaceId: 'default', workflowIdSuffix: 'default' }],
      ['system-inference_pii_anonymization', { spaceId: 'space-a', workflowIdSuffix: 'space-a' }],
    ]);
    expect(client.ready).toHaveBeenCalledTimes(1);
    expect(client.install.mock.invocationCallOrder[1]).toBeLessThan(
      client.ready.mock.invocationCallOrder[0]
    );
  });

  it('installs a newly encountered space once after startup reconciliation', async () => {
    const client = createClient();
    const installer = createInferenceAnonymizationManagedWorkflowInstaller({
      getClient: async () => client,
      logger: loggingSystemMock.createLogger(),
    });
    await installer.initialize(Promise.resolve(['default']));

    await Promise.all([
      installer.ensureInstalled('new-space'),
      installer.ensureInstalled('new-space'),
    ]);

    expect(client.install).toHaveBeenCalledTimes(2);
    expect(client.install).toHaveBeenLastCalledWith('system-inference_pii_anonymization', {
      spaceId: 'new-space',
      workflowIdSuffix: 'new-space',
    });
    expect(client.ready).toHaveBeenCalledTimes(1);
  });

  it('does not signal ready when a startup installation fails', async () => {
    const client = createClient();
    client.install.mockRejectedValueOnce(new Error('install failed'));
    const installer = createInferenceAnonymizationManagedWorkflowInstaller({
      getClient: async () => client,
      logger: loggingSystemMock.createLogger(),
    });

    await expect(installer.initialize(Promise.resolve(['default']))).rejects.toThrow(
      'install failed'
    );
    expect(client.ready).not.toHaveBeenCalled();
  });

  it('retries a failed new-space installation', async () => {
    const client = createClient();
    const installer = createInferenceAnonymizationManagedWorkflowInstaller({
      getClient: async () => client,
      logger: loggingSystemMock.createLogger(),
    });
    await installer.initialize(Promise.resolve(['default']));
    client.install.mockRejectedValueOnce(new Error('transient install failure'));

    await expect(installer.ensureInstalled('new-space')).rejects.toThrow(
      'transient install failure'
    );
    await expect(installer.ensureInstalled('new-space')).resolves.toBeUndefined();

    expect(client.install).toHaveBeenCalledTimes(3);
  });
});
