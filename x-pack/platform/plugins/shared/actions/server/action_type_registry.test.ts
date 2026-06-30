/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TaskCost } from '@kbn/task-manager-plugin/server';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { z } from '@kbn/zod/v4';
import type { ActionTypeRegistryOpts } from './action_type_registry';
import { ActionTypeRegistry } from './action_type_registry';
import type { ActionType } from './types';
import type { ILicenseState } from './lib';
import { ActionExecutionSourceType, ActionExecutor, TaskRunnerFactory } from './lib';
import { actionsConfigMock } from './actions_config.mock';
import { licenseStateMock } from './lib/license_state.mock';
import type { ActionsConfigurationUtilities } from './actions_config';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import { inMemoryMetricsMock } from './monitoring/in_memory_metrics.mock';
import { ConnectorRateLimiter } from './lib/connector_rate_limiter';
import { getConnectorType } from './fixtures';
import { createMockInMemoryConnector } from './application/connector/mocks';

const mockTaskManager = taskManagerMock.createSetup();
const inMemoryMetrics = inMemoryMetricsMock.create();
let mockedLicenseState: jest.Mocked<ILicenseState>;
let mockedActionsConfig: jest.Mocked<ActionsConfigurationUtilities>;
let actionTypeRegistryParams: ActionTypeRegistryOpts;

const fooActionType: ActionType = getConnectorType({
  id: 'foo',
  name: 'Foo',
  executor: async (options: { actionId: string }) => {
    return { status: 'ok', actionId: options.actionId };
  },
});

