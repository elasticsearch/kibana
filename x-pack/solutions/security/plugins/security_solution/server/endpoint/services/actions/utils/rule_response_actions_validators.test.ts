/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createMockEndpointAppContextService } from '../../../mocks';
import type {
  ResponseAction,
  RuleResponseAction,
} from '../../../../../common/api/detection_engine';
import type { DeepPartial } from 'utility-types';
import { merge } from 'lodash';
import type { ValidateRuleResponseActionsOptions } from './rule_response_actions_validators';
import {
  validateRuleImportResponseActions,
  validateRuleResponseActions,
} from './rule_response_actions_validators';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import type { EndpointAuthz } from '../../../../../common/endpoint/types/authz';
import { getRuleMock } from '../../../../lib/detection_engine/routes/__mocks__/request_responses';
import type { RuleAlertType } from '../../../../lib/detection_engine/rule_schema';
import { getQueryRuleParams } from '../../../../lib/detection_engine/rule_schema/model/rule_schemas.mock';
import type { EnabledAutomatedResponseActionsCommands } from '../../../../../common/endpoint/service/response_actions/constants';
import type { ScriptsLibraryClientInterface } from '../../scripts_library';

describe('Rules Endpoint response actions validators', () => {
  let endpointService: ReturnType<typeof createMockEndpointAppContextService>;
  let endpointAuthz: EndpointAuthz;
  let rulePayload: ValidateRuleResponseActionsOptions['rulePayload'];
  let existingRule: RuleAlertType;

  const createRulePayloadResponseActionMock = (
    overrides: DeepPartial<ResponseAction> = {}
  ): ResponseAction => {
    return merge(
      {
        action_type_id: '.endpoint',
        params: {
          command: 'isolate',
          config: undefined,
        },
      },
      overrides as ResponseAction
    );
  };

  const createExistingRuleResponseActionMock = (): RuleResponseAction => {
    return {
      actionTypeId: '.endpoint',
      params: {
        command: 'isolate',
        config: undefined,
      },
    } as RuleResponseAction;
  };

  beforeEach(async () => {
    endpointService = createMockEndpointAppContextService();
    endpointAuthz = await endpointService.getEndpointAuthz(httpServerMock.createKibanaRequest());
    rulePayload = { response_actions: [createRulePayloadResponseActionMock()] };
    existingRule = getRuleMock(getQueryRuleParams());
    // @ts-expect-error assignment to readonly is ok here
    // eslint-disable-next-line require-atomic-updates
    endpointService.experimentalFeatures.responseActionsEndpointAutomatedRunScript = true;
  });

  describe('validateRuleResponseActions()', () => {
    let options: ValidateRuleResponseActionsOptions;

    beforeEach(() => {
      options = {
        rulePayload,
        endpointService,
        endpointAuthz,
        spaceId: 'foo',
      };
    });

    it('should succeed when rule payload has no actions and there is no existing rule', async () => {
      options.rulePayload = {};

      await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
    });

    it('should succeed when both rule payload and existing rule have no actions', async () => {
      existingRule.params.responseActions = [];
      options.existingRule = existingRule;
      options.rulePayload = {};

      await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
    });

    it('should validate both .endpoint and .osquery response actions independently', async () => {
      endpointAuthz.canIsolateHost = false;
      const mockOsqueryAuthz = jest.fn().mockResolvedValue(undefined);
      rulePayload.response_actions = [
        { action_type_id: '.osquery', params: { query: 'SELECT 1' } },
        createRulePayloadResponseActionMock(),
      ];
      options.checkOsqueryResponseActionAuthz = mockOsqueryAuthz;

      await expect(validateRuleResponseActions(options)).rejects.toThrow(
        'User is not authorized to create/update isolate response action'
      );
      // Osquery authz was still called for the osquery action
      expect(mockOsqueryAuthz).toHaveBeenCalledTimes(1);
    });

    interface AuthzTestCase {
      actionName: EnabledAutomatedResponseActionsCommands;
      permission: keyof EndpointAuthz;
      responseAction: ResponseAction;
    }
    const getAuthzTests = (): AuthzTestCase[] => [
      {
        actionName: 'isolate',
        permission: 'canIsolateHost',
        responseAction: createRulePayloadResponseActionMock({ params: { command: 'isolate' } }),
      },
      {
        actionName: 'kill-process',
        permission: 'canKillProcess',
        responseAction: createRulePayloadResponseActionMock({
          params: { command: 'kill-process', config: { overwrite: true } },
        }),
      },
      {
        actionName: 'suspend-process',
        permission: 'canSuspendProcess',
        responseAction: createRulePayloadResponseActionMock({
          params: { command: 'suspend-process', config: { overwrite: true } },
        }),
      },
      {
        actionName: 'runscript',
        permission: 'canWriteExecuteOperations',
        responseAction: createRulePayloadResponseActionMock({
          params: {
            command: 'runscript',
            config: {
              linux: {
                scriptId: '1-2-3',
              },
              macos: { scriptId: '' },
              windows: { scriptId: '' },
            },
          },
        }),
      },
    ];

    it.each(getAuthzTests())(
      `should error if user does not have authz to $actionName response action`,
      async ({ actionName, responseAction, permission }) => {
        rulePayload.response_actions = [responseAction];
        endpointAuthz[permission as keyof EndpointAuthz] = false;

        await expect(validateRuleResponseActions(options)).rejects.toThrow(
          `User is not authorized to create/update ${actionName} response action`
        );
      }
    );

    it.each(getAuthzTests())(
      `should NOT error if user has authz to $actionName response action`,
      async ({ responseAction, permission }) => {
        rulePayload.response_actions = [responseAction];
        endpointAuthz[permission as keyof EndpointAuthz] = true;

        await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
      }
    );

    it('should succeed if response actions have not been changed between payload and existing rule and user has no Authz', async () => {
      endpointAuthz.canIsolateHost = false;
      options.existingRule = existingRule;
      existingRule.params.responseActions = [createExistingRuleResponseActionMock()];

      await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
    });

    it('should error if user has no authz and is updating existing rule', async () => {
      rulePayload.response_actions = [];
      existingRule.params.responseActions = [createExistingRuleResponseActionMock()];
      options.existingRule = existingRule;
      endpointAuthz.canIsolateHost = false;

      await expect(validateRuleResponseActions(options)).rejects.toThrow(
        'User is not authorized to create/update isolate response action'
      );
    });

    describe('and response action is kill/suspend process', () => {
      it('should error if `field` is defined but `overwrite` is `true`', async () => {
        rulePayload.response_actions = [
          createRulePayloadResponseActionMock({
            params: { command: 'kill-process', config: { field: 'foo', overwrite: true } },
          }),
        ];

        await expect(validateRuleResponseActions(options)).rejects.toThrow(
          "Invalid [kill-process] response action configuration: 'field' is not allowed when 'overwrite' is 'true'"
        );
      });

      it('should error if `overwrite` is `false` and no `field` is provided', async () => {
        rulePayload.response_actions = [
          createRulePayloadResponseActionMock({
            params: { command: 'kill-process', config: { overwrite: false } },
          }),
        ];

        await expect(validateRuleResponseActions(options)).rejects.toThrow(
          "Invalid [kill-process] response action configuration: 'field' is required when 'overwrite' is 'false'"
        );
      });
    });

    describe('and response action has `kill_descendants`', () => {
      // Builds a kill/suspend process action while allowing an arbitrary (possibly invalid)
      // `kill_descendants` value so that the validator's runtime type check can be exercised.
      const createProcessActionWithKillDescendants = (
        command: 'kill-process' | 'suspend-process',
        killDescendants: unknown
      ): ResponseAction =>
        createRulePayloadResponseActionMock({
          params: {
            command,
            config: { overwrite: true, kill_descendants: killDescendants as boolean },
          },
        } as ResponseAction);

      beforeEach(() => {
        // @ts-expect-error assignment to readonly is ok here
        endpointService.experimentalFeatures.responseActionsEndpointKillProcessDescendants = true;
      });

      it.each([true, false])(
        'should succeed when `kill_descendants` is `%s`',
        async (killDescendants) => {
          rulePayload.response_actions = [
            createProcessActionWithKillDescendants('kill-process', killDescendants),
          ];

          await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
        }
      );

      it('should succeed when `kill_descendants` is not defined', async () => {
        rulePayload.response_actions = [
          createRulePayloadResponseActionMock({
            params: { command: 'kill-process', config: { overwrite: true } },
          }),
        ];

        await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
      });

      it('should error when `kill_descendants` is not a boolean', async () => {
        rulePayload.response_actions = [
          createProcessActionWithKillDescendants('kill-process', 'not-a-boolean'),
        ];

        await expect(validateRuleResponseActions(options)).rejects.toThrow(
          "Invalid [kill-process] response action configuration: 'kill_descendants' must be a boolean"
        );
      });

      it('should NOT validate `kill_descendants` when the feature flag is disabled', async () => {
        // @ts-expect-error assignment to readonly is ok here
        endpointService.experimentalFeatures.responseActionsEndpointKillProcessDescendants = false;
        rulePayload.response_actions = [
          createProcessActionWithKillDescendants('kill-process', 'not-a-boolean'),
        ];

        await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
      });

      it('should NOT validate `kill_descendants` for the suspend-process command', async () => {
        rulePayload.response_actions = [
          createProcessActionWithKillDescendants('suspend-process', 'not-a-boolean'),
        ];

        await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
      });
    });

    describe('and response action is runscript', () => {
      let scriptsClientMock: jest.Mocked<ScriptsLibraryClientInterface>;

      beforeEach(() => {
        scriptsClientMock = endpointService.getScriptsLibraryClient(
          'default',
          'foo'
        ) as jest.Mocked<ScriptsLibraryClientInterface>;
      });

      it('should error if all OS script IDs are empty strings', async () => {
        rulePayload.response_actions = [
          createRulePayloadResponseActionMock({
            params: {
              command: 'runscript',
              config: {
                linux: { scriptId: '' },
                macos: { scriptId: '' },
                windows: { scriptId: '' },
              },
            },
          }),
        ];

        await expect(validateRuleResponseActions(options)).rejects.toThrow(
          'Invalid [runscript] response action configuration: no scripts specified'
        );
      });

      it('should error if all OS script IDs are undefined', async () => {
        rulePayload.response_actions = [
          createRulePayloadResponseActionMock({
            params: {
              command: 'runscript',
              config: {
                linux: {},
                macos: {},
                windows: {},
              },
            },
          }),
        ];

        await expect(validateRuleResponseActions(options)).rejects.toThrow(
          'Invalid [runscript] response action configuration: no scripts specified'
        );
      });

      it('should succeed when at least one OS has a valid script ID', async () => {
        rulePayload.response_actions = [
          createRulePayloadResponseActionMock({
            params: {
              command: 'runscript',
              config: {
                linux: { scriptId: '1-2-3' },
                macos: { scriptId: '' },
                windows: { scriptId: '' },
              },
            },
          }),
        ];

        await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
      });

      it('should succeed when multiple OS platforms have valid script IDs', async () => {
        rulePayload.response_actions = [
          createRulePayloadResponseActionMock({
            params: {
              command: 'runscript',
              config: {
                linux: { scriptId: '1-2-3' },
                macos: { scriptId: '1-2-3' },
                windows: { scriptId: '' },
              },
            },
          }),
        ];

        await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
      });

      it('should error if any of the script IDs are invalid', async () => {
        rulePayload.response_actions = [
          createRulePayloadResponseActionMock({
            params: {
              command: 'runscript',
              config: {
                linux: { scriptId: '1-2-3' },
                macos: { scriptId: '1-2-3' },
                windows: { scriptId: '3-2-1' },
              },
            },
          }),
        ];

        await expect(validateRuleResponseActions(options)).rejects.toThrow(
          'Invalid [windows] [runscript] response action configuration: script [3-2-1] not found'
        );
        // Call to client should de-dup IDs
        expect(scriptsClientMock.list).toHaveBeenCalledWith({ kuery: 'id:("1-2-3" OR "3-2-1")' });
      });

      it('should error if script does not support specified OS type', async () => {
        rulePayload.response_actions = [
          createRulePayloadResponseActionMock({
            params: {
              command: 'runscript',
              config: {
                linux: { scriptId: '' },
                macos: { scriptId: '' },
                windows: { scriptId: '1-2-3' },
              },
            },
          }),
        ];

        await expect(validateRuleResponseActions(options)).rejects.toThrow(
          "Invalid [windows] [runscript] response action configuration: script [1-2-3, script one] is not compatible with host OS 'windows']"
        );
      });

      it('should error if script requires input arguments but none were defined', async () => {
        const listResponse = await scriptsClientMock.list();
        listResponse.data[0].requiresInput = true;
        scriptsClientMock.list.mockResolvedValue(listResponse);

        rulePayload.response_actions = [
          createRulePayloadResponseActionMock({
            params: {
              command: 'runscript',
              config: {
                linux: { scriptId: '1-2-3' },
                macos: { scriptId: '' },
                windows: { scriptId: '' },
              },
            },
          }),
        ];

        await expect(validateRuleResponseActions(options)).rejects.toThrow(
          'Invalid [linux] [runscript] response action configuration: script [1-2-3, script one] requires input but no input was provided'
        );
      });

      it('should succeed with script that requires input arguments and they are defined on rule payload', async () => {
        const listResponse = await scriptsClientMock.list();
        listResponse.data[0].requiresInput = true;
        scriptsClientMock.list.mockResolvedValue(listResponse);

        rulePayload.response_actions = [
          createRulePayloadResponseActionMock({
            params: {
              command: 'runscript',
              config: {
                linux: { scriptId: '1-2-3', scriptInput: 'foo' },
                macos: { scriptId: '' },
                windows: { scriptId: '' },
              },
            },
          }),
        ];

        await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
      });

      it('should only validate script ID if it is included in rule update payload', async () => {
        // IDs in existing rule that are not being used in rule update should not have a need to be validated
        rulePayload.response_actions = [];
        existingRule.params.responseActions = [
          {
            actionTypeId: '.endpoint',
            params: {
              command: 'runscript',
              config: {
                linux: { scriptId: '1-2-3' },
                macos: { scriptId: '' },
                windows: { scriptId: '' },
              },
            },
          },
        ];

        await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
        expect(scriptsClientMock.list).not.toHaveBeenCalled();
      });
    });
  });

  describe('validateRuleImportResponseActions()', () => {
    it('should return list of valid rules and list of errors', async () => {
      endpointAuthz.canIsolateHost = false;

      const rulesToImport = [
        // Valid rule with multiple actions
        {
          response_actions: [
            createRulePayloadResponseActionMock({
              params: { command: 'suspend-process', config: { overwrite: true } },
            }),
            createRulePayloadResponseActionMock({
              params: { command: 'kill-process', config: { overwrite: true } },
            }),
          ],
          id: 'foo',
          rule_id: 'bar',
        },
        // Invalid rule: kill-process action with no `field` defined
        {
          response_actions: [
            createRulePayloadResponseActionMock({
              params: { command: 'kill-process', config: { overwrite: false, field: '' } },
            }),
          ],
          id: 'foo2',
          rule_id: 'bar2',
        },
        // Invalid rule: user has no Isolate permission
        {
          response_actions: [createRulePayloadResponseActionMock()],
          id: 'foo3',
          rule_id: 'foo3',
        },
      ];

      await expect(
        validateRuleImportResponseActions({
          endpointAuthz,
          endpointService,
          spaceId: 'foo',
          rulesToImport,
        })
      ).resolves.toMatchInlineSnapshot(`
        Object {
          "errors": Array [
            Object {
              "error": Object {
                "message": "Invalid [kill-process] response action configuration: 'field' is required when 'overwrite' is 'false'",
                "status_code": 400,
              },
              "id": "foo2",
              "rule_id": "bar2",
            },
            Object {
              "error": Object {
                "message": "User is not authorized to create/update isolate response action",
                "status_code": 403,
              },
              "id": "foo3",
              "rule_id": "foo3",
            },
          ],
          "valid": Array [
            Object {
              "id": "foo",
              "response_actions": Array [
                Object {
                  "action_type_id": ".endpoint",
                  "params": Object {
                    "command": "suspend-process",
                    "config": Object {
                      "overwrite": true,
                    },
                  },
                },
                Object {
                  "action_type_id": ".endpoint",
                  "params": Object {
                    "command": "kill-process",
                    "config": Object {
                      "overwrite": true,
                    },
                  },
                },
              ],
              "rule_id": "bar",
            },
          ],
        }
      `);
    });
  });

  describe('osquery response actions validation', () => {
    let options: ValidateRuleResponseActionsOptions;
    let mockOsqueryAuthz: jest.Mock;

    beforeEach(() => {
      mockOsqueryAuthz = jest.fn().mockResolvedValue(undefined);
      options = {
        rulePayload: {
          response_actions: [
            {
              action_type_id: '.osquery' as const,
              params: { query: 'SELECT * FROM processes' },
            },
          ],
        },
        endpointService,
        endpointAuthz,
        spaceId: 'foo',
        checkOsqueryResponseActionAuthz: mockOsqueryAuthz,
      };
    });

    it('should call osquery authz checker for .osquery actions', async () => {
      await validateRuleResponseActions(options);

      expect(mockOsqueryAuthz).toHaveBeenCalledWith({
        saved_query_id: undefined,
        pack_id: undefined,
        query: 'SELECT * FROM processes',
        queries: undefined,
        ecs_mapping: undefined,
      });
    });

    it('should pass saved_query_id to osquery authz checker', async () => {
      options.rulePayload = {
        response_actions: [
          {
            action_type_id: '.osquery' as const,
            params: { saved_query_id: 'test-saved-query' },
          },
        ],
      };

      await validateRuleResponseActions(options);

      expect(mockOsqueryAuthz).toHaveBeenCalledWith({
        saved_query_id: 'test-saved-query',
        pack_id: undefined,
        query: undefined,
        queries: undefined,
        ecs_mapping: undefined,
      });
    });

    it('should pass pack_id to osquery authz checker', async () => {
      options.rulePayload = {
        response_actions: [
          {
            action_type_id: '.osquery' as const,
            params: { pack_id: 'test-pack' },
          },
        ],
      };

      await validateRuleResponseActions(options);

      expect(mockOsqueryAuthz).toHaveBeenCalledWith({
        saved_query_id: undefined,
        pack_id: 'test-pack',
        query: undefined,
        queries: undefined,
        ecs_mapping: undefined,
      });
    });

    it('should pass ecs_mapping to osquery authz checker', async () => {
      options.rulePayload = {
        response_actions: [
          {
            action_type_id: '.osquery' as const,
            params: {
              saved_query_id: 'test-saved-query',
              ecs_mapping: { 'host.name': { field: 'name' } },
            },
          },
        ],
      };

      await validateRuleResponseActions(options);

      expect(mockOsqueryAuthz).toHaveBeenCalledWith({
        saved_query_id: 'test-saved-query',
        pack_id: undefined,
        query: undefined,
        queries: undefined,
        ecs_mapping: { 'host.name': { field: 'name' } },
      });
    });

    it('should throw when osquery authz checker rejects', async () => {
      const authzError: Error & { statusCode?: number } = new Error(
        'User is not authorized to create/update osquery response action'
      );
      authzError.statusCode = 403;
      mockOsqueryAuthz.mockRejectedValue(authzError);

      await expect(validateRuleResponseActions(options)).rejects.toThrow(
        'User is not authorized to create/update osquery response action'
      );
    });

    it('should skip osquery validation when no authz checker is provided', async () => {
      delete options.checkOsqueryResponseActionAuthz;

      // Should not throw even though there are osquery actions
      await expect(validateRuleResponseActions(options)).resolves.toBeUndefined();
    });

    it('should handle camelCase params from existing rule (savedQueryId)', async () => {
      // Existing rule stores params in camelCase (RuleResponseOsqueryAction); the payload uses
      // snake_case. A modified action must still be authorized with the new payload values.
      options.rulePayload = {
        response_actions: [
          { action_type_id: '.osquery', params: { saved_query_id: 'new-saved-query' } },
        ],
      } as typeof options.rulePayload;
      existingRule.params.responseActions = [
        { actionTypeId: '.osquery', params: { savedQueryId: 'existing-saved-query' } },
      ] as RuleResponseAction[];
      options.existingRule = existingRule;

      await validateRuleResponseActions(options);

      expect(mockOsqueryAuthz).toHaveBeenCalledWith({
        saved_query_id: 'new-saved-query',
        pack_id: undefined,
        query: undefined,
        queries: undefined,
        ecs_mapping: undefined,
      });
    });

    it('should handle camelCase params from existing rule (packId)', async () => {
      options.rulePayload = {
        response_actions: [{ action_type_id: '.osquery', params: { pack_id: 'new-pack' } }],
      } as typeof options.rulePayload;
      existingRule.params.responseActions = [
        { actionTypeId: '.osquery', params: { packId: 'existing-pack' } },
      ] as RuleResponseAction[];
      options.existingRule = existingRule;

      await validateRuleResponseActions(options);

      expect(mockOsqueryAuthz).toHaveBeenCalledWith({
        saved_query_id: undefined,
        pack_id: 'new-pack',
        query: undefined,
        queries: undefined,
        ecs_mapping: undefined,
      });
    });

    it('should not re-authorize an osquery action that is being removed', async () => {
      // Removing the action must never be blocked: otherwise a saved query that is later
      // deleted or moved out of the space pins the action on the rule permanently.
      options.rulePayload = { response_actions: [] };
      existingRule.params.responseActions = [
        { actionTypeId: '.osquery', params: { savedQueryId: 'existing-saved-query' } },
      ] as RuleResponseAction[];
      options.existingRule = existingRule;

      await validateRuleResponseActions(options);

      expect(mockOsqueryAuthz).not.toHaveBeenCalled();
    });

    it('should not re-authorize an unchanged osquery action stored in camelCase', async () => {
      // The payload is snake_case and the stored copy camelCase; normalization must make
      // them compare equal so a no-op edit does not re-authorize the saved query.
      options.rulePayload = {
        response_actions: [
          { action_type_id: '.osquery', params: { saved_query_id: 'existing-saved-query' } },
        ],
      } as typeof options.rulePayload;
      existingRule.params.responseActions = [
        { actionTypeId: '.osquery', params: { savedQueryId: 'existing-saved-query' } },
      ] as RuleResponseAction[];
      options.existingRule = existingRule;

      await validateRuleResponseActions(options);

      expect(mockOsqueryAuthz).not.toHaveBeenCalled();
    });

    it('should not validate unchanged osquery actions on update', async () => {
      const osqueryAction = {
        action_type_id: '.osquery' as const,
        params: { query: 'SELECT * FROM processes' },
      };
      options.rulePayload = { response_actions: [osqueryAction] };
      existingRule.params.responseActions = [
        { actionTypeId: '.osquery', params: { query: 'SELECT * FROM processes' } },
      ] as RuleResponseAction[];
      options.existingRule = existingRule;

      await validateRuleResponseActions(options);

      // Osquery authz should not be called since the action is unchanged
      expect(mockOsqueryAuthz).not.toHaveBeenCalled();
    });
  });
});
