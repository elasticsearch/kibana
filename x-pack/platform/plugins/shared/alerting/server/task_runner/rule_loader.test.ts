/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { SavedObjectsErrorHelpers } from '@kbn/core-saved-objects-server';
import { isCoreKibanaRequest } from '@kbn/core-http-server-utils';
import { schema } from '@kbn/config-schema';
import type { Logger } from '@kbn/logging';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';

import {
  getDecryptedRule,
  getFakeKibanaRequest,
  validateRuleAndCreateFakeRequest,
} from './rule_loader';
import { ApiKeyType, type TaskRunnerContext } from './types';
import { ruleTypeRegistryMock } from '../rule_type_registry.mock';
import type { Rule } from '../types';
import { MONITORING_HISTORY_LIMIT, RuleExecutionStatusErrorReasons } from '../../common';
import { getReasonFromError } from '../lib/error_with_reason';
import { mockedRawRuleSO, mockedRule } from './fixtures';
import { RULE_SAVED_OBJECT_TYPE } from '../saved_objects';
import { getErrorSource, TaskErrorSource } from '@kbn/task-manager-plugin/server/task_running';
import { getAlertFromRaw } from '../rules_client/lib/get_alert_from_raw';

// create mocks
const ruleTypeRegistry = ruleTypeRegistryMock.create();
const encryptedSavedObjects = encryptedSavedObjectsMock.createClient();
const mockLogger = loggingSystemMock.create().get() as jest.Mocked<Logger>;

jest.mock('../rules_client/lib/get_alert_from_raw');
const mockGetAlertFromRaw = getAlertFromRaw as jest.MockedFunction<typeof getAlertFromRaw>;

// assign default parameters/data
const apiKey = mockedRawRuleSO.attributes.apiKey!;
const ruleId = 'rule-id-1';
const enabled = true;
const spaceId = 'rule-spaceid';
const ruleName = mockedRule.name;
const consumer = mockedRule.consumer;
const ruleTypeId = mockedRule.alertTypeId;
const ruleParams = mockedRule.params;