describe('actionTypeRegistry', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedLicenseState = licenseStateMock.create();
    mockedActionsConfig = actionsConfigMock.create();
    actionTypeRegistryParams = {
      licensing: licensingMock.createSetup(),
      taskManager: mockTaskManager,
      taskRunnerFactory: new TaskRunnerFactory(
        new ActionExecutor({
          isESOCanEncrypt: true,
          connectorRateLimiter: new ConnectorRateLimiter({
            config: { email: { limit: 100, lookbackWindow: '1m' } },
          }),
        }),
        inMemoryMetrics
      ),
      actionsConfigUtils: mockedActionsConfig,
      licenseState: mockedLicenseState,
      inMemoryConnectors: [
        createMockInMemoryConnector({
          actionTypeId: 'foo',
          id: 'my-slack1',
          name: 'Slack #xyz',
          isPreconfigured: true,
        }),
        createMockInMemoryConnector({
          actionTypeId: 'test.system-action',
          id: 'system-connector-test.system-action',
          name: 'System action: test.system-action',
          isSystemAction: true,
        }),
      ],
    };
  });

  describe('register()', () => {
    test('able to register connector types', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      actionTypeRegistry.register<{}, {}, {}, void>(
        getConnectorType({
          minimumLicenseRequired: 'gold',
        })
      );
      expect(actionTypeRegistry.has('my-connector-type')).toEqual(true);
      expect(mockTaskManager.registerTaskDefinitions).toHaveBeenCalledTimes(1);
      expect(mockTaskManager.registerTaskDefinitions.mock.calls[0]).toEqual(
        expect.objectContaining([
          {
            'actions:my-connector-type': {
              createTaskRunner: expect.any(Function),
              maxAttempts: 3,
              cost: TaskCost.Tiny,
              title: 'My connector type',
            },
          },
        ])
      );
      expect(actionTypeRegistryParams.licensing.featureUsage.register).toHaveBeenCalledWith(
        'Connector: My connector type',
        'gold'
      );
    });

    test('shallow clones the given connector type', () => {
      const myType = getConnectorType();
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      actionTypeRegistry.register(myType);
      myType.name = 'Changed';
      expect(actionTypeRegistry.get('my-connector-type').name).toEqual('My connector type');
    });

    test('throws error if connector type already registered', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      actionTypeRegistry.register(getConnectorType());
      expect(() =>
        actionTypeRegistry.register(getConnectorType())
      ).toThrowErrorMatchingInlineSnapshot(
        `"Action type \\"my-connector-type\\" is already registered."`
      );
    });

    test('throws if empty supported feature ids provided', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      expect(() =>
        actionTypeRegistry.register(
          getConnectorType({
            supportedFeatureIds: [],
          })
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"At least one \\"supportedFeatureId\\" value must be supplied for connector type \\"my-connector-type\\"."`
      );
    });

    test('throws if invalid feature ids provided', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      expect(() =>
        actionTypeRegistry.register(
          getConnectorType({
            supportedFeatureIds: ['foo'],
          })
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"Invalid feature ids \\"foo\\" for connector type \\"my-connector-type\\"."`
      );
    });

    test('throws if a supported feature id exceeds the max length', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      expect(() =>
        actionTypeRegistry.register(
          getConnectorType({
            supportedFeatureIds: ['a'.repeat(101)],
          })
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"Feature IDs for connector type \\"my-connector-type\\" must not exceed 100 characters."`
      );
    });

    test('registers gold+ connector types to the licensing feature usage API', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      actionTypeRegistry.register(
        getConnectorType({
          minimumLicenseRequired: 'gold',
        })
      );
      expect(actionTypeRegistryParams.licensing.featureUsage.register).toHaveBeenCalledWith(
        'Connector: My connector type',
        'gold'
      );
    });

    test(`doesn't register basic connector types to the licensing feature usage API`, () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      actionTypeRegistry.register(getConnectorType());
      expect(actionTypeRegistryParams.licensing.featureUsage.register).not.toHaveBeenCalled();
    });

    test('allows registering system connector', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);

      expect(() =>
        actionTypeRegistry.register(
          getConnectorType({
            isSystemActionType: true,
          })
        )
      ).not.toThrow();
    });

    test('throws if the kibana privileges are defined but the connector type is not a system connector type or sub-feature type', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);

      expect(() =>
        actionTypeRegistry.register(
          getConnectorType({
            isSystemActionType: false,
            getKibanaPrivileges: jest.fn(),
          })
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"Kibana privilege authorization is only supported for system actions and action types that are registered under a sub-feature"`
      );
    });
  });

  describe('get()', () => {
    test('returns connector type', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      actionTypeRegistry.register(getConnectorType());
      const { validate, ...rest } = actionTypeRegistry.get('my-connector-type');
      expect(validate).toBeDefined();
      expect(rest).toMatchInlineSnapshot(`
        Object {
          "executor": [Function],
          "id": "my-connector-type",
          "minimumLicenseRequired": "basic",
          "name": "My connector type",
          "supportedFeatureIds": Array [
            "alerting",
          ],
        }
      `);
    });

    test(`throws an error when connector type doesn't exist`, () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      expect(() => actionTypeRegistry.get('my-connector-type')).toThrowErrorMatchingInlineSnapshot(
        `"Action type \\"my-connector-type\\" is not registered."`
      );
    });
  });

  describe('list()', () => {
    test('returns list of connector types', () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      actionTypeRegistry.register(getConnectorType());
      const actionTypes = actionTypeRegistry.list();
      expect(actionTypes).toEqual([
        {
          id: 'my-connector-type',
          name: 'My connector type',
          enabled: true,
          enabledInConfig: true,
          enabledInLicense: true,
          minimumLicenseRequired: 'basic',
          supportedFeatureIds: ['alerting'],
          isSystemActionType: false,
          isDeprecated: false,
          source: 'stack',
        },
      ]);
      expect(mockedActionsConfig.isActionTypeEnabled).toHaveBeenCalled();
      expect(mockedLicenseState.isLicenseValidForActionType).toHaveBeenCalled();
    });

    test('returns list of connector types with parameter schema', () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      const connectorTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      connectorTypeRegistry.register(
        getConnectorType({
          validate: {
            config: { schema: z.object({}) },
            secrets: { schema: z.object({}) },
            params: {
              schema: z.object({
                text: z.string().min(1),
              }),
            },
          },
        })
      );
      connectorTypeRegistry.register(
        getConnectorType({
          id: 'my-connector-type-with-subaction',
          name: 'My connector type with subaction',
          validate: {
            config: { schema: z.object({}) },
            secrets: { schema: z.object({}) },
            params: {
              schema: z.union([
                z.object({
                  subAction: z.literal('subaction1'),
                  subActionParams: z.object({ value: z.number().min(5) }),
                }),
                z.object({
                  subAction: z.literal('subaction2'),
                  subActionParams: z.object({ message: z.string().min(5) }),
                }),
              ]),
            },
          },
        })
      );
      const connectorTypes = connectorTypeRegistry.list({ exposeValidation: true });
      expect(connectorTypes).toEqual([
        {
          id: 'my-connector-type',
          name: 'My connector type',
          enabled: true,
          enabledInConfig: true,
          enabledInLicense: true,
          minimumLicenseRequired: 'basic',
          supportedFeatureIds: ['alerting'],
          isSystemActionType: false,
          validate: { params: expect.any(Object) },
          isDeprecated: false,
          source: 'stack',
        },
        {
          id: 'my-connector-type-with-subaction',
          name: 'My connector type with subaction',
          enabled: true,
          enabledInConfig: true,
          enabledInLicense: true,
          minimumLicenseRequired: 'basic',
          supportedFeatureIds: ['alerting'],
          isSystemActionType: false,
          validate: { params: expect.any(Object) },
          isDeprecated: false,
          source: 'stack',
        },
      ]);

      // check that validation works
      try {
        connectorTypes[0].validate?.params.schema.parse({ text: '' });
      } catch (err) {
        expect(err.message).toMatchInlineSnapshot(`
          "[
            {
              \\"origin\\": \\"string\\",
              \\"code\\": \\"too_small\\",
              \\"minimum\\": 1,
              \\"inclusive\\": true,
              \\"path\\": [
                \\"text\\"
              ],
              \\"message\\": \\"Too small: expected string to have >=1 characters\\"
            }
          ]"
        `);
      }
      try {
        connectorTypes[0].validate?.params.schema.parse({ another_field: 'test_message' });
      } catch (err) {
        expect(err.message).toMatchInlineSnapshot(`
          "[
            {
              \\"expected\\": \\"string\\",
              \\"code\\": \\"invalid_type\\",
              \\"path\\": [
                \\"text\\"
              ],
              \\"message\\": \\"Invalid input: expected string, received undefined\\"
            }
          ]"
        `);
      }
      try {
        connectorTypes[1].validate?.params.schema.parse({
          subAction: 'subaction1',
          subActionParams: { value: 3 },
        });
      } catch (err) {
        expect(err.message).toMatchInlineSnapshot(`
          "[
            {
              \\"origin\\": \\"number\\",
              \\"code\\": \\"too_small\\",
              \\"minimum\\": 5,
              \\"inclusive\\": true,
              \\"path\\": [
                \\"subActionParams\\",
                \\"value\\"
              ],
              \\"message\\": \\"Too small: expected number to be >=5\\"
            }
          ]"
        `);
      }
      try {
        connectorTypes[1].validate?.params.schema.parse({
          subAction: 'subaction4',
          subActionParams: { value: 10 },
        });
      } catch (err) {
        expect(err.message).toMatchInlineSnapshot(`
          "[
            {
              \\"code\\": \\"invalid_union\\",
              \\"errors\\": [
                [
                  {
                    \\"code\\": \\"invalid_value\\",
                    \\"values\\": [
                      \\"subaction1\\"
                    ],
                    \\"path\\": [
                      \\"subAction\\"
                    ],
                    \\"message\\": \\"Invalid input: expected \\\\\\"subaction1\\\\\\"\\"
                  }
                ],
                [
                  {
                    \\"code\\": \\"invalid_value\\",
                    \\"values\\": [
                      \\"subaction2\\"
                    ],
                    \\"path\\": [
                      \\"subAction\\"
                    ],
                    \\"message\\": \\"Invalid input: expected \\\\\\"subaction2\\\\\\"\\"
                  },
                  {
                    \\"expected\\": \\"string\\",
                    \\"code\\": \\"invalid_type\\",
                    \\"path\\": [
                      \\"subActionParams\\",
                      \\"message\\"
                    ],
                    \\"message\\": \\"Invalid input: expected string, received undefined\\"
                  }
                ]
              ],
              \\"path\\": [],
              \\"message\\": \\"Invalid input\\"
            }
          ]"
        `);
      }
      expect(mockedActionsConfig.isActionTypeEnabled).toHaveBeenCalled();
      expect(mockedLicenseState.isLicenseValidForActionType).toHaveBeenCalled();
    });

    test('returns list of connector types filtered by feature id if provided', () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      actionTypeRegistry.register(getConnectorType());
      actionTypeRegistry.register(
        getConnectorType({
          id: 'another-connector-type',
          supportedFeatureIds: ['cases'],
        })
      );
      const connectorTypes = actionTypeRegistry.list({ featureId: 'alerting' });
      expect(connectorTypes).toEqual([
        {
          id: 'my-connector-type',
          name: 'My connector type',
          enabled: true,
          enabledInConfig: true,
          enabledInLicense: true,
          minimumLicenseRequired: 'basic',
          supportedFeatureIds: ['alerting'],
          isSystemActionType: false,
          isDeprecated: false,
          source: 'stack',
        },
      ]);
      expect(mockedActionsConfig.isActionTypeEnabled).toHaveBeenCalled();
      expect(mockedLicenseState.isLicenseValidForActionType).toHaveBeenCalled();
    });

    test('sets the isSystemActionType correctly for system connector', () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);

      actionTypeRegistry.register(
        getConnectorType({
          id: 'test.system-action',
          name: 'Cases',
          minimumLicenseRequired: 'platinum',
          isSystemActionType: true,
        })
      );

      const connectorTypes = actionTypeRegistry.list();

      expect(connectorTypes).toEqual([
        {
          id: 'test.system-action',
          name: 'Cases',
          enabled: true,
          enabledInConfig: true,
          enabledInLicense: true,
          minimumLicenseRequired: 'platinum',
          supportedFeatureIds: ['alerting'],
          isSystemActionType: true,
          isDeprecated: false,
          source: 'stack',
        },
      ]);
    });

    test('sets the subFeature correctly for sub-feature type connectors', () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);

      actionTypeRegistry.register(
        getConnectorType({
          id: 'test.sub-feature-connector',
          name: 'Test',
          minimumLicenseRequired: 'platinum',
          supportedFeatureIds: ['siem'],
          getKibanaPrivileges: () => ['test/create-sub-feature'],
          subFeature: 'endpointSecurity',
        })
      );

      const connectorTypes = actionTypeRegistry.list();

      expect(connectorTypes).toEqual([
        {
          enabled: true,
          enabledInConfig: true,
          enabledInLicense: true,
          id: 'test.sub-feature-connector',
          isSystemActionType: false,
          minimumLicenseRequired: 'platinum',
          name: 'Test',
          subFeature: 'endpointSecurity',
          supportedFeatureIds: ['siem'],
          isDeprecated: false,
          source: 'stack',
        },
      ]);
    });
  });

  describe('has()', () => {
    test('returns false for unregistered connector types', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      expect(actionTypeRegistry.has('my-connector-type')).toEqual(false);
    });

    test('returns true after registering an connector type', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      actionTypeRegistry.register(getConnectorType());
      expect(actionTypeRegistry.has('my-connector-type'));
    });
  });

  describe('isActionTypeEnabled', () => {
    let actionTypeRegistry: ActionTypeRegistry;

    const systemActionType: ActionType = {
      ...fooActionType,
      id: 'system-connector-type',
      name: 'System connector type',
      isSystemActionType: true,
    };

    beforeEach(() => {
      actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      actionTypeRegistry.register(fooActionType);
      actionTypeRegistry.register(systemActionType);
    });

    test('should call isActionTypeEnabled of the actions config', async () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      actionTypeRegistry.isActionTypeEnabled('foo');
      expect(mockedActionsConfig.isActionTypeEnabled).toHaveBeenCalledWith('foo');
    });

    test('should call isActionExecutable of the actions config', async () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      actionTypeRegistry.isActionExecutable('my-slack1', 'foo');
      expect(mockedActionsConfig.isActionTypeEnabled).toHaveBeenCalledWith('foo');
    });

    test('should return true when isActionTypeEnabled is false and isLicenseValidForActionType is true and it has preconfigured connectors', async () => {
      mockedActionsConfig.isActionTypeEnabled.mockReturnValue(false);
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });

      expect(actionTypeRegistry.isActionExecutable('my-slack1', 'foo')).toEqual(true);
    });

    test('should return true when isActionTypeEnabled is false and isLicenseValidForActionType is true and it has system connectors', async () => {
      mockedActionsConfig.isActionTypeEnabled.mockReturnValue(false);
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });

      expect(
        actionTypeRegistry.isActionExecutable(
          'system-connector-test.system-action',
          'system-connector-type'
        )
      ).toEqual(true);
    });

    test('should call isLicenseValidForActionType of the license state with notifyUsage false by default', async () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      actionTypeRegistry.isActionTypeEnabled('foo');
      expect(mockedLicenseState.isLicenseValidForActionType).toHaveBeenCalledWith(fooActionType, {
        notifyUsage: false,
      });
    });

    test('should call isLicenseValidForActionType of the license state with notifyUsage true when specified', async () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      actionTypeRegistry.isActionTypeEnabled('foo', { notifyUsage: true });
      expect(mockedLicenseState.isLicenseValidForActionType).toHaveBeenCalledWith(fooActionType, {
        notifyUsage: true,
      });
    });

    test('should return false when isActionTypeEnabled is false and isLicenseValidForActionType is true', async () => {
      mockedActionsConfig.isActionTypeEnabled.mockReturnValue(false);
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      expect(actionTypeRegistry.isActionTypeEnabled('foo')).toEqual(false);
    });

    test('should return false when isActionTypeEnabled is true and isLicenseValidForActionType is false', async () => {
      mockedActionsConfig.isActionTypeEnabled.mockReturnValue(true);
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({
        isValid: false,
        reason: 'invalid',
      });
      expect(actionTypeRegistry.isActionTypeEnabled('foo')).toEqual(false);
    });
  });

  describe('ensureActionTypeEnabled', () => {
    let actionTypeRegistry: ActionTypeRegistry;

    beforeEach(() => {
      actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      actionTypeRegistry.register(fooActionType);
    });

    test('should call ensureActionTypeEnabled of the action config', async () => {
      actionTypeRegistry.ensureActionTypeEnabled('foo');
      expect(mockedActionsConfig.ensureActionTypeEnabled).toHaveBeenCalledWith('foo');
    });

    test('should call ensureLicenseForActionType on the license state', async () => {
      actionTypeRegistry.ensureActionTypeEnabled('foo');
      expect(mockedLicenseState.ensureLicenseForActionType).toHaveBeenCalledWith(fooActionType);
    });

    test('should throw when ensureActionTypeEnabled throws', async () => {
      mockedActionsConfig.ensureActionTypeEnabled.mockImplementation(() => {
        throw new Error('Fail');
      });
      expect(() =>
        actionTypeRegistry.ensureActionTypeEnabled('foo')
      ).toThrowErrorMatchingInlineSnapshot(`"Fail"`);
    });

    test('should throw when ensureLicenseForActionType throws', async () => {
      mockedLicenseState.ensureLicenseForActionType.mockImplementation(() => {
        throw new Error('Fail');
      });
      expect(() =>
        actionTypeRegistry.ensureActionTypeEnabled('foo')
      ).toThrowErrorMatchingInlineSnapshot(`"Fail"`);
    });
  });

  describe('isActionExecutable()', () => {
    let actionTypeRegistry: ActionTypeRegistry;

    beforeEach(() => {
      actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      actionTypeRegistry.register(fooActionType);
      // @ts-expect-error accessing private property for testing
      actionTypeRegistry.inMemoryConnectors.push({
        ...fooActionType,
        id: 'foo-preconfig',
        name: 'Foo-preconfig',
        actionTypeId: 'foo',
        isPreconfigured: true,
        config: {},
        secrets: {},
      });
      // @ts-expect-error accessing private property for testing
      actionTypeRegistry.inMemoryConnectors.push({
        ...fooActionType,
        id: 'foo-system',
        name: 'Foo-system',
        actionTypeId: 'foo',
        isSystemAction: true,
        config: {},
        secrets: {},
      });
    });

    test('should call isLicenseValidForActionType of the license state with notifyUsage false by default', async () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      actionTypeRegistry.isActionExecutable('123', 'foo');
      expect(mockedLicenseState.isLicenseValidForActionType).toHaveBeenCalledWith(fooActionType, {
        notifyUsage: false,
      });
    });

    test('should call isLicenseValidForActionType of the license state with notifyUsage true when specified', async () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      actionTypeRegistry.isActionExecutable('123', 'foo', { notifyUsage: true });
      expect(mockedLicenseState.isLicenseValidForActionType).toHaveBeenCalledWith(fooActionType, {
        notifyUsage: true,
      });
    });

    test('should return true for enabled type', async () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      const result = actionTypeRegistry.isActionExecutable('123', 'foo');
      expect(result).toEqual(true);
    });

    test('should return false when license invalid', async () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({
        isValid: false,
        reason: 'invalid',
      });
      const result = actionTypeRegistry.isActionExecutable('123', 'foo');
      expect(result).toEqual(false);
    });

    test('should return true for disabled type, but preconfigured connector', async () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      mockedActionsConfig.isActionTypeEnabled.mockReturnValue(false);
      const result = actionTypeRegistry.isActionExecutable('foo-preconfig', 'foo');
      expect(result).toEqual(true);
    });

    test('should return true for disabled type, but system connector', async () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      mockedActionsConfig.isActionTypeEnabled.mockReturnValue(false);
      const result = actionTypeRegistry.isActionExecutable('foo-system', 'foo');
      expect(result).toEqual(true);
    });
  });

  describe('getAllTypes()', () => {
    test('should return empty when nothing is registered', () => {
      const registry = new ActionTypeRegistry(actionTypeRegistryParams);
      const result = registry.getAllTypes();
      expect(result).toEqual([]);
    });

    test('should return list of registered type ids', () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });
      const registry = new ActionTypeRegistry(actionTypeRegistryParams);
      registry.register(fooActionType);
      const result = registry.getAllTypes();
      expect(result).toEqual(['foo']);
    });
  });

  describe('isSystemActionType()', () => {
    it('should return true if the action type is a system action type', () => {
      const registry = new ActionTypeRegistry(actionTypeRegistryParams);

      registry.register(
        getConnectorType({
          id: 'test.system-action',
          name: 'Cases',
          minimumLicenseRequired: 'platinum',
          isSystemActionType: true,
        })
      );

      const result = registry.isSystemActionType('test.system-action');
      expect(result).toBe(true);
    });

    it('should return false if the action type is not a system action type', () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });

      const registry = new ActionTypeRegistry(actionTypeRegistryParams);

      registry.register(getConnectorType({ id: 'foo', name: 'Foo' }));

      const allTypes = registry.getAllTypes();
      expect(allTypes.length).toBe(1);

      const result = registry.isSystemActionType('foo');
      expect(result).toBe(false);
    });

    it('should return false if the action type does not exists', () => {
      const registry = new ActionTypeRegistry(actionTypeRegistryParams);

      const allTypes = registry.getAllTypes();
      expect(allTypes.length).toBe(0);

      const result = registry.isSystemActionType('not-exist');
      expect(result).toBe(false);
    });
  });

  describe('hasSubFeature()', () => {
    it('should return true if the action type has a sub-feature type', () => {
      const registry = new ActionTypeRegistry(actionTypeRegistryParams);

      registry.register(
        getConnectorType({
          id: 'test.sub-feature-action',
          name: 'Test',
          minimumLicenseRequired: 'platinum',
          supportedFeatureIds: ['siem'],
          getKibanaPrivileges: () => ['test/create-sub-feature'],
          subFeature: 'endpointSecurity',
        })
      );

      const result = registry.hasSubFeature('test.sub-feature-action');
      expect(result).toBe(true);
    });

    it('should return false if the action type does not have a sub-feature type', () => {
      mockedLicenseState.isLicenseValidForActionType.mockReturnValue({ isValid: true });

      const registry = new ActionTypeRegistry(actionTypeRegistryParams);

      registry.register(fooActionType);

      const allTypes = registry.getAllTypes();
      expect(allTypes.length).toBe(1);

      const result = registry.hasSubFeature('foo');
      expect(result).toBe(false);
    });

    it('should return false if the action type does not exists', () => {
      const registry = new ActionTypeRegistry(actionTypeRegistryParams);

      const allTypes = registry.getAllTypes();
      expect(allTypes.length).toBe(0);

      const result = registry.hasSubFeature('not-exist');
      expect(result).toBe(false);
    });
  });

  describe('getActionKibanaPrivileges()', () => {
    it('should get the kibana privileges correctly', () => {
      const registry = new ActionTypeRegistry(actionTypeRegistryParams);

      registry.register(
        getConnectorType({
          id: 'test.system-action',
          name: 'Cases',
          minimumLicenseRequired: 'platinum',
          getKibanaPrivileges: () => ['test/create'],
          isSystemActionType: true,
        })
      );
      registry.register(
        getConnectorType({
          id: 'test.sub-feature-action',
          name: 'Test',
          minimumLicenseRequired: 'platinum',
          supportedFeatureIds: ['siem'],
          getKibanaPrivileges: () => ['test/create-sub-feature'],
          subFeature: 'endpointSecurity',
        })
      );

      let result = registry.getActionKibanaPrivileges('test.system-action');
      expect(result).toEqual(['test/create']);
      result = registry.getActionKibanaPrivileges('test.sub-feature-action');
      expect(result).toEqual(['test/create-sub-feature']);
    });

    it('should return an empty array if the action type does not define any kibana privileges', () => {
      const registry = new ActionTypeRegistry(actionTypeRegistryParams);

      registry.register(
        getConnectorType({
          id: 'test.system-action',
          name: 'Cases',
          minimumLicenseRequired: 'platinum',
          isSystemActionType: true,
        })
      );
      registry.register(
        getConnectorType({
          id: 'test.sub-feature-action',
          name: 'Test',
          minimumLicenseRequired: 'platinum',
          supportedFeatureIds: ['siem'],
          subFeature: 'endpointSecurity',
        })
      );

      let result = registry.getActionKibanaPrivileges('test.system-action');
      expect(result).toEqual([]);
      result = registry.getActionKibanaPrivileges('test.sub-feature-action');
      expect(result).toEqual([]);
    });

    it('should return an empty array if the action type is not a system action or a sub-feature type action', () => {
      const registry = new ActionTypeRegistry(actionTypeRegistryParams);

      registry.register(fooActionType);

      const result = registry.getActionKibanaPrivileges('foo');
      expect(result).toEqual([]);
    });

    it('should pass the params and source correctly', () => {
      const registry = new ActionTypeRegistry(actionTypeRegistryParams);
      const getKibanaPrivileges = jest.fn().mockReturnValue(['test/create']);

      registry.register(
        getConnectorType({
          id: 'test.system-action',
          name: 'Cases',
          minimumLicenseRequired: 'platinum',
          getKibanaPrivileges,
          isSystemActionType: true,
        })
      );

      registry.getActionKibanaPrivileges(
        'test.system-action',
        { foo: 'bar' },
        ActionExecutionSourceType.HTTP_REQUEST
      );
      expect(getKibanaPrivileges).toHaveBeenCalledWith({
        params: { foo: 'bar' },
        source: ActionExecutionSourceType.HTTP_REQUEST,
      });
    });
  });

  describe('isDeprecated', () => {
    it('should return true if the action type is deprecated', () => {
      const registry = new ActionTypeRegistry(actionTypeRegistryParams);

      registry.register(
        getConnectorType({
          id: 'test.action',
          name: 'Cases',
          minimumLicenseRequired: 'platinum',
          isSystemActionType: false,
          isDeprecated: true,
        })
      );

      const result = registry.isDeprecated('test.action');
      expect(result).toBe(true);
    });
  });

  describe('register() - optional executor and params', () => {
    const defaultValidateNoParams = {
      config: { schema: z.object({}) },
      secrets: { schema: z.object({}) },
    };

    it('allows workflows-only connectors to be registered without executor and params', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      const workflowsConnector = getConnectorType({
        id: 'workflows-connector',
        name: 'Workflows Connector',
        supportedFeatureIds: ['workflows'],
        executor: undefined,
        validate: defaultValidateNoParams,
      });

      expect(() => actionTypeRegistry.register(workflowsConnector)).not.toThrow();
      expect(actionTypeRegistry.has('workflows-connector')).toBe(true);
      expect(mockTaskManager.registerTaskDefinitions).not.toHaveBeenCalled();
    });

    it('skips task registration for workflows connectors without executor and params', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      mockTaskManager.registerTaskDefinitions.mockClear();

      const workflowsConnector = getConnectorType({
        id: 'workflows-connector-no-executor-params',
        name: 'Workflows Connector No Executor Params',
        supportedFeatureIds: ['workflows'],
        executor: undefined,
        validate: defaultValidateNoParams,
      });

      actionTypeRegistry.register(workflowsConnector);

      expect(mockTaskManager.registerTaskDefinitions).not.toHaveBeenCalled();
    });

    it('requires both executor and params for connectors with multiple feature IDs including workflows', () => {
      const actionTypeRegistry = new ActionTypeRegistry(actionTypeRegistryParams);
      const workflowsConnector = getConnectorType({
        id: 'workflows-connector-multi-feature',
        name: 'Workflows Connector Multi Feature',
        supportedFeatureIds: ['workflows', 'alerting'],
      });
      // Keep both executor and params for multi-feature connectors
      expect(() => actionTypeRegistry.register(workflowsConnector)).not.toThrow();
      expect(actionTypeRegistry.has('workflows-connector-multi-feature')).toBe(true);
      expect(mockTaskManager.registerTaskDefinitions).toHaveBeenCalled();
    });
  });
});
