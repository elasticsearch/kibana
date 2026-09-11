/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowAnonymizationProvider } from './workflow_anonymization_provider';
import { resolveReplacementsEncryptionKey, resolveWorkflowAnonymizationOptions } from './plugin';

describe('resolveReplacementsEncryptionKey', () => {
  it('returns undefined when anonymization is disabled', async () => {
    await expect(
      resolveReplacementsEncryptionKey({
        namespace: 'default',
        anonymizationEnabled: false,
      })
    ).resolves.toBeUndefined();
  });

  it('returns policy-managed key when anonymization is enabled', async () => {
    const getReplacementsEncryptionKey = jest.fn().mockResolvedValue('managed-key');

    await expect(
      resolveReplacementsEncryptionKey({
        namespace: 'default',
        anonymizationEnabled: true,
        policyService: { getReplacementsEncryptionKey },
      })
    ).resolves.toBe('managed-key');
  });

  it('returns undefined when policy service is unavailable', async () => {
    await expect(
      resolveReplacementsEncryptionKey({
        namespace: 'default',
        anonymizationEnabled: true,
      })
    ).resolves.toBeUndefined();
  });
});

describe('resolveWorkflowAnonymizationOptions', () => {
  const provider: WorkflowAnonymizationProvider = {
    supportsSynchronousExecution: true,
    execute: jest.fn(),
  };

  it('does not enable or log when workflow mode is disabled', () => {
    const logger = { error: jest.fn() };

    expect(
      resolveWorkflowAnonymizationOptions({
        enabled: false,
        failureMode: 'block',
        preLLMTimeoutMs: 5000,
        provider,
        logger,
      })
    ).toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('enables the registered synchronous provider', () => {
    const logger = { error: jest.fn() };

    expect(
      resolveWorkflowAnonymizationOptions({
        enabled: true,
        failureMode: 'allow_unsafe',
        preLLMTimeoutMs: 3000,
        provider,
        logger,
      })
    ).toEqual({
      provider,
      failureMode: 'allow_unsafe',
      preLLMTimeoutMs: 3000,
      encryptionKey: undefined,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('passes encryptionKey through to the returned options', () => {
    const logger = { error: jest.fn() };

    expect(
      resolveWorkflowAnonymizationOptions({
        enabled: true,
        failureMode: 'block',
        preLLMTimeoutMs: 5000,
        encryptionKey: 'my-hmac-key',
        provider,
        logger,
      })
    ).toEqual({
      provider,
      failureMode: 'block',
      preLLMTimeoutMs: 5000,
      encryptionKey: 'my-hmac-key',
    });
  });

  it('logs once and retains legacy behavior when the provider is unavailable', () => {
    const logger = { error: jest.fn() };

    expect(
      resolveWorkflowAnonymizationOptions({
        enabled: true,
        failureMode: 'block',
        preLLMTimeoutMs: 5000,
        logger,
      })
    ).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('retaining legacy anonymization')
    );
  });

  it('logs and falls back to legacy when provider does not support synchronous execution', () => {
    const logger = { error: jest.fn() };
    const asyncOnlyProvider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: false,
      execute: jest.fn(),
    };

    expect(
      resolveWorkflowAnonymizationOptions({
        enabled: true,
        failureMode: 'block',
        preLLMTimeoutMs: 5000,
        provider: asyncOnlyProvider,
        logger,
      })
    ).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('retaining legacy anonymization')
    );
  });
});
