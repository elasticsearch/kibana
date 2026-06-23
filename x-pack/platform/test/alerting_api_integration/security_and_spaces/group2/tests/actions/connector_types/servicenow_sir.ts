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
import { MAX_ADDITIONAL_FIELDS_LENGTH } from '@kbn/connector-schemas/servicenow/constants';
import type { FtrProviderContext } from '../../../../../common/ftr_provider_context';
import { getEventLog } from '../../../../../common/lib';

export default function serviceNowSIRTest({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const configService = getService('config');
  const retry = getService('retry');

  const mockServiceNowCommon = {
    config: {
      apiUrl: 'www.servicenowisinkibanaactions.com',
      usesTableApi: false,
    },
    secrets: {
      password: 'elastic',
      username: 'changeme',
    },
    params: {
      subAction: 'pushToService',
      subActionParams: {
        incident: {
          externalId: null,
          short_description: 'Incident title',
          description: 'Incident description',
          dest_ip: ['192.168.1.1', '192.168.1.3'],
          source_ip: ['192.168.1.2', '192.168.1.4'],
          malware_hash: ['5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9'],
          malware_url: ['https://example.com'],
          category: 'software',
          subcategory: 'os',
          correlation_id: 'alertID',
          correlation_display: 'Alerting',
          priority: '1',
        },
        comments: [
          {
            comment: 'first comment',
            commentId: '456',
          },
        ],
      },
    },
  };

  const mockServiceNowBasic = {
    ...mockServiceNowCommon,
    config: {
      apiUrl: 'www.servicenowisinkibanaactions.com',
      usesTableApi: false,
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
      usesTableApi: false,
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

  describe('ServiceNow SIR', () => {
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

    describe('ServiceNow SIR - Action Creation', () => {
      it('should return 200 when creating a servicenow Basic Auth connector successfully', async () => {
        const { body: createdAction } = await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A servicenow action',
            connector_type_id: '.servicenow-sir',
            config: {
              apiUrl: serviceNowSimulatorURL,
              usesTableApi: false,
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
          connector_type_id: '.servicenow-sir',
          is_missing_secrets: false,
          config: {
            apiUrl: serviceNowSimulatorURL,
            usesTableApi: false,
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
          connector_type_id: '.servicenow-sir',
          is_missing_secrets: false,
          config: {
            apiUrl: serviceNowSimulatorURL,
            usesTableApi: false,
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
            connector_type_id: '.servicenow-sir',
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
          connector_type_id: '.servicenow-sir',
          is_missing_secrets: false,
          config: {
            apiUrl: serviceNowSimulatorURL,
            usesTableApi: false,
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
          connector_type_id: '.servicenow-sir',
          is_missing_secrets: false,
          config: {
            apiUrl: serviceNowSimulatorURL,
            usesTableApi: false,
            isOAuth: true,
            clientId: mockServiceNowOAuth.config.clientId,
            jwtKeyId: mockServiceNowOAuth.config.jwtKeyId,
            userIdentifierValue: mockServiceNowOAuth.config.userIdentifierValue,
          },
          is_connector_type_deprecated: false,
          auth_mode: 'shared',
        });
      });

      it('should set the usesTableApi to true when not provided', async () => {
        const { body: createdAction } = await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A servicenow action',
            connector_type_id: '.servicenow-sir',
            config: {
              apiUrl: serviceNowSimulatorURL,
            },
            secrets: mockServiceNowBasic.secrets,
          })
          .expect(200);

        const { body: fetchedAction } = await supertest
          .get(`/api/actions/connector/${createdAction.id}`)
          .expect(200);

        expect(fetchedAction.config.usesTableApi).to.be(true);
      });

      it('should respond with a 400 Bad Request when creating a servicenow Basic Auth connector with no apiUrl', async () => {
        await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A servicenow action',
            connector_type_id: '.servicenow-sir',
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
            connector_type_id: '.servicenow-sir',
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
            connector_type_id: '.servicenow-sir',
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
            connector_type_id: '.servicenow-sir',
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
            connector_type_id: '.servicenow-sir',
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
              connector_type_id: '.servicenow-sir',
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

    describe('ServiceNow SIR - Executor', () => {
      before(async () => {
        const { body } = await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A servicenow simulator',
            connector_type_id: '.servicenow-sir',
            config: {
              apiUrl: serviceNowSimulatorURL,
              usesTableApi: false,
              isOAuth: false,
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
                message: `error validating action params: ✖ Invalid discriminator value. Expected 'getFields' | 'getIncident' | 'handshake' | 'pushToService' | 'getChoices'\n  → at subAction`,
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
                message: `error validating action params: ✖ Invalid input: expected object, received undefined\n  → at subActionParams`,
              });
            });
        });

        it('should handle failing with a simulated success without title', async () => {
          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockServiceNowBasic.params,
                subActionParams: {
                  savedObjectId: 'success',
                },
              },
            })
            .then((resp: any) => {
              expect(resp.body).to.eql({
                connector_id: simulatedActionId,
                status: 'error',
                retry: false,
                errorSource: TaskErrorSource.USER,
                message: `error validating action params: ✖ Unrecognized key: "savedObjectId"\n  → at subActionParams\n✖ Invalid input: expected object, received undefined\n  → at subActionParams.incident`,
              });
            });
        });

        it('should handle failing with a simulated success without commentId', async () => {
          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockServiceNowBasic.params,
                subActionParams: {
                  incident: {
                    ...mockServiceNowBasic.params.subActionParams.incident,
                    short_description: 'success',
                  },
                  comments: [{ comment: 'boo' }],
                },
              },
            })
            .then((resp: any) => {
              expect(resp.body).to.eql({
                connector_id: simulatedActionId,
                status: 'error',
                retry: false,
                errorSource: TaskErrorSource.USER,
                message: `error validating action params: ✖ Invalid input: expected string, received undefined\n  → at subActionParams.comments[0].commentId`,
              });
            });
        });

        it('should handle failing with a simulated success without comment message', async () => {
          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockServiceNowBasic.params,
                subActionParams: {
                  incident: {
                    ...mockServiceNowBasic.params.subActionParams.incident,
                    short_description: 'success',
                  },
                  comments: [{ commentId: 'success' }],
                },
              },
            })
            .then((resp: any) => {
              expect(resp.body).to.eql({
                connector_id: simulatedActionId,
                status: 'error',
                retry: false,
                errorSource: TaskErrorSource.USER,
                message: `error validating action params: ✖ Invalid input: expected string, received undefined\n  → at subActionParams.comments[0].comment`,
              });
            });
        });

        it('throws when trying to create an incident with too many "additional_fields"', async () => {
          const additionalFields = new Array(MAX_ADDITIONAL_FIELDS_LENGTH + 1)
            .fill('foobar')
            .reduce((acc, curr, idx) => {
              acc[idx] = curr;
              return acc;
            }, {});

          const res = await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockServiceNowBasic.params,
                subActionParams: {
                  ...mockServiceNowBasic.params.subActionParams,
                  incident: {
                    ...mockServiceNowBasic.params.subActionParams.incident,
                    additional_fields: additionalFields,
                  },
                  comments: [],
                },
              },
            })
            .expect(200);

          expect(res.body.status).to.eql('error');
        });

        it('throws when trying to create an incident with "additional_fields" keys that are not allowed', async () => {
          const res = await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockServiceNowBasic.params,
                subActionParams: {
                  ...mockServiceNowBasic.params.subActionParams,
                  incident: {
                    ...mockServiceNowBasic.params.subActionParams.incident,
                    additional_fields: {
                      short_description: 'foo',
                    },
                  },
                  comments: [],
                },
              },
            })
            .expect(200);

          expect(res.body.status).to.eql('error');
        });

        it('does not throw when "additional_fields" is a valid JSON object send as string', async () => {
          const res = await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockServiceNowBasic.params,
                subActionParams: {
                  ...mockServiceNowBasic.params.subActionParams,
                  incident: {
                    ...mockServiceNowBasic.params.subActionParams.incident,
                    otherFields: '{ "foo": "bar" }',
                  },
                  comments: [],
                },
              },
            })
            .expect(200);

          expect(res.body.status).to.eql('error');
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
        // Connectors that use the Import set API
        describe('Import set API', () => {
          it('should handle creating an incident without comments', async () => {
            const { body: result } = await supertest
              .post(`/api/actions/connector/${simulatedActionId}/_execute`)
              .set('kbn-xsrf', 'foo')
              .send({
                params: {
                  ...mockServiceNowBasic.params,
                  subActionParams: {
                    incident: mockServiceNowBasic.params.subActionParams.incident,
                    comments: [],
                  },
                },
              })
              .expect(200);

            expect(proxyHaveBeenCalled).to.equal(true);
            expect(result).to.eql({
              status: 'ok',
              connector_id: simulatedActionId,
              data: {
                id: '123',
                title: 'INC01',
                pushedDate: '2020-03-10T12:24:20.000Z',
                url: `${serviceNowSimulatorURL}/nav_to.do?uri=sn_si_incident.do?sys_id=123`,
              },
            });

            const events: IValidatedEvent[] = await retry.try(async () => {
              return await getEventLog({
                getService,
                spaceId: 'default',
                type: 'action',
                id: simulatedActionId,
                provider: 'actions',
                actions: new Map([
                  ['execute-start', { equal: 11 }],
                  ['execute', { equal: 11 }],
                ]),
              });
            });

            const executeEvent = events[events.length - 1];
            expect(executeEvent?.kibana?.action?.execution?.usage?.request_body_bytes).to.be(645);
          });
        });

        // Connectors that use the Table API
        describe('Table API', () => {
          before(async () => {
            const { body } = await supertest
              .post('/api/actions/connector')
              .set('kbn-xsrf', 'foo')
              .send({
                name: 'A servicenow simulator',
                connector_type_id: '.servicenow-sir',
                config: {
                  apiUrl: serviceNowSimulatorURL,
                  usesTableApi: true,
                },
                secrets: mockServiceNowBasic.secrets,
              });
            simulatedActionId = body.id;
          });

          it('should handle creating an incident without comments', async () => {
            const { body: result } = await supertest
              .post(`/api/actions/connector/${simulatedActionId}/_execute`)
              .set('kbn-xsrf', 'foo')
              .send({
                params: {
                  ...mockServiceNowBasic.params,
                  subActionParams: {
                    incident: mockServiceNowBasic.params.subActionParams.incident,
                    comments: [],
                  },
                },
              })
              .expect(200);

            expect(proxyHaveBeenCalled).to.equal(true);
            expect(result).to.eql({
              status: 'ok',
              connector_id: simulatedActionId,
              data: {
                id: '123',
                title: 'INC01',
                pushedDate: '2020-03-10T12:24:20.000Z',
                url: `${serviceNowSimulatorURL}/nav_to.do?uri=sn_si_incident.do?sys_id=123`,
              },
            });
            const events: IValidatedEvent[] = await retry.try(async () => {
              return await getEventLog({
                getService,
                spaceId: 'default',
                type: 'action',
                id: simulatedActionId,
                provider: 'actions',
                actions: new Map([
                  ['execute-start', { equal: 1 }],
                  ['execute', { equal: 1 }],
                ]),
              });
            });

            const executeEvent = events[1];
            expect(executeEvent?.kibana?.action?.execution?.usage?.request_body_bytes).to.be(429);
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
                  ['execute-start', { gte: 2 }],
                  ['execute', { gte: 2 }],
                ]),
              });
            });

            const executeEvent = events[3];
            expect(executeEvent?.kibana?.action?.execution?.usage?.request_body_bytes).to.be(0);
          });
        });
      });
    });
  });
}
