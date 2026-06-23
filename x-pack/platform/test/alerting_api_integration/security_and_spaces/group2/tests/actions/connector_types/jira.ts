/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type httpProxy from 'http-proxy';
import expect from '@kbn/expect';
import type { IValidatedEvent } from '@kbn/event-log-plugin/generated/schemas';

import { getHttpProxyServer } from '@kbn/alerting-api-integration-helpers';
import {
  getExternalServiceSimulatorPath,
  ExternalServiceSimulator,
} from '@kbn/actions-simulators-plugin/server/plugin';
import { TaskErrorSource } from '@kbn/task-manager-plugin/common';
import { MAX_OTHER_FIELDS_LENGTH } from '@kbn/connector-schemas/jira/constants';

import type { FtrProviderContext } from '../../../../../common/ftr_provider_context';
import { getEventLog } from '../../../../../common/lib';

export default function jiraTest({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const kibanaServer = getService('kibanaServer');
  const configService = getService('config');
  const retry = getService('retry');

  const mockJira = {
    config: {
      apiUrl: 'www.jiraisinkibanaactions.com',
      projectKey: 'CK',
    },
    secrets: {
      apiToken: 'elastic',
      email: 'elastic@elastic.co',
    },
    params: {
      subAction: 'pushToService',
      subActionParams: {
        incident: {
          summary: 'a title',
          description: 'a description',
          externalId: null,
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

  let jiraSimulatorURL: string = '<could not determine kibana url>';

  describe('Jira', () => {
    before(() => {
      jiraSimulatorURL = kibanaServer.resolveUrl(
        getExternalServiceSimulatorPath(ExternalServiceSimulator.JIRA)
      );
    });
    describe('Jira - Action Creation', () => {
      it('should return 200 when creating a jira action successfully', async () => {
        const { body: createdAction } = await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A jira action',
            connector_type_id: '.jira',
            config: {
              ...mockJira.config,
              apiUrl: jiraSimulatorURL,
            },
            secrets: mockJira.secrets,
          })
          .expect(200);

        expect(createdAction).to.eql({
          id: createdAction.id,
          is_preconfigured: false,
          is_system_action: false,
          is_deprecated: false,
          name: 'A jira action',
          connector_type_id: '.jira',
          is_missing_secrets: false,
          config: {
            apiUrl: jiraSimulatorURL,
            projectKey: mockJira.config.projectKey,
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
          name: 'A jira action',
          connector_type_id: '.jira',
          is_missing_secrets: false,
          config: {
            apiUrl: jiraSimulatorURL,
            projectKey: mockJira.config.projectKey,
          },
          is_connector_type_deprecated: false,
          auth_mode: 'shared',
        });
      });

      it('should respond with a 400 Bad Request when creating a jira action with no apiUrl', async () => {
        await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A jira action',
            connector_type_id: '.jira',
            config: { projectKey: 'CK' },
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

      it('should respond with a 400 Bad Request when creating a jira action with no projectKey', async () => {
        await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A jira action',
            connector_type_id: '.jira',
            config: { apiUrl: jiraSimulatorURL },
          })
          .expect(400)
          .then((resp: any) => {
            expect(resp.body).to.eql({
              statusCode: 400,
              error: 'Bad Request',
              message: `error validating connector type config: ✖ Invalid input: expected string, received undefined\n  → at projectKey`,
            });
          });
      });

      it('should respond with a 400 Bad Request when creating a jira action with a not present in allowedHosts apiUrl', async () => {
        await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A jira action',
            connector_type_id: '.jira',
            config: {
              apiUrl: 'http://jira.mynonexistent.com',
              projectKey: mockJira.config.projectKey,
            },
            secrets: mockJira.secrets,
          })
          .expect(400)
          .then((resp: any) => {
            expect(resp.body).to.eql({
              statusCode: 400,
              error: 'Bad Request',
              message:
                'error validating connector type config: error configuring connector action: target url "http://jira.mynonexistent.com" is not added to the Kibana config xpack.actions.allowedHosts',
            });
          });
      });

      it('should respond with a 400 Bad Request when creating a jira action without secrets', async () => {
        await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A jira action',
            connector_type_id: '.jira',
            config: {
              apiUrl: jiraSimulatorURL,
              projectKey: mockJira.config.projectKey,
            },
          })
          .expect(400)
          .then((resp: any) => {
            expect(resp.body).to.eql({
              statusCode: 400,
              error: 'Bad Request',
              message: `error validating connector type secrets: ✖ Invalid input: expected string, received undefined\n  → at email\n✖ Invalid input: expected string, received undefined\n  → at apiToken`,
            });
          });
      });
    });

    describe('Jira - Executor', () => {
      let simulatedActionId: string;
      let proxyServer: httpProxy | undefined;
      let proxyHaveBeenCalled = false;

      before(async () => {
        const { body } = await supertest
          .post('/api/actions/connector')
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'A jira simulator',
            connector_type_id: '.jira',
            config: {
              apiUrl: jiraSimulatorURL,
              projectKey: mockJira.config.projectKey,
            },
            secrets: mockJira.secrets,
          });
        simulatedActionId = body.id;

        proxyServer = await getHttpProxyServer(
          kibanaServer.resolveUrl('/'),
          configService.get('kbnTestServer.serverArgs'),
          () => {
            proxyHaveBeenCalled = true;
          }
        );
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
                message: `error validating action params: ✖ Invalid discriminator value. Expected 'getFields' | 'getIncident' | 'handshake' | 'pushToService' | 'issueTypes' | 'fieldsByIssueType' | 'issues' | 'issue'\n  → at subAction`,
                errorSource: TaskErrorSource.USER,
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
                message: `error validating action params: ✖ Invalid input: expected object, received undefined\n  → at subActionParams`,
                errorSource: TaskErrorSource.USER,
              });
            });
        });

        it('should handle failing with a simulated success without title', async () => {
          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockJira.params,
                subActionParams: {
                  incident: {
                    description: 'success',
                  },
                  comments: [],
                },
              },
            })
            .then((resp: any) => {
              expect(resp.body).to.eql({
                connector_id: simulatedActionId,
                status: 'error',
                retry: false,
                message: `error validating action params: ✖ Invalid input: expected string, received undefined\n  → at subActionParams.incident.summary`,
                errorSource: TaskErrorSource.USER,
              });
            });
        });

        it('should handle failing with a simulated success without commentId', async () => {
          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockJira.params,
                subActionParams: {
                  incident: {
                    ...mockJira.params.subActionParams.incident,
                    description: 'success',
                    summary: 'success',
                  },
                  comments: [{ comment: 'comment' }],
                },
              },
            })
            .then((resp: any) => {
              expect(resp.body).to.eql({
                connector_id: simulatedActionId,
                status: 'error',
                retry: false,
                message: `error validating action params: ✖ Invalid input: expected string, received undefined\n  → at subActionParams.comments[0].commentId`,
                errorSource: TaskErrorSource.USER,
              });
            });
        });

        it('should handle failing with a simulated success without comment message', async () => {
          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockJira.params,
                subActionParams: {
                  incident: {
                    ...mockJira.params.subActionParams.incident,
                    summary: 'success',
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
                message: `error validating action params: ✖ Invalid input: expected string, received undefined\n  → at subActionParams.comments[0].comment`,
                errorSource: TaskErrorSource.USER,
              });
            });
        });

        it('should handle failing with a simulated success when labels containing a space', async () => {
          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockJira.params,
                subActionParams: {
                  incident: {
                    ...mockJira.params.subActionParams.incident,
                    issueType: '10006',
                    labels: ['label with spaces'],
                  },
                  comments: [],
                },
              },
            })
            .then((resp: any) => {
              expect(resp.body).to.eql({
                connector_id: simulatedActionId,
                status: 'error',
                retry: false,
                message: `error validating action params: ✖ The label label with spaces cannot contain spaces\n  → at subActionParams.incident.labels[0]`,
                errorSource: TaskErrorSource.USER,
              });
            });
        });

        it('throws when trying to create an incident with too many "otherFields"', async () => {
          const otherFields = new Array(MAX_OTHER_FIELDS_LENGTH + 1)
            .fill('foobar')
            .reduce((acc, curr, idx) => {
              acc[idx] = curr;
              return acc;
            }, {});

          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockJira.params,
                subActionParams: {
                  ...mockJira.params.subActionParams,
                  incident: {
                    ...mockJira.params.subActionParams.incident,
                    otherFields,
                  },
                  comments: [],
                },
              },
            })
            .then((resp: any) => {
              expect(resp.body).to.eql({
                connector_id: simulatedActionId,
                status: 'error',
                retry: false,
                message: `error validating action params: ✖ A maximum of 20 fields in otherFields can be defined at a time.\n  → at subActionParams.incident.otherFields`,
                errorSource: TaskErrorSource.USER,
              });
            });
        });

        it('throws when trying to create an incident with "otherFields" keys that are not allowed', async () => {
          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockJira.params,
                subActionParams: {
                  ...mockJira.params.subActionParams,
                  incident: {
                    ...mockJira.params.subActionParams.incident,
                    otherFields: {
                      summary: 'foo',
                    },
                  },
                  comments: [],
                },
              },
            })
            .then((resp: any) => {
              expect(resp.body).to.eql({
                connector_id: simulatedActionId,
                status: 'error',
                retry: false,
                message: `error validating action params: ✖ The following properties cannot be defined inside otherFields: summary.\n  → at subActionParams.incident.otherFields.summary`,
                errorSource: TaskErrorSource.USER,
              });
            });
        });

        it('does not throw when "otherFields" is a valid JSON object send as string', async () => {
          await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockJira.params,
                subActionParams: {
                  ...mockJira.params.subActionParams,
                  incident: {
                    ...mockJira.params.subActionParams.incident,
                    otherFields: '{ "foo": "bar" }',
                  },
                  comments: [],
                },
              },
            })
            .then((resp: any) => {
              expect(resp.status).to.equal(200);
              expect(resp.body.status).to.eql('ok');
            });
        });
      });

      describe('Execution', () => {
        it('should handle creating an incident without comments', async () => {
          const { body } = await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockJira.params,
                subActionParams: {
                  incident: {
                    ...mockJira.params.subActionParams.incident,
                    issueType: '10006',
                  },
                  comments: [],
                },
              },
            })
            .expect(200);

          expect(proxyHaveBeenCalled).to.equal(true);
          expect(body).to.eql({
            status: 'ok',
            connector_id: simulatedActionId,
            data: {
              id: '123',
              title: 'CK-1',
              pushedDate: '2020-04-27T14:17:45.490Z',
              url: `${jiraSimulatorURL}/browse/CK-1`,
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
                ['execute-start', { gte: 11 }],
                ['execute', { gte: 11 }],
              ]),
            });
          });

          const executeEvent = events.find(
            (e) => e?.event?.action === 'execute' && e?.event?.outcome === 'success'
          );
          expect(executeEvent?.kibana?.action?.execution?.usage?.request_body_bytes).to.be(124);
        });

        it('should handle creating an incident with other fields', async () => {
          const { body } = await supertest
            .post(`/api/actions/connector/${simulatedActionId}/_execute`)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                ...mockJira.params,
                subActionParams: {
                  ...mockJira.params.subActionParams,
                  incident: {
                    ...mockJira.params.subActionParams.incident,
                    otherFields: {
                      foo: 'bar',
                    },
                  },
                  comments: [],
                },
              },
            })
            .expect(200);

          expect(proxyHaveBeenCalled).to.equal(true);
          expect(body).to.eql({
            status: 'ok',
            connector_id: simulatedActionId,
            data: {
              id: '123',
              title: 'CK-1',
              pushedDate: '2020-04-27T14:17:45.490Z',
              url: `${jiraSimulatorURL}/browse/CK-1`,
            },
          });
        });
      });

      after(() => {
        if (proxyServer) {
          proxyServer.close();
        }
      });
    });
  });
}
