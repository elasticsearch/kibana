/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { EndpointActionGenerator } from '../../../../../common/endpoint/data_generators/endpoint_action_generator';
import { FleetActionGenerator } from '../../../../../common/endpoint/data_generators/fleet_action_generator';
import type { NormalizedActionRequest } from './utils';
import {
  categorizeActionResults,
  categorizeResponseResults,
  formatEndpointActionResults,
  getUniqueLogData,
  getActionCompletionInfo,
  getActionStatus,
  isLogsEndpointAction,
  isLogsEndpointActionResponse,
  mapToNormalizedActionRequest,
  createActionDetailsRecord,
} from './utils';
import type {
  ActivityLogAction,
  ActivityLogActionResponse,
  EndpointAction,
  EndpointActionResponse,
  EndpointActivityLogAction,
  EndpointActivityLogActionResponse,
  LogsEndpointAction,
  LogsEndpointActionResponse,
} from '../../../../../common/endpoint/types';
import { v4 as uuidv4 } from 'uuid';
import type { Results } from '../../../routes/actions/mocks';
import { mockAuditLogSearchResult } from '../../../routes/actions/mocks';
import type { FetchActionResponsesResult } from '../..';

describe('When using Actions service utilities', () => {
  let fleetActionGenerator: FleetActionGenerator;
  let endpointActionGenerator: EndpointActionGenerator;

  beforeEach(() => {
    fleetActionGenerator = new FleetActionGenerator('seed');
    endpointActionGenerator = new EndpointActionGenerator('seed');
  });

  describe('#isLogsEndpointAction()', () => {
    it('should return `true` for a `LogsEndpointAction` (endpoint action request)', () => {
      expect(isLogsEndpointAction(endpointActionGenerator.generate())).toBe(true);
    });

    it('should return `false` for an `EndpointAction` (fleet action request)', () => {
      expect(isLogsEndpointAction(fleetActionGenerator.generate())).toBe(false);
    });
  });

  describe('#isLogsEndpointActionResponse()', () => {
    it('should return `true` for a `LogsEndpointActionResponse` (response sent by endpoint)', () => {
      expect(isLogsEndpointActionResponse(endpointActionGenerator.generateResponse())).toBe(true);
    });

    it('should return `false` for a `EndpointActionResponse` (response sent by fleet agent)', () => {
      expect(isLogsEndpointActionResponse(fleetActionGenerator.generateResponse())).toBe(false);
    });
  });

  describe('#mapToNormalizedActionRequest()', () => {
    it('normalizes an `EndpointAction` (those stored in Fleet index)', () => {
      expect(
        mapToNormalizedActionRequest(
          fleetActionGenerator.generate({
            '@timestamp': '2022-04-27T16:08:47.449Z',
          })
        )
      ).toEqual({
        agents: ['6e6796b0-af39-4f12-b025-fcb06db499e5'],
        agentType: 'endpoint',
        hosts: {},
        command: 'suspend-process',
        comment: expect.any(String),
        createdAt: '2022-04-27T16:08:47.449Z',
        createdBy: 'elastic',
        expiration: '2022-04-29T16:08:47.449Z',
        id: '90d62689-f72d-4a05-b5e3-500cad0dc366',
        type: 'ACTION_REQUEST',
        parameters: undefined,
      });
    });

    it('normalizes a `LogsEndpointAction` (those stored in Endpoint index)', () => {
      expect(
        mapToNormalizedActionRequest(
          endpointActionGenerator.generate({
            '@timestamp': '2022-04-27T16:08:47.449Z',
          })
        )
      ).toEqual({
        agents: ['90d62689-f72d-4a05-b5e3-500cad0dc366'],
        agentType: 'endpoint',
        hosts: {},
        command: 'suspend-process',
        comment: expect.any(String),
        createdAt: '2022-04-27T16:08:47.449Z',
        createdBy: 'Shanel',
        expiration: '2022-05-10T16:08:47.449Z',
        id: '1d6e6796-b0af-496f-92b0-25fcb06db499',
        type: 'ACTION_REQUEST',
        parameters: undefined,
      });
    });
  });

  describe('#getActionCompletionInfo()', () => {
    const COMPLETED_AT = '2022-05-05T18:53:18.836Z';
    const NOT_COMPLETED_OUTPUT = Object.freeze({
      isCompleted: false,
      completedAt: undefined,
      wasSuccessful: false,
      wasCanceled: false,
      errors: undefined,
      outputs: {},
      agentState: {
        123: {
          completedAt: undefined,
          errors: undefined,
          isCompleted: false,
          wasSuccessful: false,
          wasCanceled: false,
        },
      },
    });

    it('should show complete `false` if no action ids', () => {
      expect(
        getActionCompletionInfo(
          mapToNormalizedActionRequest(
            fleetActionGenerator.generate({
              agents: [],
            })
          ),
          { fleetResponses: [], endpointResponses: [] }
        )
      ).toEqual({
        ...NOT_COMPLETED_OUTPUT,
        agentState: {},
      });
    });

    it('should show complete as `false` if no responses', () => {
      expect(
        getActionCompletionInfo(
          mapToNormalizedActionRequest(
            fleetActionGenerator.generate({
              agents: ['123'],
            })
          ),
          { fleetResponses: [], endpointResponses: [] }
        )
      ).toEqual(NOT_COMPLETED_OUTPUT);
    });

    it('should show complete as `false` if no Endpoint response', () => {
      expect(
        getActionCompletionInfo(
          mapToNormalizedActionRequest(
            fleetActionGenerator.generate({
              agents: ['123'],
            })
          ),
          {
            fleetResponses: [
              fleetActionGenerator.generateResponse({
                action_id: '123',
              }),
            ],
            endpointResponses: [],
          }
        )
      ).toEqual(NOT_COMPLETED_OUTPUT);
    });

    it('should show complete as `true` with completion date if Endpoint Response received', () => {
      expect(
        getActionCompletionInfo(
          mapToNormalizedActionRequest(
            fleetActionGenerator.generate({
              agents: ['123'],
            })
          ),
          {
            fleetResponses: [],
            endpointResponses: [
              endpointActionGenerator.generateResponse({
                '@timestamp': COMPLETED_AT,
                agent: { id: '123' },
                EndpointActions: {
                  completed_at: COMPLETED_AT,
                  data: { output: { type: 'json', content: { code: 'aaa' } } },
                },
              }),
            ],
          }
        )
      ).toEqual({
        isCompleted: true,
        completedAt: COMPLETED_AT,
        errors: undefined,
        wasSuccessful: true,
        wasCanceled: false,
        outputs: {
          '123': {
            content: expect.anything(),
            type: 'json',
          },
        },
        agentState: {
          '123': {
            completedAt: COMPLETED_AT,
            errors: undefined,
            isCompleted: true,
            wasSuccessful: true,
            wasCanceled: false,
          },
        },
      });
    });

    it('should return action outputs (if any) per agent id', () => {
      const processes = endpointActionGenerator.randomResponseActionProcesses(3);
      expect(
        getActionCompletionInfo(
          mapToNormalizedActionRequest(
            fleetActionGenerator.generate({
              agents: ['123'],
            })
          ),
          {
            fleetResponses: [],
            endpointResponses: [
              endpointActionGenerator.generateResponse({
                '@timestamp': COMPLETED_AT,
                agent: { id: '123' },
                EndpointActions: {
                  completed_at: COMPLETED_AT,
                  data: {
                    output: {
                      type: 'json',
                      content: {
                        entries: processes,
                      },
                    },
                  },
                },
              }),
            ],
          }
        )
      ).toEqual({
        isCompleted: true,
        completedAt: COMPLETED_AT,
        errors: undefined,
        wasSuccessful: true,
        wasCanceled: false,
        outputs: {
          '123': {
            type: 'json',
            content: expect.objectContaining({ entries: processes }),
          },
        },
        agentState: {
          '123': {
            completedAt: COMPLETED_AT,
            errors: undefined,
            isCompleted: true,
            wasSuccessful: true,
            wasCanceled: false,
          },
        },
      });
    });

    it('should return file download URI for successful agent responses', () => {
      expect(
        getActionCompletionInfo(
          mapToNormalizedActionRequest(
            endpointActionGenerator.generate({
              agent: { id: ['123', '456'] },
              EndpointActions: { data: { command: 'get-file' } },
            })
          ),
          {
            fleetResponses: [],
            endpointResponses: [
              // Success response
              endpointActionGenerator.generateResponse({
                agent: { id: '123' },
                EndpointActions: {
                  data: {
                    command: 'get-file',
                    output: { type: 'json', content: { code: 'success' } },
                  },
                },
              }),

              // Failure response
              endpointActionGenerator.generateResponse({
                agent: { id: '456' },
                error: { message: 'this one failed' },
                EndpointActions: {
                  data: {
                    command: 'get-file',
                    output: { type: 'json', content: { code: 'failure' } },
                  },
                },
              }),
            ],
          }
        )
      ).toEqual(
        expect.objectContaining({
          outputs: {
            '123': {
              content: {
                code: 'success',
                downloadUri:
                  '/api/endpoint/action/90d62689-f72d-4a05-b5e3-500cad0dc366/file/90d62689-f72d-4a05-b5e3-500cad0dc366.123/download',
              },
              type: 'json',
            },
            '456': {
              content: {
                code: 'failure',
              },
              type: 'json',
            },
          },
        })
      );
    });

    it('should NOT return file download URI for actions with no file support', () => {
      expect(
        getActionCompletionInfo(
          mapToNormalizedActionRequest(
            endpointActionGenerator.generate({
              agent: { id: ['123', '456'] },
              EndpointActions: { data: { command: 'isolate' } },
            })
          ),
          {
            fleetResponses: [],
            endpointResponses: [
              // Success response
              endpointActionGenerator.generateResponse({
                agent: { id: '123' },
                EndpointActions: {
                  data: {
                    command: 'isolate',
                    output: { type: 'json', content: { code: 'success' } },
                  },
                },
              }),

              // Failure response
              endpointActionGenerator.generateResponse({
                agent: { id: '456' },
                error: { message: 'this one failed' },
                EndpointActions: {
                  data: {
                    command: 'isolate',
                    output: { type: 'json', content: { code: 'failure' } },
                  },
                },
              }),
            ],
          }
        )
      ).toEqual(
        expect.objectContaining({
          outputs: {
            '123': {
              content: {
                code: 'success',
              },
              type: 'json',
            },
            '456': {
              content: {
                code: 'failure',
              },
              type: 'json',
            },
          },
        })
      );
    });

    describe('and action failed', () => {
      let fleetResponseAtError: EndpointActionResponse;
      let endpointResponseAtError: LogsEndpointActionResponse;

      beforeEach(() => {
        const actionId = uuidv4();
        fleetResponseAtError = fleetActionGenerator.generateResponse({
          agent_id: '123',
          action_id: actionId,
          error: 'agent failed to deliver',
        });

        endpointResponseAtError = endpointActionGenerator.generateResponse({
          '@timestamp': '2022-05-18T13:03:54.756Z',
          agent: { id: '123' },
          error: {
            message: 'endpoint failed to apply',
          },
          EndpointActions: {
            action_id: actionId,
            completed_at: '2022-05-18T13:03:54.756Z',
          },
        });
      });

      it('should show `wasSuccessful` as `false` if endpoint action response has error', () => {
        expect(
          getActionCompletionInfo(
            mapToNormalizedActionRequest(
              fleetActionGenerator.generate({
                agents: ['123'],
              })
            ),
            { fleetResponses: [], endpointResponses: [endpointResponseAtError] }
          )
        ).toEqual({
          completedAt: endpointResponseAtError['@timestamp'],
          errors: ['Endpoint action response error: endpoint failed to apply'],
          isCompleted: true,
          wasSuccessful: false,
          wasCanceled: false,
          outputs: expect.anything(),
          agentState: {
            '123': {
              completedAt: endpointResponseAtError['@timestamp'],
              errors: ['Endpoint action response error: endpoint failed to apply'],
              isCompleted: true,
              wasSuccessful: false,
              wasCanceled: false,
            },
          },
        });
      });

      it('should show `wasSuccessful` as `false` if fleet action response has error (no endpoint response)', () => {
        expect(
          getActionCompletionInfo(
            mapToNormalizedActionRequest(
              fleetActionGenerator.generate({
                agents: ['123'],
              })
            ),
            { fleetResponses: [fleetResponseAtError], endpointResponses: [] }
          )
        ).toEqual({
          completedAt: fleetResponseAtError.completed_at,
          errors: ['Fleet action response error: agent failed to deliver'],
          isCompleted: true,
          wasSuccessful: false,
          wasCanceled: false,
          outputs: {},
          agentState: {
            '123': {
              completedAt: fleetResponseAtError.completed_at,
              errors: ['Fleet action response error: agent failed to deliver'],
              isCompleted: true,
              wasSuccessful: false,
              wasCanceled: false,
            },
          },
        });
      });

      it('should include both fleet and endpoint errors if both responses returned failure', () => {
        expect(
          getActionCompletionInfo(
            mapToNormalizedActionRequest(
              fleetActionGenerator.generate({
                agents: ['123'],
              })
            ),
            { fleetResponses: [fleetResponseAtError], endpointResponses: [endpointResponseAtError] }
          )
        ).toEqual({
          completedAt: endpointResponseAtError['@timestamp'],
          errors: [
            'Endpoint action response error: endpoint failed to apply',
            'Fleet action response error: agent failed to deliver',
          ],
          isCompleted: true,
          wasSuccessful: false,
          wasCanceled: false,
          outputs: expect.anything(),
          agentState: {
            '123': {
              completedAt: endpointResponseAtError['@timestamp'],
              errors: [
                'Endpoint action response error: endpoint failed to apply',
                'Fleet action response error: agent failed to deliver',
              ],
              isCompleted: true,
              wasSuccessful: false,
              wasCanceled: false,
            },
          },
        });
      });
    });

    describe('with multiple agent ids', () => {
      let agentIds: string[];
      let actionId: string;
      let action123Responses: FetchActionResponsesResult;
      let action456Responses: FetchActionResponsesResult;
      let action789Responses: FetchActionResponsesResult;

      beforeEach(() => {
        agentIds = ['123', '456', '789'];
        actionId = uuidv4();
        action123Responses = {
          fleetResponses: [
            fleetActionGenerator.generateResponse({
              agent_id: '123',
              error: '',
              action_id: actionId,
            }),
          ],
          endpointResponses: [
            endpointActionGenerator.generateResponse({
              '@timestamp': '2022-01-05T19:27:23.816Z',
              agent: { id: '123' },
              EndpointActions: { action_id: actionId, completed_at: '2022-01-05T19:27:23.816Z' },
            }),
          ],
        };

        action456Responses = {
          fleetResponses: [
            fleetActionGenerator.generateResponse({
              action_id: actionId,
              agent_id: '456',
              error: '',
            }),
          ],
          endpointResponses: [
            endpointActionGenerator.generateResponse({
              '@timestamp': COMPLETED_AT,
              agent: { id: '456' },
              EndpointActions: { action_id: actionId, completed_at: COMPLETED_AT },
            }),
          ],
        };

        action789Responses = {
          fleetResponses: [
            fleetActionGenerator.generateResponse({
              action_id: actionId,
              agent_id: '789',
              error: '',
            }),
          ],
          endpointResponses: [
            endpointActionGenerator.generateResponse({
              '@timestamp': '2022-03-05T19:27:23.816Z',
              agent: { id: '789' },
              EndpointActions: { action_id: actionId, completed_at: '2022-03-05T19:27:23.816Z' },
            }),
          ],
        };
      });

      it('should show complete as `false` if no responses', () => {
        expect(
          getActionCompletionInfo(
            mapToNormalizedActionRequest(
              fleetActionGenerator.generate({
                agents: agentIds,
              })
            ),
            { fleetResponses: [], endpointResponses: [] }
          )
        ).toEqual({
          ...NOT_COMPLETED_OUTPUT,
          agentState: {
            ...NOT_COMPLETED_OUTPUT.agentState,
            '456': {
              completedAt: undefined,
              errors: undefined,
              isCompleted: false,
              wasSuccessful: false,
              wasCanceled: false,
            },
            '789': {
              completedAt: undefined,
              errors: undefined,
              isCompleted: false,
              wasSuccessful: false,
              wasCanceled: false,
            },
          },
        });
      });

      it('should complete as `false` if at least one agent id has not received a response', () => {
        expect(
          getActionCompletionInfo(
            mapToNormalizedActionRequest(
              fleetActionGenerator.generate({
                agents: agentIds,
              })
            ),
            {
              fleetResponses: [
                ...action123Responses.fleetResponses,
                ...action456Responses.fleetResponses,
                ...action789Responses.fleetResponses,
              ],
              endpointResponses: [
                ...action123Responses.endpointResponses,
                ...action789Responses.endpointResponses,
                // Action id: 456 === Not complete (only fleet response)
              ],
            }
          )
        ).toEqual({
          ...NOT_COMPLETED_OUTPUT,
          outputs: expect.any(Object),
          agentState: {
            '123': {
              completedAt: '2022-01-05T19:27:23.816Z',
              errors: undefined,
              isCompleted: true,
              wasSuccessful: true,
              wasCanceled: false,
            },
            '456': {
              completedAt: undefined,
              errors: undefined,
              isCompleted: false,
              wasSuccessful: false,
              wasCanceled: false,
            },
            '789': {
              completedAt: '2022-03-05T19:27:23.816Z',
              errors: undefined,
              isCompleted: true,
              wasSuccessful: true,
              wasCanceled: false,
            },
          },
        });
      });

      it('should show complete as `true` if all agent response were received', () => {
        expect(
          getActionCompletionInfo(
            mapToNormalizedActionRequest(
              fleetActionGenerator.generate({
                agents: agentIds,
              })
            ),
            {
              fleetResponses: [
                ...action123Responses.fleetResponses,
                ...action456Responses.fleetResponses,
                ...action789Responses.fleetResponses,
              ],
              endpointResponses: [
                ...action123Responses.endpointResponses,
                ...action456Responses.endpointResponses,
                ...action789Responses.endpointResponses,
              ],
            }
          )
        ).toEqual({
          isCompleted: true,
          completedAt: COMPLETED_AT,
          wasSuccessful: true,
          wasCanceled: false,
          errors: undefined,
          outputs: expect.any(Object),
          agentState: {
            '123': {
              completedAt: '2022-01-05T19:27:23.816Z',
              errors: undefined,
              isCompleted: true,
              wasSuccessful: true,
              wasCanceled: false,
            },
            '456': {
              completedAt: '2022-05-05T18:53:18.836Z',
              errors: undefined,
              isCompleted: true,
              wasSuccessful: true,
              wasCanceled: false,
            },
            '789': {
              completedAt: '2022-03-05T19:27:23.816Z',
              errors: undefined,
              isCompleted: true,
              wasSuccessful: true,
              wasCanceled: false,
            },
          },
        });
      });

      it('should complete as `true` if one agent only received a fleet response with error on it', () => {
        action456Responses.fleetResponses[0].error = 'something is no good';
        action456Responses.fleetResponses[0]['@timestamp'] = '2022-05-06T12:50:19.747Z';

        expect(
          getActionCompletionInfo(
            mapToNormalizedActionRequest(
              fleetActionGenerator.generate({
                agents: agentIds,
              })
            ),
            {
              fleetResponses: [
                ...action123Responses.fleetResponses,
                ...action456Responses.fleetResponses,
                ...action789Responses.fleetResponses,
              ],
              endpointResponses: [
                ...action123Responses.endpointResponses,
                ...action789Responses.endpointResponses,
                // Action id: 456 === is complete with only a fleet response that has `error`
              ],
            }
          )
        ).toEqual({
          completedAt: '2022-05-06T12:50:19.747Z',
          errors: ['Fleet action response error: something is no good'],
          isCompleted: true,
          wasSuccessful: false,
          wasCanceled: false,
          outputs: expect.any(Object),
          agentState: {
            '123': {
              completedAt: '2022-01-05T19:27:23.816Z',
              errors: undefined,
              isCompleted: true,
              wasSuccessful: true,
              wasCanceled: false,
            },
            '456': {
              completedAt: action456Responses.fleetResponses[0]['@timestamp'],
              errors: ['Fleet action response error: something is no good'],
              isCompleted: true,
              wasSuccessful: false,
              wasCanceled: false,
            },
            '789': {
              completedAt: '2022-03-05T19:27:23.816Z',
              errors: undefined,
              isCompleted: true,
              wasSuccessful: true,
              wasCanceled: false,
            },
          },
        });
      });

      it('should include output for agents for which the action was complete', () => {
        // Add output to the completed actions

        action123Responses.endpointResponses[0].EndpointActions.data.output = {
          type: 'json',
          content: {
            code: 'bar',
          },
        };

        action789Responses.endpointResponses[0].EndpointActions.data.output = {
          type: 'text',
          // @ts-expect-error need to fix ActionResponseOutput type
          content: 'some endpoint output data',
        };

        expect(
          getActionCompletionInfo(
            mapToNormalizedActionRequest(
              fleetActionGenerator.generate({
                agents: agentIds,
              })
            ),
            {
              fleetResponses: [
                ...action123Responses.fleetResponses,
                ...action456Responses.fleetResponses,
                ...action789Responses.fleetResponses,
              ],
              endpointResponses: [
                ...action123Responses.endpointResponses,
                ...action789Responses.endpointResponses,
                // Action id: 456 === Not complete (only fleet response)
              ],
            }
          )
        ).toEqual({
          ...NOT_COMPLETED_OUTPUT,
          agentState: {
            '123': {
              completedAt: '2022-01-05T19:27:23.816Z',
              errors: undefined,
              isCompleted: true,
              wasSuccessful: true,
              wasCanceled: false,
            },
            '456': {
              completedAt: undefined,
              errors: undefined,
              isCompleted: false,
              wasSuccessful: false,
              wasCanceled: false,
            },
            '789': {
              completedAt: '2022-03-05T19:27:23.816Z',
              errors: undefined,
              isCompleted: true,
              wasSuccessful: true,
              wasCanceled: false,
            },
          },
          outputs: {
            '123': {
              content: {
                code: 'bar',
              },
              type: 'json',
            },
            '789': {
              content: 'some endpoint output data',
              type: 'text',
            },
          },
        });
      });
    });
  });

  describe('#getUniqueLogData()', () => {
    let actionRequests123: Array<ActivityLogAction | EndpointActivityLogAction>;
    let actionResponses123: Array<ActivityLogActionResponse | EndpointActivityLogActionResponse>;

    let errorActionRequests: Array<ActivityLogAction | EndpointActivityLogAction>;
    let errorResponses: Array<ActivityLogActionResponse | EndpointActivityLogActionResponse>;

    beforeEach(() => {
      const actionId0 = uuidv4();
      const actionId1 = uuidv4();
      actionRequests123 = [
        fleetActionGenerator.generateActivityLogAction({
          item: {
            data: { agents: ['123'], action_id: actionId0 },
          },
        }),
        endpointActionGenerator.generateActivityLogAction({
          item: {
            data: { agent: { id: '123' }, EndpointActions: { action_id: actionId0 } },
          },
        }),
        fleetActionGenerator.generateActivityLogAction({
          item: {
            data: { agents: ['123'], action_id: actionId1 },
          },
        }),
        endpointActionGenerator.generateActivityLogAction({
          item: {
            data: { agent: { id: '123' }, EndpointActions: { action_id: actionId1 } },
          },
        }),
      ];

      actionResponses123 = [
        fleetActionGenerator.generateActivityLogActionResponse({
          item: {
            data: { agent_id: '123', action_id: actionId0 },
          },
        }),
        endpointActionGenerator.generateActivityLogActionResponse({
          item: {
            data: {
              agent: { id: '123' },
              EndpointActions: {
                action_id: actionId0,
                completed_at: new Date().toISOString(),
              },
            },
          },
        }),
      ];

      errorActionRequests = [
        endpointActionGenerator.generateActivityLogAction({
          item: {
            data: {
              agent: { id: '456' },
              EndpointActions: { action_id: actionId0 },
              error: { message: 'Did not deliver to Fleet' },
            },
          },
        }),

        fleetActionGenerator.generateActivityLogAction({
          item: {
            data: { agents: ['456'], action_id: actionId1 },
          },
        }),
        endpointActionGenerator.generateActivityLogAction({
          item: {
            data: {
              agent: { id: '456' },
              EndpointActions: { action_id: actionId1 },
            },
          },
        }),
      ];

      errorResponses = [
        endpointActionGenerator.generateActivityLogActionResponse({
          item: {
            data: {
              agent: { id: '456' },
              EndpointActions: {
                action_id: actionId0,
                completed_at: new Date().toISOString(),
              },
              error: { code: '424', message: 'Did not deliver to Fleet' },
            },
          },
        }),

        fleetActionGenerator.generateActivityLogActionResponse({
          item: {
            data: { agent_id: '456', action_id: actionId1, error: 'some other error!' },
          },
        }),
        endpointActionGenerator.generateActivityLogActionResponse({
          item: {
            data: {
              agent: { id: '456' },
              EndpointActions: {
                action_id: actionId1,
                completed_at: new Date().toISOString(),
              },
              error: { message: 'some other error!' },
            },
          },
        }),
      ];
    });

    it('should exclude endpoint actions on successful actions', () => {
      const uniqueData = getUniqueLogData([...actionRequests123, ...actionResponses123]);
      expect(uniqueData.length).toEqual(4);
      expect(uniqueData.find((u) => u.type === 'action')).toEqual(undefined);
    });

    it('should include endpoint action when no fleet response but endpoint response with error', () => {
      const uniqueData = getUniqueLogData([...errorActionRequests, ...errorResponses]);
      expect(uniqueData.length).toEqual(5);
    });
  });

  describe('#categorizeActionResults(), #categorizeResponseResults() and #formatEndpointActionResults()', () => {
    let fleetActions: Results[];
    let endpointActions: Results[];
    let fleetResponses: Results[];
    let endpointResponses: Results[];

    beforeEach(() => {
      const agents = ['agent-id'];
      const actionIds = [uuidv4(), uuidv4()];

      fleetActions = actionIds.map((id) => {
        return {
          _index: '.fleet-actions-7',
          _source: fleetActionGenerator.generate({
            agents,
            action_id: id,
          }),
        };
      });

      endpointActions = actionIds.map((id) => {
        return {
          _index: '.ds-.logs-endpoint.actions-default-2021.19.10-000001',
          _source: endpointActionGenerator.generate({
            agent: { id: agents[0] },
            EndpointActions: {
              action_id: id,
            },
          }),
        };
      });

      fleetResponses = actionIds.map((id) => {
        return {
          _index: '.ds-.fleet-actions-results-2021.19.10-000001',
          _source: fleetActionGenerator.generate({
            agents,
            action_id: id,
          }),
        };
      });

      endpointResponses = actionIds.map((id) => {
        return {
          _index: '.ds-.logs-endpoint.action.responses-default-2021.19.10-000001',
          _source: endpointActionGenerator.generate({
            agent: { id: agents[0] },
            EndpointActions: {
              action_id: id,
            },
          }),
        };
      });
    });

    it('should correctly categorize fleet actions and endpoint actions', () => {
      const actionResults = mockAuditLogSearchResult([...fleetActions, ...endpointActions]);
      const categorized = categorizeActionResults({
        results: actionResults.body.hits.hits as Array<
          estypes.SearchHit<EndpointAction | LogsEndpointAction>
        >,
      });
      const categorizedActions = categorized.filter((e) => e.type === 'action');
      const categorizedFleetActions = categorized.filter((e) => e.type === 'fleetAction');
      expect(categorizedActions.length).toEqual(2);
      expect(categorizedFleetActions.length).toEqual(2);
      expect(
        (categorizedActions as EndpointActivityLogAction[]).map(
          (e) => 'EndpointActions' in e.item.data
        )[0]
      ).toBeTruthy();
      expect(
        (categorizedFleetActions as ActivityLogAction[]).map((e) => 'data' in e.item.data)[0]
      ).toBeTruthy();
    });
    it('should correctly categorize fleet responses and endpoint responses', () => {
      const actionResponses = mockAuditLogSearchResult([...fleetResponses, ...endpointResponses]);
      const categorized = categorizeResponseResults({
        results: actionResponses.body.hits.hits as Array<
          estypes.SearchHit<EndpointActionResponse | LogsEndpointActionResponse>
        >,
      });
      const categorizedResponses = categorized.filter((e) => e.type === 'response');
      const categorizedFleetResponses = categorized.filter((e) => e.type === 'fleetResponse');
      expect(categorizedResponses.length).toEqual(2);
      expect(categorizedFleetResponses.length).toEqual(2);
      expect(
        (categorizedResponses as EndpointActivityLogActionResponse[]).map(
          (e) => 'EndpointActions' in e.item.data
        )[0]
      ).toBeTruthy();
      expect(
        (categorizedFleetResponses as ActivityLogActionResponse[]).map(
          (e) => 'data' in e.item.data
        )[0]
      ).toBeTruthy();
    });

    it('should correctly format endpoint actions', () => {
      const actionResults = mockAuditLogSearchResult(endpointActions);
      const formattedActions = formatEndpointActionResults(
        actionResults.body.hits.hits as Array<estypes.SearchHit<LogsEndpointAction>>
      );
      const formattedActionRequests = formattedActions.filter((e) => e.type === 'action');

      expect(formattedActionRequests.length).toEqual(2);
      expect(
        (formattedActionRequests as EndpointActivityLogAction[]).map(
          (e) => 'EndpointActions' in e.item.data
        )[0]
      ).toBeTruthy();
    });
  });

  describe('#getActionStatus', () => {
    it('should show isExpired as TRUE and status as `failed` correctly', () => {
      expect(
        getActionStatus({
          expirationDate: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
          isCompleted: false,
          wasSuccessful: false,
          wasCanceled: false,
        })
      ).toEqual({ isExpired: true, status: 'failed' });
    });

    it('should show isExpired as FALSE and status as `pending` correctly', () => {
      expect(
        getActionStatus({
          expirationDate: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString(),
          isCompleted: false,
          wasSuccessful: false,
          wasCanceled: false,
        })
      ).toEqual({ isExpired: false, status: 'pending' });
    });

    it('should show isExpired as FALSE and status as `successful` correctly', () => {
      expect(
        getActionStatus({
          expirationDate: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString(),
          isCompleted: true,
          wasSuccessful: true,
          wasCanceled: false,
        })
      ).toEqual({ isExpired: false, status: 'successful' });
    });

    it('should show isExpired as FALSE and status as `failed` correctly', () => {
      expect(
        getActionStatus({
          expirationDate: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString(),
          isCompleted: true,
          wasSuccessful: false,
          wasCanceled: false,
        })
      ).toEqual({ isExpired: false, status: 'failed' });
    });
  });

  describe('#createActionDetailsRecord()', () => {
    let actionRequest: NormalizedActionRequest;
    let actionResponses: FetchActionResponsesResult;
    let agentHostInfo: Record<string, string>;

    beforeEach(() => {
      actionRequest = {
        agents: ['6e6796b0-af39-4f12-b025-fcb06db499e5'],
        command: 'kill-process',
        comment: 'kill this one',
        createdAt: '2022-04-27T16:08:47.449Z',
        createdBy: 'elastic',
        expiration: '2022-04-29T16:08:47.449Z',
        id: '90d62689-f72d-4a05-b5e3-500cad0dc366',
        type: 'ACTION_REQUEST',
        parameters: undefined,
        agentType: 'endpoint',
        hosts: {},
      };

      actionResponses = {
        fleetResponses: [
          fleetActionGenerator.generateResponse({
            action_id: actionRequest.id,
            agent_id: actionRequest.agents[0],
          }),
        ],
        endpointResponses: [
          endpointActionGenerator.generateResponse({
            agent: { id: actionRequest.agents },
            EndpointActions: {
              action_id: actionRequest.id,
            },
          }),
        ],
      };

      agentHostInfo = {
        [actionRequest.agents[0]]: 'host-a',
      };
    });

    it('should return expected action details record', () => {
      expect(createActionDetailsRecord(actionRequest, actionResponses, agentHostInfo)).toEqual({
        action: '90d62689-f72d-4a05-b5e3-500cad0dc366',
        id: '90d62689-f72d-4a05-b5e3-500cad0dc366',
        agentType: 'endpoint',
        agents: ['6e6796b0-af39-4f12-b025-fcb06db499e5'],
        alertIds: undefined,
        command: 'kill-process',
        comment: 'kill this one',
        completedAt: expect.any(String),
        startedAt: '2022-04-27T16:08:47.449Z',
        status: 'successful',
        wasSuccessful: true,
        wasCanceled: false,
        createdBy: 'elastic',
        errors: undefined,
        isCompleted: true,
        isExpired: false,
        parameters: undefined,
        ruleId: undefined,
        ruleName: undefined,
        agentState: {
          '6e6796b0-af39-4f12-b025-fcb06db499e5': {
            completedAt: expect.any(String),
            errors: undefined,
            isCompleted: true,
            wasSuccessful: true,
            wasCanceled: false,
          },
        },
        hosts: {
          '6e6796b0-af39-4f12-b025-fcb06db499e5': {
            name: 'host-a',
          },
        },
        outputs: {
          '6e6796b0-af39-4f12-b025-fcb06db499e5': {
            content: expect.anything(),
            type: 'json',
          },
        },
      });
    });

    it('should populate host name from action request', () => {
      agentHostInfo = {};
      actionRequest.hosts[actionRequest.agents[0]] = { name: 'host-b' };

      expect(
        createActionDetailsRecord(actionRequest, actionResponses, agentHostInfo)
      ).toMatchObject({
        hosts: {
          '6e6796b0-af39-4f12-b025-fcb06db499e5': {
            name: 'host-b',
          },
        },
      });
    });
  });
});
