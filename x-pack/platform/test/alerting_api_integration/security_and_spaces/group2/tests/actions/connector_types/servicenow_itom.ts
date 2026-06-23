/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type httpProxy from 'http-proxy';
import expect from '@kbn/expect';
import { asyncForEach } from '@kbn/std';
import getPort from 'get-port';
import type http from 'http';
import type { IValidatedEvent } from '@kbn/event-log-plugin/server';

import { getHttpProxyServer } from '@kbn/alerting-api-integration-helpers';
import { getServiceNowServer } from '@kbn/actions-simulators-plugin/server/plugin';
import { TaskErrorSource } from '@kbn/task-manager-plugin/common';
import type { FtrProviderContext } from '../../../../../common/ftr_provider_context';
import { getEventLog } from '../../../../../common/lib';

export default function serviceNowITOMTest({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const configService = getService('config');
  const retry = getService('retry');

  const mockServiceNowCommon = {
    params: {
      subAction: 'addEvent',
      subActionParams: {
        source: 'A source',
        event_class: 'An event class',
        resource: 'C:',
        node: 'node.example.com',
        metric_name: 'Percentage Logical Disk Free Space',
        type: 'Disk space',
        severity: '4',
        description: 'desc',
        additional_info: '{"alert": "test"}',
        message_key: 'a key',
        time_of_event: '2021-10-13T10:51:44.981Z',
      },
    },
  };
  const mockServiceNowBasic = {
    ...mockServiceNowCommon,
    config: {
      apiUrl: 'www.servicenowisinkibanaactions.com',
    },
    secrets: {
      password: 'elastic',
      username: 'changeme',
    },
  };
  const mockServiceNowOAuth = {
    ...mockServiceNowCommon,
    config: {
      apiUrl: 'www.servicenowisinkibanaactions.com',
      isOAuth: true,
      clientId: 'abc',
      userIdentifierValue: 'elastic',
      jwtKeyId: 'def',
    },
    secrets: {
      clientSecret: 'xyz',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nddddddd\n-----END RSA PRIVATE KEY-----',
    },
  };

  describe('ServiceNow ITOM', () => {
    let simulatedActionId = '';
    let serviceNowSimulatorURL: string = '';
    let serviceNowServer: http.Server;
    let proxyServer: httpProxy | undefined;
    let proxyHaveBeenCalled = false;

    before(async () => {
      serviceNowServer = await getServiceNowServer();
      const availablePort = await getPort({ port: getPort.makeRange(9000, 9100) });
      if (!serviceNowServer.listening) {
        serviceNowServer.listen(availablePort);
      }
      serviceNowSimulatorURL = `http://localhost:${availablePort}`;
      proxyServer = await getHttpProxyServer(
        serviceNowSimulatorURL,
        configService.get('kbnTestServer.serverArgs'),
        () => {
          proxyHaveBeenCalled = true;
        }
      );
    });

    after(() => {
      serviceNowServer.close();
      if (proxyServer) {
        proxyServer.close();
      }
    });

    describe('ServiceNow ITOM - Action Creation', () => {
      it('should return 200 when creating a servicenow Basic Auth connector successfully', async () => {
        const { body: createdAction } = await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A servicenow action',
            connector_type_id: '.servicenow-itom',
            config: {
              apiUrl: serviceNowSimulatorURL,
            },
            secrets: mockServiceNowBasic.secrets,
          })
          .expect(200);

        expect(createdAction).to.eql({
          id: createdAction.id,
          is_preconfigured: false,
          is_system_action: false,
          is_deprecated: false,
          name: 'A servicenow action',
          connector_type_id: '.servicenow-itom',
          is_missing_secrets: false,
          config: {
            apiUrl: serviceNowSimulatorURL,
            isOAuth: false,
            clientId: null,
            jwtKeyId: null,
            userIdentifierValue: null,
          },
          is_connector_type_deprecated: false,
        });

        const { body: fetchedAction } = await supertest
          .get(`/api/actions/connector/${createdAction.id}`)
          .expect(200);

        expect(fetchedAction).to.eql({
          id: fetchedAction.id,
          is_preconfigured: false,
          is_system_action: false,
          is_deprecated: false,
          name: 'A servicenow action',
          connector_type_id: '.servicenow-itom',
          is_missing_secrets: false,
          config: {
            apiUrl: serviceNowSimulatorURL,
            isOAuth: false,
            clientId: null,
            jwtKeyId: null,
            userIdentifierValue: null,
          },
          is_connector_type_deprecated: false,
          auth_mode: 'shared',
        });
      });

      it('should return 200 when creating a servicenow OAuth connector successfully', async () => {
        const { body: createdConnector } = await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A servicenow action',
            connector_type_id: '.servicenow-itom',
            config: {
              ...mockServiceNowOAuth.config,
              apiUrl: serviceNowSimulatorURL,
            },
            secrets: mockServiceNowOAuth.secrets,
          })
          .expect(200);

        expect(createdConnector).to.eql({
          id: createdConnector.id,
          is_preconfigured: false,
          is_system_action: false,
          is_deprecated: false,
          name: 'A servicenow action',
          connector_type_id: '.servicenow-itom',
          is_missing_secrets: false,
          config: {
            apiUrl: serviceNowSimulatorURL,
            isOAuth: true,
            clientId: mockServiceNowOAuth.config.clientId,
            jwtKeyId: mockServiceNowOAuth.config.jwtKeyId,
            userIdentifierValue: mockServiceNowOAuth.config.userIdentifierValue,
          },
          is_connector_type_deprecated: false,
        });

        const { body: fetchedConnector } = await supertest
          .get(`/api/actions/connector/${createdConnector.id}`)
          .expect(200);

        expect(fetchedConnector).to.eql({
          id: fetchedConnector.id,
          is_preconfigured: false,
          is_system_action: false,
          is_deprecated: false,
          name: 'A servicenow action',
          connector_type_id: '.servicenow-itom',
          is_missing_secrets: false,
          config: {
            apiUrl: serviceNowSimulatorURL,
            isOAuth: true,
            clientId: mockServiceNowOAuth.config.clientId,
            jwtKeyId: mockServiceNowOAuth.config.jwtKeyId,
            userIdentifierValue: mockServiceNowOAuth.config.userIdentifierValue,
          },
          is_connector_type_deprecated: false,
          auth_mode: 'shared',
        });
      });

      it('should respond with a 400 Bad Request when creating a servicenow Basic Auth connector with no apiUrl', async () => {
        await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A servicenow action',
            connector_type_id: '.servicenow-itom',
            config: {},
          })
          .expect(400)
          .then((resp: any) => {
            expect(resp.body).to.eql({
              statusCode: 400,
              error: 'Bad Request',
              message: `error validating connector type config: ✖ Invalid input: expected string, received undefined\n  → at apiUrl`,
            });
          });
      });

      it('should respond with a 400 Bad Request when creating a servicenow OAuth connector with no apiUrl', async () => {
        await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A servicenow action',
            connector_type_id: '.servicenow-itom',
            config: {
              isOAuth: true,
            },
            secrets: mockServiceNowOAuth.secrets,
          })
          .expect(400)
          .then((resp: any) => {
            expect(resp.body).to.eql({
              statusCode: 400,
              error: 'Bad Request',
              message: `error validating connector type config: ✖ Invalid input: expected string, received undefined\n  → at apiUrl`,
            });
          });
      });

      it('should respond with a 400 Bad Request when creating a servicenow connector with a not present in allowedHosts apiUrl', async () => {
        await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A servicenow action',
            connector_type_id: '.servicenow-itom',
            config: {
              apiUrl: 'http://servicenow.mynonexistent.com',
            },
            secrets: mockServiceNowBasic.secrets,
          })
          .expect(400)
          .then((resp: any) => {
            expect(resp.body).to.eql({
              statusCode: 400,
              error: 'Bad Request',
              message:
                'error validating connector type config: error configuring connector action: target url "http://servicenow.mynonexistent.com" is not added to the Kibana config xpack.actions.allowedHosts',
            });
          });
      });

      it('should respond with a 400 Bad Request when creating a servicenow Basic Auth connector without secrets', async () => {
        await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A servicenow action',
            connector_type_id: '.servicenow-itom',
            config: {
              apiUrl: serviceNowSimulatorURL,
            },
          })
          .expect(400)
          .then((resp: any) => {
            expect(resp.body).to.eql({
              statusCode: 400,
              error: 'Bad Request',
              message:
                'error validating connector type secrets: Either basic auth or OAuth credentials must be specified',
            });
          });
      });

      it('should respond with a 400 Bad Request when creating a servicenow OAuth connector without secrets', async () => {
        await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A servicenow action',
            connector_type_id: '.servicenow-itom',
            config: {
              ...mockServiceNowOAuth.config,
              apiUrl: serviceNowSimulatorURL,
            },
          })
          .expect(400)
          .then((resp: any) => {
            expect(resp.body).to.eql({
              statusCode: 400,
              error: 'Bad Request',
              message:
                'error validating connector type secrets: Either basic auth or OAuth credentials must be specified',
            });
          });
      });

      it('should respond with a 400 Bad Request when creating a servicenow OAuth connector with missing fields', async () => {
        const badConfigs = [
          {
            config: {
              ...mockServiceNowOAuth.config,
              apiUrl: serviceNowSimulatorURL,
              clientId: null,
            },
            secrets: mockServiceNowOAuth.secrets,
            errorMessage: `error validating connector type config: clientId must be provided when isOAuth = true`,
          },
          {
            config: {
              ...mockServiceNowOAuth.config,
              apiUrl: serviceNowSimulatorURL,
              userIdentifierValue: null,
            },
            secrets: mockServiceNowOAuth.secrets,
            errorMessage: `error validating connector type config: userIdentifierValue must be provided when isOAuth = true`,
          },
          {
            config: {
              ...mockServiceNowOAuth.config,
              apiUrl: serviceNowSimulatorURL,
              jwtKeyId: null,
            },
            secrets: mockServiceNowOAuth.secrets,
            errorMessage: `error validating connector type config: jwtKeyId must be provided when isOAuth = true`,
          },
          {
            config: {
              ...mockServiceNowOAuth.config,
              apiUrl: serviceNowSimulatorURL,
            },
            secrets: {
              ...mockServiceNowOAuth.secrets,
              clientSecret: null,
            },
            errorMessage: `error validating connector type secrets: clientSecret and privateKey must both be specified`,
          },
          {
            config: {
              ...mockServiceNowOAuth.config,
              apiUrl: serviceNowSimulatorURL,
            },
            secrets: {
              ...mockServiceNowOAuth.secrets,
              privateKey: null,
            },
            errorMessage: `error validating connector type secrets: clientSecret and privateKey must both be specified`,
          },
        ];

        await asyncForEach(badConfigs, async (badConfig) => {
          await supertest
            .post('/api/actions/connector')
            .set('kbn-xsrf', 'foo')
            .send({
              name: 'A servicenow action',
              connector_type_id: '.servicenow-itom',
              config: badConfig.config,
              secrets: badConfig.secrets,
            })
            .expect(400)
            .then((resp: any) => {
              expect(resp.body).to.eql({
                statusCode: 400,
                error: 'Bad Request',
                message: badConfig.errorMessage,
              });
            });
        });
      });
    });

    describe('ServiceNow ITOM - Executor', () => {
      before(async () => {
        const { body } = await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A servicenow simulator',
            connector_type_id: '.servicenow-itom',
            config: {
              apiUrl: serviceNowSimulatorURL,
            },
            secrets: mockServiceNowBasic.secrets,
          });
        simulatedActionId = body.id;
      });

      describe('Validation', () => {
        it('should handle failing with a simulated success without action', async () => {
          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {},
            })
            .then((resp: any) => {
              expect(Object.keys(resp.body).sort()).to.eql([
                'connector_id',
                'errorSource',
                'message',
                'retry',
                'status',
              ]);
              expect(resp.body.connector_id).to.eql(simulatedActionId);
              expect(resp.body.status).to.eql('error');
            });
        });

        it('should handle failing with a simulated success without unsupported action', async () => {
          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: { subAction: 'non-supported' },
            })
            .then((resp: any) => {
              expect(resp.body).to.eql({
                connector_id: simulatedActionId,
                status: 'error',
                retry: false,
                errorSource: TaskErrorSource.USER,
                message: `error validating action params: ✖ Invalid discriminator value. Expected 'addEvent' | 'getChoices'\n  → at subAction`,
              });
            });
        });

        it('should handle failing with a simulated success without subActionParams', async () => {
          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: { subAction: 'pushToService' },
            })
            .then((resp: any) => {
              expect(resp.body).to.eql({
                connector_id: simulatedActionId,
                status: 'error',
                retry: false,
                errorSource: TaskErrorSource.USER,
                message: `error validating action params: ✖ Invalid discriminator value. Expected 'addEvent' | 'getChoices'\n  → at subAction`,
              });
            });
        });

        describe('getChoices', () => {
          it('should fail when field is not provided', async () => {
            await supertest
              .post(`/api/actions/connector/${simulatedActionId}/_execute`)
              .set('kbn-xsrf', 'foo')
              .send({
                params: {
                  subAction: 'getChoices',
                  subActionParams: {},
                },
              })
              .then((resp: any) => {
                expect(resp.body).to.eql({
                  connector_id: simulatedActionId,
                  status: 'error',
                  retry: false,
                  errorSource: TaskErrorSource.USER,
                  message: `error validating action params: ✖ Invalid input: expected array, received undefined\n  → at subActionParams.fields`,
                });
              });
          });
        });
      });

      describe('Execution', () => {
        // New connectors
        describe('Add event', () => {
          it('should add an event ', async () => {
            const { body: result } = await supertest
              .post(`/api/actions/connector/${simulatedActionId}/_execute`)
              .set('kbn-xsrf', 'foo')
              .send({
                params: mockServiceNowBasic.params,
              })
              .expect(200);
            expect(result.status).to.eql('ok');

            const events: IValidatedEvent[] = await retry.try(async () => {
              return await getEventLog({
                getService,
                spaceId: 'default',
                type: 'action',
                id: simulatedActionId,
                provider: 'actions',
                actions: new Map([
                  ['execute-start', { equal: 5 }],
                  ['execute', { equal: 5 }],
                ]),
              });
            });

            const executeEvent = events[events.length - 1];
            expect(executeEvent?.kibana?.action?.execution?.usage?.request_body_bytes).to.be(317);
          });
        });

        describe('getChoices', () => {
          it('should get choices', async () => {
            const { body: result } = await supertest
              .post(`/api/actions/connector/${simulatedActionId}/_execute`)
              .set('kbn-xsrf', 'foo')
              .send({
                params: {
                  subAction: 'getChoices',
                  subActionParams: { fields: ['priority'] },
                },
              })
              .expect(200);

            expect(proxyHaveBeenCalled).to.equal(true);
            expect(result).to.eql({
              status: 'ok',
              connector_id: simulatedActionId,
              data: [
                {
                  dependent_value: '',
                  label: '1 - Critical',
                  value: '1',
                },
                {
                  dependent_value: '',
                  label: '2 - High',
                  value: '2',
                },
                {
                  dependent_value: '',
                  label: '3 - Moderate',
                  value: '3',
                },
                {
                  dependent_value: '',
                  label: '4 - Low',
                  value: '4',
                },
                {
                  dependent_value: '',
                  label: '5 - Planning',
                  value: '5',
                },
              ],
            });

            const events: IValidatedEvent[] = await retry.try(async () => {
              return await getEventLog({
                getService,
                spaceId: 'default',
                type: 'action',
                id: simulatedActionId,
                provider: 'actions',
                actions: new Map([
                  ['execute-start', { equal: 6 }],
                  ['execute', { equal: 6 }],
                ]),
              });
            });

            const executeEvent = events[events.length - 1];
            expect(executeEvent?.kibana?.action?.execution?.usage?.request_body_bytes).to.be(0);
          });
        });
      });
    });
  });
}
