/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getScheduleNotificationResponseActionsService } from './schedule_notification_response_actions';
import type { RuleResponseAction } from '../../../../common/api/detection_engine';
import { ResponseActionTypesEnum } from '../../../../common/api/detection_engine';
import { ALERT_RULE_NAME, ALERT_RULE_UUID, SPACE_IDS } from '@kbn/rule-data-utils';
import { createMockEndpointAppContextService } from '../../../endpoint/mocks';
import { responseActionsClientMock } from '../../../endpoint/services/actions/clients/mocks';
import { asSpaceId, DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { Logger } from '@kbn/logging';
describe('ScheduleNotificationResponseActions', () => {
  const getSignals = () => [
    {
      agent: { id: 'agent-id-1', type: 'endpoint' },
      _id: 'alert-id-1',
      user: { id: 'S-1-5-20' },
      process: {
        pid: 123,
      },
      host: { os: { type: 'linux' } },
      [ALERT_RULE_UUID]: 'rule-id-1',
      [ALERT_RULE_NAME]: 'rule-name-1',
      [SPACE_IDS]: [DEFAULT_SPACE_ID],
    },
    { agent: { id: 'agent-id-2', type: 'endpoint' }, _id: 'alert-id-2' },
  ];

  const osqueryActionMock = {
    create: jest.fn().mockResolvedValue({}),
    // Osquery resolves the stored saved query / pack to decide whether this run substitutes
    // parameters, rather than trusting the copy persisted on the rule.
    containsDynamicQueries: jest.fn().mockResolvedValue(false),
    stop: jest.fn(),
    logger: {
      error: jest.fn(),
      warn: jest.fn(),
    } as unknown as Logger,
  };

  let mockedResponseActionsClient = responseActionsClientMock.create();
  const endpointServiceMock = createMockEndpointAppContextService();
  (endpointServiceMock.getInternalResponseActionsClient as jest.Mock).mockImplementation(() => {
    return mockedResponseActionsClient;
  });

  const scheduleNotificationResponseActions = getScheduleNotificationResponseActionsService({
    osqueryCreateActionService: osqueryActionMock,
    endpointAppContextService: endpointServiceMock,
  });

  describe('Osquery', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    const simpleQuery = 'select * from uptime';
    const defaultQueryParams = {
      ecsMapping: { testField: { field: 'testField', value: 'testValue' } },
      savedQueryId: 'testSavedQueryId',
      query: undefined,
      queries: [],
      packId: undefined,
    };
    const defaultPackParams = {
      packId: 'testPackId',
      queries: [],
      query: undefined,
      ecsMapping: { testField: { field: 'testField', value: 'testValue' } },
      savedQueryId: undefined,
    };
    const defaultQueries = {
      ecs_mapping: undefined,
      platform: 'windows',
      version: '1.0.0',
      snapshot: true,
      removed: false,
    };

    const defaultResultParams = {
      agent_ids: ['agent-id-1', 'agent-id-2'],
      alert_ids: ['alert-id-1', 'alert-id-2'],
      ecs_mapping: { testField: { field: 'testField', value: 'testValue' } },
      saved_query_id: 'testSavedQueryId',
      queries: [],
    };

    it('should pass correct space id from alert.kibana.space_ids[0] when space awareness is enabled', async () => {
      const signals = getSignals();
      await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions: [
          {
            actionTypeId: ResponseActionTypesEnum['.osquery'],
            params: { ...defaultQueryParams, queries: [{ id: 'query-1', query: simpleQuery }] },
          } as RuleResponseAction,
        ],
      });
      expect(osqueryActionMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          queries: expect.any(Array),
        }),
        expect.objectContaining({
          space: { id: DEFAULT_SPACE_ID },
        })
      );
    });

    it('should log error if space awareness is enabled and space id is missing', async () => {
      const signals = [{ ...getSignals()[0], [SPACE_IDS]: undefined }];
      await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions: [
          {
            actionTypeId: ResponseActionTypesEnum['.osquery'],
            params: { ...defaultQueryParams, queries: [{ id: 'query-1', query: simpleQuery }] },
          } as RuleResponseAction,
        ],
      });
      expect(osqueryActionMock.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unable to identify the space ID')
      );
      expect(osqueryActionMock.create).not.toHaveBeenCalled();
    });

    it('should handle errors from osqueryActionMock.create and log them', async () => {
      const signals = getSignals();
      const testError = new Error('Simulated create failure');
      osqueryActionMock.create.mockRejectedValueOnce(testError);

      await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions: [
          {
            actionTypeId: ResponseActionTypesEnum['.osquery'],
            params: { ...defaultQueryParams, queries: [{ id: 'query-1', query: simpleQuery }] },
          } as RuleResponseAction,
        ],
      });

      expect(osqueryActionMock.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Simulated create failure')
      );
    });

    it('should pass alertData when dynamic queries are present', async () => {
      const dynamicQuery = 'select * from uptime where id = {{host.id}}';
      const signals = getSignals();
      // The parameterization verdict now comes from osquery resolving the stored content.
      osqueryActionMock.containsDynamicQueries.mockResolvedValueOnce(true);
      await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions: [
          {
            actionTypeId: ResponseActionTypesEnum['.osquery'],
            params: { ...defaultQueryParams, queries: [{ id: 'query-1', query: dynamicQuery }] },
          } as RuleResponseAction,
        ],
      });
      expect(osqueryActionMock.create).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          alertData: expect.objectContaining({ _id: signals[0]._id }),
        })
      );
    });

    const defaultPackResultParams = {
      ...defaultResultParams,
      query: undefined,
      saved_query_id: undefined,
      ecs_mapping: { testField: { field: 'testField', value: 'testValue' } },
    };
    it('should handle osquery response actions with query', async () => {
      const signals = getSignals();
      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.osquery'],
          params: {
            ...defaultQueryParams,
            query: simpleQuery,
          },
        },
      ];
      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions,
      });

      expect(response).not.toBeUndefined();
      expect(osqueryActionMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_ids: ['agent-id-1', 'agent-id-2'],
          alert_ids: ['alert-id-1', 'alert-id-2'],
          ecs_mapping: { testField: { field: 'testField', value: 'testValue' } },
          queries: [],
          query: simpleQuery,
          saved_query_id: 'testSavedQueryId',
        }),
        expect.objectContaining({
          space: { id: DEFAULT_SPACE_ID },
        })
      );
    });

    it('should handle osquery response actions with packs', async () => {
      const signals = getSignals();

      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.osquery'],
          params: {
            ...defaultPackParams,
            queries: [
              {
                ...defaultQueries,
                id: 'query-1',
                query: simpleQuery,
              },
            ],
            packId: 'testPackId',
          },
        },
      ];
      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions,
      });

      expect(response).not.toBeUndefined();
      expect(osqueryActionMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...defaultPackResultParams,
          queries: [{ ...defaultQueries, id: 'query-1', query: simpleQuery }],
        }),
        expect.objectContaining({
          space: { id: DEFAULT_SPACE_ID },
        })
      );
    });
  });

  describe('Endpoint', () => {
    beforeEach(() => {
      (endpointServiceMock.getInternalResponseActionsClient as jest.Mock).mockClear();
      mockedResponseActionsClient = responseActionsClientMock.create();
    });

    it('should handle endpoint isolate actions', async () => {
      const signals = getSignals();

      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.endpoint'],
          params: {
            command: 'isolate',
            comment: 'test isolate comment',
          },
        },
      ];
      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions,
      });
      expect(response).not.toBeUndefined();
      expect(endpointServiceMock.getInternalResponseActionsClient).toHaveBeenCalledTimes(1);
      expect(endpointServiceMock.getInternalResponseActionsClient).toHaveBeenCalledWith({
        agentType: 'endpoint',
        username: 'unknown',
        spaceId: 'default',
      });
      expect(mockedResponseActionsClient.isolate).toHaveBeenCalledTimes(signals.length);
      expect(mockedResponseActionsClient.isolate).toHaveBeenNthCalledWith(
        1,
        {
          alert_ids: ['alert-id-1'],
          comment: 'test isolate comment',
          endpoint_ids: ['agent-id-1'],
          parameters: undefined,
        },
        {
          error: undefined,
          hosts: { 'agent-id-1': { id: 'agent-id-1', name: '' } },
          ruleId: 'rule-id-1',
          ruleName: 'rule-name-1',
        }
      );
    });
    it('should handle endpoint kill-process actions', async () => {
      const signals = getSignals();
      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.endpoint'],
          params: {
            command: 'kill-process',
            comment: 'test process comment',
            config: {
              overwrite: true,
              field: '',
            },
          },
        },
      ];
      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions,
      });

      expect(response).not.toBeUndefined();

      expect(mockedResponseActionsClient.killProcess).toHaveBeenCalledWith(
        {
          alert_ids: ['alert-id-1'],
          comment: 'test process comment',
          endpoint_ids: ['agent-id-1'],
          parameters: {
            pid: 123,
          },
        },
        {
          error: undefined,
          hosts: { 'agent-id-1': { id: 'agent-id-1', name: undefined } },
          ruleId: 'rule-id-1',
          ruleName: 'rule-name-1',
        }
      );
    });

    describe('and command is kill-process with `kill_descendants`', () => {
      const buildKillProcessResponseAction = (killDescendants?: boolean): RuleResponseAction => ({
        actionTypeId: ResponseActionTypesEnum['.endpoint'],
        params: {
          command: 'kill-process',
          comment: 'test process comment',
          config: {
            overwrite: true,
            field: '',
            ...(killDescendants === undefined ? {} : { kill_descendants: killDescendants }),
          },
        },
      });

      const getKillProcessParameters = (): Array<Record<string, unknown>> =>
        (mockedResponseActionsClient.killProcess as jest.Mock).mock.calls.map(
          ([requestBody]) => requestBody.parameters
        );

      afterEach(() => {
        // @ts-expect-error write to readonly prop is ok
        endpointServiceMock.experimentalFeatures.responseActionsEndpointKillProcessDescendants =
          false;
      });

      it('should pass `kill_descendants` when the feature flag is enabled and it is `true`', async () => {
        // @ts-expect-error write to readonly prop is ok
        endpointServiceMock.experimentalFeatures.responseActionsEndpointKillProcessDescendants =
          true;
        const signals = getSignals();

        await scheduleNotificationResponseActions({
          signals,
          signalsCount: signals.length,
          responseActions: [buildKillProcessResponseAction(true)],
        });

        expect(mockedResponseActionsClient.killProcess).toHaveBeenCalledWith(
          expect.objectContaining({
            endpoint_ids: ['agent-id-1'],
            parameters: { pid: 123, kill_descendants: true },
          }),
          expect.anything()
        );
      });

      it('should NOT pass `kill_descendants` when it is `false`', async () => {
        // @ts-expect-error write to readonly prop is ok
        endpointServiceMock.experimentalFeatures.responseActionsEndpointKillProcessDescendants =
          true;
        const signals = getSignals();

        await scheduleNotificationResponseActions({
          signals,
          signalsCount: signals.length,
          responseActions: [buildKillProcessResponseAction(false)],
        });

        expect(mockedResponseActionsClient.killProcess).toHaveBeenCalled();
        getKillProcessParameters().forEach((parameters) => {
          expect(parameters).not.toHaveProperty('kill_descendants');
        });
      });

      it('should NOT pass `kill_descendants` when it is not defined', async () => {
        // @ts-expect-error write to readonly prop is ok
        endpointServiceMock.experimentalFeatures.responseActionsEndpointKillProcessDescendants =
          true;
        const signals = getSignals();

        await scheduleNotificationResponseActions({
          signals,
          signalsCount: signals.length,
          responseActions: [buildKillProcessResponseAction()],
        });

        expect(mockedResponseActionsClient.killProcess).toHaveBeenCalled();
        getKillProcessParameters().forEach((parameters) => {
          expect(parameters).not.toHaveProperty('kill_descendants');
        });
      });

      it('should NOT pass `kill_descendants` when the feature flag is disabled', async () => {
        // @ts-expect-error write to readonly prop is ok
        endpointServiceMock.experimentalFeatures.responseActionsEndpointKillProcessDescendants =
          false;
        const signals = getSignals();

        await scheduleNotificationResponseActions({
          signals,
          signalsCount: signals.length,
          responseActions: [buildKillProcessResponseAction(true)],
        });

        expect(mockedResponseActionsClient.killProcess).toHaveBeenCalled();
        getKillProcessParameters().forEach((parameters) => {
          expect(parameters).not.toHaveProperty('kill_descendants');
        });
      });
    });

    it('should handle endpoint runscript actions', async () => {
      // @ts-expect-error write to readonly prop is ok
      endpointServiceMock.experimentalFeatures.responseActionsEndpointAutomatedRunScript = true;
      const signals = getSignals();
      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.endpoint'],
          params: {
            command: 'runscript',
            comment: 'test process comment',
            config: {
              linux: { scriptId: '1-2-3' },
              macos: {},
              windows: {},
            },
          },
        },
      ];
      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions,
      });

      expect(response).not.toBeUndefined();

      expect(mockedResponseActionsClient.runscript).toHaveBeenCalledWith(
        {
          alert_ids: ['alert-id-1'],
          comment: 'test process comment',
          endpoint_ids: ['agent-id-1'],
          parameters: {
            scriptId: '1-2-3',
            scriptInput: undefined,
            timeout: undefined,
          },
        },
        {
          error: undefined,
          hosts: { 'agent-id-1': { name: '' } },
          ruleId: 'rule-id-1',
          ruleName: 'rule-name-1',
        }
      );

      expect(mockedResponseActionsClient.runscript).toHaveBeenCalledWith(
        {
          alert_ids: ['alert-id-2'],
          comment: 'test process comment',
          endpoint_ids: ['agent-id-2'],
          parameters: {
            scriptId: 'error',
            scriptInput: undefined,
            timeout: undefined,
          },
        },
        {
          error: 'Unable to determine host OS type from alert [alert-id-2]',
          hosts: {
            'agent-id-2': {
              name: '',
            },
          },
          ruleId: '',
          ruleName: '',
        }
      );
    });

    it('should not  process runscript actions if feature flag is disabled', async () => {
      // @ts-expect-error write to readonly prop is ok
      endpointServiceMock.experimentalFeatures.responseActionsEndpointAutomatedRunScript = false;
      const signals = getSignals();
      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.endpoint'],
          params: {
            command: 'runscript',
            comment: 'test process comment',
            config: {
              linux: { scriptId: '1-2-3' },
              macos: {},
              windows: {},
            },
          },
        },
      ];
      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions,
      });

      expect(response).not.toBeUndefined();

      expect(mockedResponseActionsClient.runscript).not.toHaveBeenCalled();
    });

    it('should only attempt to send response actions to alerts from endpoint', async () => {
      const signals = getSignals();
      signals.push({ agent: { id: '123-432', type: 'filebeat' }, _id: '1' });
      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.endpoint'],
          params: {
            command: 'isolate',
            comment: 'test process comment',
          },
        },
      ];
      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions,
      });

      expect(response).not.toBeUndefined();
      expect(mockedResponseActionsClient.isolate).toHaveBeenCalledTimes(signals.length - 1);
    });
    it('should not call any action service if no response actions are provided', async () => {
      const response = await scheduleNotificationResponseActions({
        signals: getSignals(),
        signalsCount: 2,
        responseActions: [],
      });
      expect(response).toBeUndefined();
    });
    it('should  not call any action service if signalsCount is 0', async () => {
      const signals = getSignals();
      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.endpoint'],
          params: {
            command: 'isolate',
            comment: 'test process comment',
          },
        },
      ];

      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: 0,
        responseActions,
      });

      expect(response).toBeUndefined();
    });

    describe('and when space awareness is enabled', () => {
      it('should initialize a response action client with the alert space id when space awareness is enabled', async () => {
        const signals = getSignals();
        signals[0][SPACE_IDS] = [asSpaceId('foo')];
        await scheduleNotificationResponseActions({
          signals,
          signalsCount: 2,
          responseActions: [
            {
              actionTypeId: ResponseActionTypesEnum['.endpoint'],
              params: {
                command: 'isolate',
                comment: 'test process comment',
              },
            },
          ],
        });

        expect(endpointServiceMock.getInternalResponseActionsClient).toHaveBeenCalledWith(
          expect.objectContaining({ spaceId: 'foo' })
        );
      });

      it('should log error if unable to determine space id for alerts', async () => {
        const signals = getSignals();
        signals[0][SPACE_IDS] = undefined;
        await scheduleNotificationResponseActions({
          signals,
          signalsCount: 2,
          responseActions: [
            {
              actionTypeId: ResponseActionTypesEnum['.endpoint'],
              params: {
                command: 'isolate',
                comment: 'test process comment',
              },
            },
          ],
        });

        expect(endpointServiceMock.createLogger().error).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              "Unable to identify the space ID from alert data ('kibana.space_ids') for rule [rule-name-1][rule-id-1]",
          })
        );
        expect(endpointServiceMock.getInternalResponseActionsClient).not.toHaveBeenCalled();
      });
    });
  });
});
