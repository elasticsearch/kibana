/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { resolveRuleAPIKey } from './resolve_rule_api_key';
import type { RulesClientContext, CreateAPIKeyResult } from '../types';

const clonedKey: CreateAPIKeyResult = {
  apiKeysEnabled: true,
  result: { id: 'cloned-id', name: 'test-rule', api_key: 'cloned-secret' },
};
const grantedKey: CreateAPIKeyResult = {
  apiKeysEnabled: true,
  result: { id: 'granted-id', name: 'test-rule', api_key: 'granted-secret' },
};
const userKey: CreateAPIKeyResult = {
  apiKeysEnabled: true,
  result: { id: 'user-key-id', name: 'test-rule-user-created', api_key: 'user-secret' },
};

const createMockContext = (overrides: Partial<RulesClientContext> = {}): RulesClientContext =>
  ({
    createAPIKey: jest.fn().mockResolvedValue(grantedKey),
    isAuthenticationTypeAPIKey: jest.fn().mockReturnValue(false),
    getAuthenticationAPIKey: jest.fn().mockReturnValue(userKey),
    cloneAPIKey: jest.fn().mockResolvedValue(clonedKey),
    cloneApiKeysOnCreate: false,
    ...overrides,
  } as unknown as RulesClientContext);

describe('resolveRuleAPIKey', () => {
  describe('when rule is disabled', () => {
    test('returns null regardless of context or existing state', async () => {
      const context = createMockContext({
        isAuthenticationTypeAPIKey: jest.fn().mockReturnValue(true),
      });

      const result = await resolveRuleAPIKey(context, 'test-rule', false, {
        apiKeyOwnership: { apiKeyCreatedByUser: false },
      });

      expect(result).toEqual({ createdAPIKey: null, isAuthTypeApiKey: false });
      expect(context.cloneAPIKey).not.toHaveBeenCalled();
      expect(context.createAPIKey).not.toHaveBeenCalled();
    });
  });

  describe('existing framework-managed rule (apiKeyCreatedByUser === false)', () => {
    const existing = { apiKeyOwnership: { apiKeyCreatedByUser: false as const } };

    test('clones when request is API-key-authed', async () => {
      const context = createMockContext({
        isAuthenticationTypeAPIKey: jest.fn().mockReturnValue(true),
      });

      const result = await resolveRuleAPIKey(context, 'test-rule', true, existing);

      expect(result).toEqual({ createdAPIKey: clonedKey, isAuthTypeApiKey: false });
      expect(context.cloneAPIKey).toHaveBeenCalledWith('test-rule');
      expect(context.createAPIKey).not.toHaveBeenCalled();
      expect(context.getAuthenticationAPIKey).not.toHaveBeenCalled();
    });

    test('grants via createAPIKey when request is NOT API-key-authed', async () => {
      const context = createMockContext();

      const result = await resolveRuleAPIKey(context, 'test-rule', true, existing);

      expect(result).toEqual({ createdAPIKey: grantedKey, isAuthTypeApiKey: false });
      expect(context.createAPIKey).toHaveBeenCalledWith('test-rule', undefined);
      expect(context.cloneAPIKey).not.toHaveBeenCalled();
      expect(context.getAuthenticationAPIKey).not.toHaveBeenCalled();
    });

    test('propagates errors from cloneAPIKey', async () => {
      const context = createMockContext({
        isAuthenticationTypeAPIKey: jest.fn().mockReturnValue(true),
        cloneAPIKey: jest.fn().mockRejectedValue(new Error('clone failed')),
      });

      await expect(resolveRuleAPIKey(context, 'test-rule', true, existing)).rejects.toThrow(
        'clone failed'
      );
    });
  });

  describe('cloneApiKeysOnCreate flag', () => {
    test('clones on create (no existing) regardless of auth type', async () => {
      const context = createMockContext({
        cloneApiKeysOnCreate: true,
      });

      const result = await resolveRuleAPIKey(context, 'test-rule', true);

      expect(result).toEqual({ createdAPIKey: clonedKey, isAuthTypeApiKey: false });
      expect(context.cloneAPIKey).toHaveBeenCalledWith('test-rule');
      expect(context.isAuthenticationTypeAPIKey).not.toHaveBeenCalled();
    });

    test('does not apply to regen (existing rule) — falls through to framework-managed logic', async () => {
      const context = createMockContext({
        cloneApiKeysOnCreate: true,
        isAuthenticationTypeAPIKey: jest.fn().mockReturnValue(true),
      });

      const result = await resolveRuleAPIKey(context, 'test-rule', true, {
        apiKeyOwnership: { apiKeyCreatedByUser: false },
      });

      expect(result).toEqual({ createdAPIKey: clonedKey, isAuthTypeApiKey: false });
      expect(context.cloneAPIKey).toHaveBeenCalledWith('test-rule');
      expect(context.isAuthenticationTypeAPIKey).toHaveBeenCalled();
    });
  });

  describe('create path (no existing rule, cloneApiKeysOnCreate false)', () => {
    test('uses getAuthenticationAPIKey when request is API-key-authed', async () => {
      const context = createMockContext({
        isAuthenticationTypeAPIKey: jest.fn().mockReturnValue(true),
      });

      const result = await resolveRuleAPIKey(context, 'test-rule', true);

      expect(result).toEqual({ createdAPIKey: userKey, isAuthTypeApiKey: true });
      expect(context.getAuthenticationAPIKey).toHaveBeenCalledWith('test-rule-user-created');
      expect(context.cloneAPIKey).not.toHaveBeenCalled();
    });

    test('grants via createAPIKey when not API-key-authed and cloneApiKeysOnCreate is false', async () => {
      const context = createMockContext();

      const result = await resolveRuleAPIKey(context, 'test-rule', true);

      expect(result).toEqual({ createdAPIKey: grantedKey, isAuthTypeApiKey: false });
      expect(context.createAPIKey).toHaveBeenCalledWith('test-rule', undefined);
      expect(context.cloneAPIKey).not.toHaveBeenCalled();
    });

    test('forwards refresh to createAPIKey when granting', async () => {
      const context = createMockContext();

      await resolveRuleAPIKey(context, 'test-rule', true, { refresh: false });

      expect(context.createAPIKey).toHaveBeenCalledWith('test-rule', false);
    });
  });

  describe('cloneApiKey option (caller-declared borrowed credential)', () => {
    test('mints a framework-owned key instead of persisting the caller credential', async () => {
      const context = createMockContext({
        isAuthenticationTypeAPIKey: jest.fn().mockReturnValue(true),
      });

      const result = await resolveRuleAPIKey(context, 'test-rule', true, { cloneApiKey: true });

      expect(result).toEqual({ createdAPIKey: clonedKey, isAuthTypeApiKey: false });
      expect(context.cloneAPIKey).toHaveBeenCalledWith('test-rule');
      expect(context.getAuthenticationAPIKey).not.toHaveBeenCalled();
    });

    test('is a no-op when the request is not API-key-authed: grants as usual', async () => {
      const context = createMockContext();

      const result = await resolveRuleAPIKey(context, 'test-rule', true, { cloneApiKey: true });

      expect(result).toEqual({ createdAPIKey: grantedKey, isAuthTypeApiKey: false });
      expect(context.createAPIKey).toHaveBeenCalledWith('test-rule', undefined);
      expect(context.cloneAPIKey).not.toHaveBeenCalled();
    });

    test('does not apply to regen (existing rule): user-managed rules keep the caller credential', async () => {
      const context = createMockContext({
        isAuthenticationTypeAPIKey: jest.fn().mockReturnValue(true),
      });

      const result = await resolveRuleAPIKey(context, 'test-rule', true, {
        apiKeyOwnership: { apiKeyCreatedByUser: true },
        cloneApiKey: true,
      });

      expect(result).toEqual({ createdAPIKey: userKey, isAuthTypeApiKey: true });
      expect(context.getAuthenticationAPIKey).toHaveBeenCalledWith('test-rule-user-created');
      expect(context.cloneAPIKey).not.toHaveBeenCalled();
    });

    test('when not set, an external API-key caller still has its credential persisted', async () => {
      const context = createMockContext({
        isAuthenticationTypeAPIKey: jest.fn().mockReturnValue(true),
      });

      const result = await resolveRuleAPIKey(context, 'test-rule', true, { cloneApiKey: false });

      expect(result).toEqual({ createdAPIKey: userKey, isAuthTypeApiKey: true });
      expect(context.getAuthenticationAPIKey).toHaveBeenCalledWith('test-rule-user-created');
      expect(context.cloneAPIKey).not.toHaveBeenCalled();
    });
  });

  describe('existing user-managed rule (apiKeyCreatedByUser === true)', () => {
    const existing = { apiKeyOwnership: { apiKeyCreatedByUser: true as const } };

    test('uses getAuthenticationAPIKey when request is API-key-authed', async () => {
      const context = createMockContext({
        isAuthenticationTypeAPIKey: jest.fn().mockReturnValue(true),
      });

      const result = await resolveRuleAPIKey(context, 'test-rule', true, existing);

      expect(result).toEqual({ createdAPIKey: userKey, isAuthTypeApiKey: true });
      expect(context.getAuthenticationAPIKey).toHaveBeenCalledWith('test-rule-user-created');
      expect(context.cloneAPIKey).not.toHaveBeenCalled();
    });

    test('grants via createAPIKey when not API-key-authed', async () => {
      const context = createMockContext();

      const result = await resolveRuleAPIKey(context, 'test-rule', true, existing);

      expect(result).toEqual({ createdAPIKey: grantedKey, isAuthTypeApiKey: false });
      expect(context.createAPIKey).toHaveBeenCalledWith('test-rule', undefined);
    });
  });

  describe('existing rule with null apiKeyCreatedByUser (legacy)', () => {
    const existing = { apiKeyOwnership: { apiKeyCreatedByUser: null } };

    test('falls through to legacy logic', async () => {
      const context = createMockContext({
        isAuthenticationTypeAPIKey: jest.fn().mockReturnValue(true),
      });

      const result = await resolveRuleAPIKey(context, 'test-rule', true, existing);

      expect(result).toEqual({ createdAPIKey: userKey, isAuthTypeApiKey: true });
      expect(context.getAuthenticationAPIKey).toHaveBeenCalledWith('test-rule-user-created');
      expect(context.cloneAPIKey).not.toHaveBeenCalled();
    });
  });
});