describe('rule_loader', () => {
  let context: TaskRunnerContext;
  let contextMock: ReturnType<typeof getTaskRunnerContext>;

  const paramValidator = schema.object({
    bar: schema.boolean(),
  });

  const getDefaultValidateRuleParams = (ruleEnabled = true) => ({
    logger: mockLogger,
    paramValidator,
    ruleId,
    spaceId,
    ruleTypeRegistry,
    ruleData: {
      rawRule: { ...mockedRawRuleSO.attributes, enabled: ruleEnabled },
      version: '1',
      references: [],
    },
  });

  beforeEach(() => {
    jest.resetAllMocks();
    encryptedSavedObjects.getDecryptedAsInternalUser.mockImplementation(
      mockGetDecrypted({
        ...mockedRawRuleSO.attributes,
        apiKey,
        enabled,
        consumer,
      })
    );
    mockGetAlertFromRaw.mockReturnValue({
      name: ruleName,
      alertTypeId: ruleTypeId,
      params: ruleParams,
      monitoring: {
        run: {
          history: new Array(MONITORING_HISTORY_LIMIT),
        },
      },
    } as Rule);
    contextMock = getTaskRunnerContext();
    context = contextMock as unknown as TaskRunnerContext;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateRuleAndCreateFakeRequest()', () => {
    describe('succeeds', () => {
      test('validates and returns the results', () => {
        const result = validateRuleAndCreateFakeRequest({
          ...getDefaultValidateRuleParams(),
          context,
        });

        expect(result.effectiveApiKey).toBe(apiKey);
        expect(result.fakeRequest.headers.authorization).toEqual(`ApiKey ${apiKey}`);
        expect(result.rule.alertTypeId).toBe(ruleTypeId);
        expect(result.rule.name).toBe(ruleName);
        expect(result.rule.params).toBe(ruleParams);
        expect(result.validatedParams).toEqual(ruleParams);
        expect(result.version).toBe('1');
      });
    });

    test('throws when rule is not enabled', () => {
      let outcome = 'success';
      try {
        validateRuleAndCreateFakeRequest({
          ...getDefaultValidateRuleParams(false),
          context,
        });
      } catch (err) {
        outcome = 'failure';
        expect(getReasonFromError(err)).toBe(RuleExecutionStatusErrorReasons.Disabled);
        expect(getErrorSource(err)).toBe(TaskErrorSource.FRAMEWORK);
      }
      expect(outcome).toBe('failure');
    });

    test('throws when rule type is not enabled', () => {
      ruleTypeRegistry.ensureRuleTypeEnabled.mockImplementation(() => {
        throw new Error('rule-type-not-enabled: 2112');
      });

      let outcome = 'success';
      try {
        validateRuleAndCreateFakeRequest({
          ...getDefaultValidateRuleParams(),
          context,
        });
      } catch (err) {
        outcome = 'failure';
        expect(err.message).toBe('rule-type-not-enabled: 2112');
        expect(getReasonFromError(err)).toBe(RuleExecutionStatusErrorReasons.License);
        expect(getErrorSource(err)).toBe(TaskErrorSource.USER);
      }
      expect(outcome).toBe('failure');
    });

    test('test throws when rule params fail validation', () => {
      mockGetAlertFromRaw.mockReturnValueOnce({
        name: ruleName,
        alertTypeId: ruleTypeId,
        params: { bar: 'foo' },
        monitoring: {
          run: {
            history: new Array(MONITORING_HISTORY_LIMIT),
          },
        },
      } as Rule);
      contextMock = getTaskRunnerContext();
      context = contextMock as unknown as TaskRunnerContext;
      let outcome = 'success';
      try {
        validateRuleAndCreateFakeRequest({
          ...getDefaultValidateRuleParams(),
          context,
        });
      } catch (err) {
        outcome = 'failure';
        expect(err.message).toMatch('[bar]: expected value of type [boolean] but got [string]');
        expect(getReasonFromError(err)).toBe(RuleExecutionStatusErrorReasons.Validate);
        expect(getErrorSource(err)).toBe(TaskErrorSource.USER);
      }
      expect(outcome).toBe('failure');
    });
  });

  describe('getDecryptedAttributes()', () => {
    test('succeeds with default space', async () => {
      contextMock.spaceIdToNamespace.mockReturnValue(undefined);
      const result = await getDecryptedRule(context, ruleId, 'default');

      expect(result.rawRule).toEqual({
        ...mockedRawRuleSO.attributes,
        apiKey,
        enabled,
        consumer,
      });
      expect(result.references).toEqual([]);
      expect(result.version).toEqual('1');
      expect(contextMock.spaceIdToNamespace.mock.calls[0]).toEqual(['default']);

      const esoArgs = encryptedSavedObjects.getDecryptedAsInternalUser.mock.calls[0];
      expect(esoArgs).toEqual([RULE_SAVED_OBJECT_TYPE, ruleId, { namespace: undefined }]);
    });

    test('succeeds with non-default space', async () => {
      contextMock.spaceIdToNamespace.mockReturnValue(spaceId);
      const result = await getDecryptedRule(context, ruleId, spaceId);

      expect(contextMock.spaceIdToNamespace.mock.calls[0]).toEqual([spaceId]);
      expect(result.rawRule).toEqual({
        ...mockedRawRuleSO.attributes,
        apiKey,
        enabled,
        consumer,
      });
      expect(result.references).toEqual([]);
      expect(result.version).toEqual('1');

      const esoArgs = encryptedSavedObjects.getDecryptedAsInternalUser.mock.calls[0];
      expect(esoArgs).toEqual([RULE_SAVED_OBJECT_TYPE, ruleId, { namespace: spaceId }]);
    });

    test('fails', async () => {
      encryptedSavedObjects.getDecryptedAsInternalUser.mockImplementation(
        async (type, id, opts) => {
          throw new Error('wops');
        }
      );

      try {
        await getDecryptedRule(context, ruleId, spaceId);
      } catch (e) {
        expect(e.message).toMatch('wops');
        expect(getErrorSource(e)).toBe(TaskErrorSource.FRAMEWORK);
      }
    });

    test('returns USER error for a "not found SO"', async () => {
      encryptedSavedObjects.getDecryptedAsInternalUser.mockRejectedValue(
        SavedObjectsErrorHelpers.createGenericNotFoundError()
      );

      try {
        await getDecryptedRule(context, ruleId, spaceId);
      } catch (e) {
        expect(e.message).toMatch('Not Found');
        expect(getErrorSource(e)).toBe(TaskErrorSource.USER);
      }
    });
  });

  describe('getFakeKibanaRequest()', () => {
    test('has API key, in default space', async () => {
      const { fakeRequest, effectiveApiKey } = getFakeKibanaRequest(context, 'default', apiKey);
      expect(fakeRequest.spaceId).toEqual('default');
      expect(isCoreKibanaRequest(fakeRequest)).toEqual(true);
      expect(fakeRequest.auth.isAuthenticated).toEqual(false);
      expect(fakeRequest.headers.authorization).toEqual('ApiKey MTIzOmFiYw==');
      expect(fakeRequest.isFakeRequest).toEqual(true);
      expect(fakeRequest.isInternalApiRequest).toEqual(false);
      expect(fakeRequest.isSystemRequest).toEqual(false);
      expect(fakeRequest.route.path).toEqual('/');
      expect(fakeRequest.url.toString()).toEqual('https://fake-request/url');
      expect(fakeRequest.uuid).toEqual(expect.any(String));
      expect(effectiveApiKey).toEqual(apiKey);
    });

    test('has API key, in non-default space', async () => {
      const { fakeRequest } = getFakeKibanaRequest(context, spaceId, apiKey);
      expect(fakeRequest.spaceId).toEqual(spaceId);
      expect(isCoreKibanaRequest(fakeRequest)).toEqual(true);
      expect(fakeRequest.auth.isAuthenticated).toEqual(false);
      expect(fakeRequest.headers.authorization).toEqual('ApiKey MTIzOmFiYw==');
      expect(fakeRequest.isFakeRequest).toEqual(true);
      expect(fakeRequest.isInternalApiRequest).toEqual(false);
      expect(fakeRequest.isSystemRequest).toEqual(false);
      expect(fakeRequest.route.path).toEqual('/');
      expect(fakeRequest.url.toString()).toEqual('https://fake-request/url');
      expect(fakeRequest.uuid).toEqual(expect.any(String));
    });

    test('does not have API key, in default space', async () => {
      const { fakeRequest, effectiveApiKey } = getFakeKibanaRequest(context, 'default', null);
      expect(fakeRequest.spaceId).toEqual('default');

      expect(fakeRequest.auth.isAuthenticated).toEqual(false);
      expect(fakeRequest.headers).toEqual({});
      expect(fakeRequest.isFakeRequest).toEqual(true);
      expect(fakeRequest.isInternalApiRequest).toEqual(false);
      expect(fakeRequest.isSystemRequest).toEqual(false);
      expect(fakeRequest.route.path).toEqual('/');
      expect(fakeRequest.url.toString()).toEqual('https://fake-request/url');
      expect(fakeRequest.uuid).toEqual(expect.any(String));
      expect(effectiveApiKey).toBeNull();
    });

    test('returns UIAM API key when config is set to uiam', async () => {
      const { fakeRequest, effectiveApiKey } = getFakeKibanaRequest(
        { ...context, shouldGrantUiam: true, apiKeyType: ApiKeyType.UIAM },
        'default',
        null,
        { uiamApiKey: Buffer.from('456:essu_uiam_api_key').toString('base64') }
      );
      expect(fakeRequest.headers).toEqual({
        authorization: `ApiKey essu_uiam_api_key`,
      });
      expect(effectiveApiKey).toEqual('essu_uiam_api_key');
    });

    test('logs a warning when UIAM is expected but no UIAM API key and apiKeyCreatedByUser is false', () => {
      const uiamContext = {
        ...context,
        shouldGrantUiam: true,
        apiKeyType: ApiKeyType.UIAM,
        logger: mockLogger,
      } as unknown as TaskRunnerContext;

      getFakeKibanaRequest(uiamContext, 'default', apiKey, { apiKeyCreatedByUser: false });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'UIAM API key is not provided to create a fake request, falling back to regular API key.',
        expect.objectContaining({ tags: expect.any(Array) })
      );
    });

    test('logs a debug message for likely non-Cloud user API key owners', () => {
      const uiamContext = {
        ...context,
        shouldGrantUiam: true,
        apiKeyType: ApiKeyType.UIAM,
        logger: mockLogger,
      } as unknown as TaskRunnerContext;

      getFakeKibanaRequest(uiamContext, 'default', apiKey, {
        apiKeyCreatedByUser: false,
        apiKeyOwner: 'elastic',
      });

      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'UIAM API key is not provided because the Elasticsearch API key creator is likely a non-Cloud user, falling back to regular API key.',
        expect.objectContaining({ tags: expect.any(Array) })
      );
    });

    test('logs a debug message when UIAM is expected but no UIAM API key and apiKeyCreatedByUser is true with an ES API key', () => {
      const uiamContext = {
        ...context,
        shouldGrantUiam: true,
        apiKeyType: ApiKeyType.UIAM,
        logger: mockLogger,
      } as unknown as TaskRunnerContext;

      getFakeKibanaRequest(uiamContext, 'default', apiKey, { apiKeyCreatedByUser: true });

      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'UIAM API key is not provided to create a fake request, falling back to ES API key created by the user.',
        expect.objectContaining({ tags: expect.any(Array) })
      );
    });

    test('logs a warning when UIAM is expected but no UIAM API key and apiKeyCreatedByUser is true without an ES API key', () => {
      const uiamContext = {
        ...context,
        shouldGrantUiam: true,
        apiKeyType: ApiKeyType.UIAM,
        logger: mockLogger,
      } as unknown as TaskRunnerContext;

      const { fakeRequest, effectiveApiKey } = getFakeKibanaRequest(uiamContext, 'default', null, {
        apiKeyCreatedByUser: true,
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'UIAM API key is not provided to create a fake request, falling back to regular API key.',
        expect.objectContaining({ tags: expect.any(Array) })
      );
      // No credential is available, so the request must stay unauthenticated
      // rather than carry a literal `ApiKey null` header.
      expect(fakeRequest.headers).toEqual({});
      expect(effectiveApiKey).toBeNull();
    });

    test('logs a warning when UIAM is expected but no UIAM API key and apiKeyCreatedByUser is null', () => {
      const uiamContext = {
        ...context,
        shouldGrantUiam: true,
        apiKeyType: ApiKeyType.UIAM,
        logger: mockLogger,
      } as unknown as TaskRunnerContext;

      getFakeKibanaRequest(uiamContext, 'default', apiKey, { apiKeyCreatedByUser: null });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'UIAM API key is not provided to create a fake request, falling back to regular API key.',
        expect.objectContaining({ tags: expect.any(Array) })
      );
    });

    test('includes the rule id in the UIAM log tags when provided', () => {
      const uiamContext = {
        ...context,
        shouldGrantUiam: true,
        apiKeyType: ApiKeyType.UIAM,
        logger: mockLogger,
      } as unknown as TaskRunnerContext;

      getFakeKibanaRequest(uiamContext, 'default', apiKey, {
        apiKeyCreatedByUser: false,
        ruleId,
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'UIAM API key is not provided to create a fake request, falling back to regular API key.',
        { tags: expect.arrayContaining([ruleId]) }
      );
    });
  });
});

// returns a version of encryptedSavedObjects.getDecryptedAsInternalUser() with provided params
function mockGetDecrypted(attributes: { apiKey?: string; enabled: boolean; consumer: string }) {
  return async (type: string, id: string, opts_: unknown) => {
    return { id, type, references: [], version: '1', attributes };
  };
}

// return enough of TaskRunnerContext that rule_loader needs
function getTaskRunnerContext() {
  return {
    spaceIdToNamespace: jest.fn(),
    encryptedSavedObjectsClient: encryptedSavedObjects,
  };
}
