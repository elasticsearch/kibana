/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { expect as expectExpect } from 'expect';
import { omit, padStart } from 'lodash';
import type { estypes } from '@elastic/elasticsearch';
import type { IValidatedEvent } from '@kbn/event-log-plugin/server';
import { nanosToMillis } from '@kbn/event-log-plugin/server';
import type { TaskRunning, TaskRunningStage } from '@kbn/task-manager-plugin/server/task_running';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import { ESTestIndexTool, ES_TEST_INDEX_NAME } from '@kbn/alerting-api-integration-helpers';
import { RULE_SAVED_OBJECT_TYPE } from '@kbn/alerting-plugin/server';
import { UserAtSpaceScenarios, Superuser, SuperuserAtSpace1 } from '../../../scenarios';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import {
  getUrlPrefix,
  getTestRuleData,
  ObjectRemover,
  AlertUtils,
  getUnauthorizedErrorMessage,
  TaskManagerUtils,
  getEventLog,
} from '../../../../common/lib';

export default function alertTests({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const es = getService('es');
  const retry = getService('retry');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const esTestIndexTool = new ESTestIndexTool(es, retry);
  const taskManagerUtils = new TaskManagerUtils(es, retry);

  describe('alerts', () => {
    const authorizationIndex = '.kibana-test-authorization';
    const alertAsDataIndex = '.internal.alerts-observability.test.alerts.alerts-default-000001';
    const objectRemover = new ObjectRemover(supertest);

    before(async () => {
      await esTestIndexTool.destroy();
      await esTestIndexTool.setup();
      await es.indices.create({ index: authorizationIndex });
    });

    afterEach(() => objectRemover.removeAll());

    after(async () => {
      await esTestIndexTool.destroy();
      await es.indices.delete({ index: authorizationIndex });
      await es.deleteByQuery({
        index: alertAsDataIndex,
        query: { match_all: {} },
        ignore_unavailable: true,
      });
    });

    for (const scenario of UserAtSpaceScenarios) {
      const { user, space } = scenario;

      describe(scenario.id, () => {
        let alertUtils: AlertUtils;
        let indexRecordActionId: string;

        const getAlertInfo = (alertId: string, actions: any) => ({
          id: alertId,
          consumer: 'alertsFixture',
          spaceId: space.id,
          namespace: space.id,
          name: 'abc',
          enabled: true,
          notifyWhen: 'onActiveAlert',
          schedule: {
            interval: '1m',
          },
          tags: ['tag-A', 'tag-B'],
          throttle: '1m',
          createdBy: user.fullName,
          updatedBy: user.fullName,
          actions: actions.map((action: any) => {
            const { connector_type_id, group, id, params, uuid } = action;
            return {
              actionTypeId: connector_type_id,
              group,
              id,
              params,
              uuid,
            };
          }),
          producer: 'alertsFixture',
          revision: 0,
          ruleTypeId: 'test.always-firing',
          ruleTypeName: 'Test: Always Firing',
          muteAll: false,
          snoozeSchedule: [],
        });

        before(async () => {
          const { body: createdAction } = await supertest
            .post(`${getUrlPrefix(space.id)}/api/actions/connector`)
            .set('kbn-xsrf', 'foo')
            .send({
              name: 'My action',
              connector_type_id: 'test.index-record',
              config: {
                unencrypted: `This value shouldn't get encrypted`,
              },
              secrets: {
                encrypted: 'This value should be encrypted',
              },
            })
            .expect(200);
          indexRecordActionId = createdAction.id;
          alertUtils = new AlertUtils({
            user,
            space,
            supertestWithoutAuth,
            indexRecordActionId,
            objectRemover,
          });
        });
        after(() => objectRemover.add(space.id, indexRecordActionId, 'connector', 'actions'));

        it('should schedule task, run alert and schedule actions when appropriate', async () => {
          const testStart = new Date();
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringAction({ reference });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'global_read at space1':
            case 'space_1_all at space2':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'superuser at space1':
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              expect(response.statusCode).to.eql(200);

              // Wait for the action to index a document before disabling the alert and waiting for tasks to finish
              await esTestIndexTool.waitForDocs('action:test.index-record', reference);

              await taskManagerUtils.waitForAllTasksIdle(testStart);

              const alertId = response.body.id;
              await alertUtils.disable(alertId);
              await taskManagerUtils.waitForDisabled(alertId, testStart);

              // Ensure only 1 alert executed with proper params
              const alertSearchResult = await esTestIndexTool.search(
                'alert:test.always-firing',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(alertSearchResult.body.hits.total.value).to.eql(1);
              const alertSearchResultWithoutDates = omit(
                alertSearchResult.body.hits.hits[0]._source as object,
                ['alertInfo.createdAt', 'alertInfo.updatedAt', 'alertInfo.lastEnabledAt']
              );
              expect(alertSearchResultWithoutDates).to.eql({
                source: 'alert:test.always-firing',
                reference,
                state: {},
                params: {
                  index: ES_TEST_INDEX_NAME,
                  reference,
                },
                alertInfo: getAlertInfo(alertId, response.body.actions),
              });
              // @ts-expect-error _source: unknown
              expect(alertSearchResult.body.hits.hits[0]._source.alertInfo.createdAt).to.match(
                /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/
              );

              // @ts-expect-error _source: unknown
              expect(alertSearchResult.body.hits.hits[0]._source.alertInfo.updatedAt).to.match(
                /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/
              );

              // Ensure only 1 action executed with proper params
              const actionSearchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(actionSearchResult.body.hits.total.value).to.eql(1);
              expect(actionSearchResult.body.hits.hits[0]._source).to.eql({
                config: {
                  unencrypted: `This value shouldn't get encrypted`,
                },
                secrets: {
                  encrypted: 'This value should be encrypted',
                },
                params: {
                  index: ES_TEST_INDEX_NAME,
                  reference,
                  message: `
ruleId: ${alertId},
ruleName: abc,
spaceId: ${space.id},
tags: tag-A,tag-B,
alertId: 1,
alertActionGroup: default,
instanceContextValue: true,
instanceStateValue: true
`.trim(),
                },
                reference,
                source: 'action:test.index-record',
              });

              await taskManagerUtils.waitForActionTaskParamsToBeCleanedUp(testStart);

              await validateEventLog({
                spaceId: space.id,
                alertId,
                ruleTypeId: 'test.always-firing',
                outcome: 'success',
                message: `rule executed: test.always-firing:${alertId}: 'abc'`,
                ruleObject: alertSearchResultWithoutDates,
              });
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should schedule task, run alert and schedule preconfigured actions when appropriate', async () => {
          const testStart = new Date();
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringAction({
            reference,
            indexRecordActionId: 'preconfigured.test.index-record',
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'global_read at space1':
            case 'space_1_all at space2':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'superuser at space1':
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              expect(response.statusCode).to.eql(200);

              // Wait for the action to index a document before disabling the alert and waiting for tasks to finish
              await esTestIndexTool.waitForDocs('action:test.index-record', reference);

              await taskManagerUtils.waitForAllTasksIdle(testStart);

              const alertId = response.body.id;
              await alertUtils.disable(alertId);
              await taskManagerUtils.waitForDisabled(alertId, testStart);

              // Ensure only 1 alert executed with proper params
              const alertSearchResult = await esTestIndexTool.search(
                'alert:test.always-firing',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(alertSearchResult.body.hits.total.value).to.eql(1);
              const alertSearchResultWithoutDates = omit(
                alertSearchResult.body.hits.hits[0]._source as object,
                ['alertInfo.createdAt', 'alertInfo.updatedAt', 'alertInfo.lastEnabledAt']
              );
              expect(alertSearchResultWithoutDates).to.eql({
                source: 'alert:test.always-firing',
                reference,
                state: {},
                params: {
                  index: ES_TEST_INDEX_NAME,
                  reference,
                },
                alertInfo: getAlertInfo(alertId, response.body.actions),
              });

              // @ts-expect-error _source: unknown
              expect(alertSearchResult.body.hits.hits[0]._source.alertInfo.createdAt).to.match(
                /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/
              );
              // @ts-expect-error _source: unknown
              expect(alertSearchResult.body.hits.hits[0]._source.alertInfo.updatedAt).to.match(
                /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/
              );
              // Ensure only 1 action executed with proper params
              const actionSearchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(actionSearchResult.body.hits.total.value).to.eql(1);
              expect(actionSearchResult.body.hits.hits[0]._source).to.eql({
                config: {
                  unencrypted: 'ignored-but-required',
                },
                secrets: {
                  encrypted: 'this-is-also-ignored-and-also-required',
                },
                params: {
                  index: ES_TEST_INDEX_NAME,
                  reference,
                  message: `
ruleId: ${alertId},
ruleName: abc,
spaceId: ${space.id},
tags: tag-A,tag-B,
alertId: 1,
alertActionGroup: default,
instanceContextValue: true,
instanceStateValue: true
`.trim(),
                },
                reference,
                source: 'action:test.index-record',
              });

              await taskManagerUtils.waitForActionTaskParamsToBeCleanedUp(testStart);
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should pass updated alert params to executor', async () => {
          const testStart = new Date();
          // create an alert
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringAction({
            reference,
            overwrites: { throttle: null },
          });

          // only need to test creation success paths
          if (response.statusCode !== 200) return;

          // Wait for the action to index a document before disabling the alert and waiting for tasks to finish
          await esTestIndexTool.waitForDocs('action:test.index-record', reference);

          // Avoid invalidating an API key while the alert is executing
          await taskManagerUtils.waitForAllTasksIdle(testStart);

          // update the alert with super user
          const alertId = response.body.id;
          const reference2 = alertUtils.generateReference();
          const response2 = await alertUtils.updateAlwaysFiringAction({
            alertId,
            actionId: indexRecordActionId,
            user: Superuser,
            reference: reference2,
            overwrites: {
              name: 'def',
              tags: ['fee', 'fi', 'fo'],
              // This will cause the task to re-run on update
              schedule: { interval: '59s' },
            },
          });

          expect(response2.statusCode).to.eql(200);

          // make sure alert info passed to executor is correct
          await esTestIndexTool.waitForDocs('alert:test.always-firing', reference2);

          await taskManagerUtils.waitForAllTasksIdle(testStart);

          await alertUtils.disable(alertId);
          const alertSearchResult = await esTestIndexTool.search(
            'alert:test.always-firing',
            reference2
          );

          // @ts-expect-error doesnt handle total: number
          expect(alertSearchResult.body.hits.total.value).to.be.greaterThan(0);
          const alertSearchResultInfoWithoutDates = omit(
            // @ts-expect-error _source: unknown
            alertSearchResult.body.hits.hits[0]._source.alertInfo,
            ['createdAt', 'updatedAt', 'lastEnabledAt']
          );
          expect(alertSearchResultInfoWithoutDates).to.eql({
            id: alertId,
            consumer: 'alertsFixture',
            spaceId: space.id,
            namespace: space.id,
            name: 'def',
            enabled: true,
            notifyWhen: 'onActiveAlert',
            schedule: {
              interval: '59s',
            },
            tags: ['fee', 'fi', 'fo'],
            throttle: '1m',
            createdBy: user.fullName,
            updatedBy: Superuser.fullName,
            actions: response2.body.actions.map((action: any) => {
              const { connector_type_id, group, id, params, uuid } = action;
              return {
                actionTypeId: connector_type_id,
                group,
                id,
                params,
                uuid,
              };
            }),
            producer: 'alertsFixture',
            revision: 1,
            ruleTypeId: 'test.always-firing',
            ruleTypeName: 'Test: Always Firing',
            muteAll: false,
            snoozeSchedule: [],
          });

          // @ts-expect-error _source: unknown
          expect(alertSearchResult.body.hits.hits[0]._source.alertInfo.createdAt).to.match(
            /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/
          );
          // @ts-expect-error _source: unknown
          expect(alertSearchResult.body.hits.hits[0]._source.alertInfo.updatedAt).to.match(
            /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/
          );
        });

        it('should handle custom retry logic when appropriate', async () => {
          const testStart = new Date().toISOString();
          // We have to provide the test.rate-limit the next runAt, for testing purposes
          const retryDate = new Date(Date.now() + 60000);

          const { body: createdAction } = await supertest
            .post(`${getUrlPrefix(space.id)}/api/actions/connector`)
            .set('kbn-xsrf', 'foo')
            .send({
              name: 'Test rate limit',
              connector_type_id: 'test.rate-limit',
              config: {},
            })
            .expect(200);
          objectRemover.add(space.id, createdAction.id, 'connector', 'actions');

          const reference = alertUtils.generateReference();
          const response = await supertestWithoutAuth
            .post(`${getUrlPrefix(space.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .auth(user.username, user.password)
            .send(
              getTestRuleData({
                rule_type_id: 'test.always-firing',
                params: {
                  index: ES_TEST_INDEX_NAME,
                  reference: 'create-test-2',
                },
                actions: [
                  {
                    group: 'default',
                    id: createdAction.id,
                    params: {
                      reference,
                      index: ES_TEST_INDEX_NAME,
                      retryAt: retryDate.getTime(),
                    },
                  },
                ],
              })
            );

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'global_read at space1':
            case 'space_1_all at space2':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'superuser at space1':
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              expect(response.statusCode).to.eql(200);
              objectRemover.add(space.id, response.body.id, 'rule', 'alerting');

              // Wait for the task to be attempted once and idle
              const scheduledActionTask: estypes.SearchHit<
                TaskRunning<TaskRunningStage.RAN, ConcreteTaskInstance>
              > = await retry.try(async () => {
                const searchResult = await es.search<
                  TaskRunning<TaskRunningStage.RAN, ConcreteTaskInstance>
                >({
                  index: '.kibana_task_manager',
                  query: {
                    bool: {
                      must: [
                        {
                          term: {
                            'task.status': 'idle',
                          },
                        },
                        {
                          term: {
                            'task.attempts': 1,
                          },
                        },
                        {
                          term: {
                            'task.taskType': 'actions:test.rate-limit',
                          },
                        },
                        {
                          range: {
                            'task.scheduledAt': {
                              gte: testStart,
                            },
                          },
                        },
                      ],
                    },
                  },
                });
                expect((searchResult.hits.total as estypes.SearchTotalHits).value).to.eql(1);
                return searchResult.hits.hits[0];
              });

              // Ensure the next runAt is set to the retryDate by custom logic
              expect(scheduledActionTask._source!.task.runAt).to.eql(retryDate.toISOString());
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should have proper callCluster and savedObjectsClient authorization for alert type executor when appropriate', async () => {
          let searchResult: any;
          const testStart = new Date();
          const reference = alertUtils.generateReference();
          const response = await supertestWithoutAuth
            .post(`${getUrlPrefix(space.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .auth(user.username, user.password)
            .send(
              getTestRuleData({
                rule_type_id: 'test.authorization',
                params: {
                  callClusterAuthorizationIndex: authorizationIndex,
                  savedObjectsClientType: 'dashboard',
                  savedObjectsClientId: '1',
                  index: ES_TEST_INDEX_NAME,
                  reference,
                },
              })
            );

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.authorization',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_alerts_none_actions at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              expect(response.statusCode).to.eql(200);
              objectRemover.add(space.id, response.body.id, 'rule', 'alerting');

              // Wait for test.authorization to index a document before disabling the alert and waiting for tasks to finish
              await esTestIndexTool.waitForDocs('alert:test.authorization', reference);
              await alertUtils.disable(response.body.id);
              await taskManagerUtils.waitForDisabled(response.body.id, testStart);

              // Ensure only 1 document exists with proper params
              searchResult = await esTestIndexTool.search('alert:test.authorization', reference);
              expect(searchResult.body.hits.total.value).to.eql(1);
              expect(searchResult.body.hits.hits[0]._source.state).to.eql({
                callClusterSuccess: false,
                callScopedClusterSuccess: false,
                savedObjectsClientSuccess: false,
                callClusterError: {
                  ...searchResult.body.hits.hits[0]._source.state.callClusterError,
                },
                callScopedClusterError: {
                  ...searchResult.body.hits.hits[0]._source.state.callScopedClusterError,
                },
                savedObjectsClientError: {
                  ...searchResult.body.hits.hits[0]._source.state.savedObjectsClientError,
                  output: {
                    ...searchResult.body.hits.hits[0]._source.state.savedObjectsClientError.output,
                    statusCode: 403,
                  },
                },
              });
              break;
            case 'superuser at space1':
              expect(response.statusCode).to.eql(200);
              objectRemover.add(space.id, response.body.id, 'rule', 'alerting');

              // Wait for test.authorization to index a document before disabling the alert and waiting for tasks to finish
              await esTestIndexTool.waitForDocs('alert:test.authorization', reference);
              await alertUtils.disable(response.body.id);
              await taskManagerUtils.waitForDisabled(response.body.id, testStart);

              // Ensure only 1 document exists with proper params
              searchResult = await esTestIndexTool.search('alert:test.authorization', reference);
              expect(searchResult.body.hits.total.value).to.eql(1);
              expect(searchResult.body.hits.hits[0]._source.state).to.eql({
                callClusterSuccess: true,
                callScopedClusterSuccess: true,
                savedObjectsClientSuccess: false,
                savedObjectsClientError: {
                  ...searchResult.body.hits.hits[0]._source.state.savedObjectsClientError,
                  output: {
                    ...searchResult.body.hits.hits[0]._source.state.savedObjectsClientError.output,
                    statusCode: 404,
                  },
                },
              });
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should have proper callCluster and savedObjectsClient authorization for action type executor when appropriate', async () => {
          let searchResult: any;
          const testStart = new Date();
          const reference = alertUtils.generateReference();
          const { body: createdAction } = await supertest
            .post(`${getUrlPrefix(space.id)}/api/actions/connector`)
            .set('kbn-xsrf', 'foo')
            .send({
              name: 'My action',
              connector_type_id: 'test.authorization',
            })
            .expect(200);
          objectRemover.add(space.id, createdAction.id, 'connector', 'actions');
          const response = await supertestWithoutAuth
            .post(`${getUrlPrefix(space.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .auth(user.username, user.password)
            .send(
              getTestRuleData({
                rule_type_id: 'test.always-firing',
                params: {
                  index: ES_TEST_INDEX_NAME,
                  reference,
                },
                actions: [
                  {
                    group: 'default',
                    id: createdAction.id,
                    params: {
                      callClusterAuthorizationIndex: authorizationIndex,
                      savedObjectsClientType: 'dashboard',
                      savedObjectsClientId: '1',
                      index: ES_TEST_INDEX_NAME,
                      reference,
                    },
                  },
                ],
              })
            );

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              expect(response.statusCode).to.eql(200);
              objectRemover.add(space.id, response.body.id, 'rule', 'alerting');

              // Ensure test.authorization indexed 1 document before disabling the alert and waiting for tasks to finish
              await esTestIndexTool.waitForDocs('action:test.authorization', reference);
              await alertUtils.disable(response.body.id);
              await taskManagerUtils.waitForDisabled(response.body.id, testStart);

              // Ensure only 1 document with proper params exists
              searchResult = await esTestIndexTool.search('action:test.authorization', reference);
              expect(searchResult.body.hits.total.value).to.eql(1);
              expect(searchResult.body.hits.hits[0]._source.state).to.eql({
                callClusterSuccess: false,
                callScopedClusterSuccess: false,
                savedObjectsClientSuccess: false,
                callClusterError: {
                  ...searchResult.body.hits.hits[0]._source.state.callClusterError,
                },
                callScopedClusterError: {
                  ...searchResult.body.hits.hits[0]._source.state.callScopedClusterError,
                },
                savedObjectsClientError: {
                  ...searchResult.body.hits.hits[0]._source.state.savedObjectsClientError,
                  output: {
                    ...searchResult.body.hits.hits[0]._source.state.savedObjectsClientError.output,
                    statusCode: 403,
                  },
                },
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'superuser at space1':
              expect(response.statusCode).to.eql(200);
              objectRemover.add(space.id, response.body.id, 'rule', 'alerting');

              // Ensure test.authorization indexed 1 document before disabling the alert and waiting for tasks to finish
              await esTestIndexTool.waitForDocs('action:test.authorization', reference);
              await alertUtils.disable(response.body.id);
              await taskManagerUtils.waitForDisabled(response.body.id, testStart);

              // Ensure only 1 document with proper params exists
              searchResult = await esTestIndexTool.search('action:test.authorization', reference);
              expect(searchResult.body.hits.total.value).to.eql(1);
              expect(searchResult.body.hits.hits[0]._source.state).to.eql({
                callClusterSuccess: true,
                callScopedClusterSuccess: true,
                savedObjectsClientSuccess: false,
                savedObjectsClientError: {
                  ...searchResult.body.hits.hits[0]._source.state.savedObjectsClientError,
                  output: {
                    ...searchResult.body.hits.hits[0]._source.state.savedObjectsClientError.output,
                    statusCode: 404,
                  },
                },
              });
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should throttle alerts when appropriate', async () => {
          const testStart = new Date();
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringAction({
            reference,
            overwrites: {
              schedule: { interval: '1s' },
            },
            notifyWhen: 'onThrottleInterval',
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
            case 'superuser at space1':
              expect(response.statusCode).to.eql(200);
              // Wait until alerts scheduled actions 3 times before disabling the alert and waiting for tasks to finish
              await esTestIndexTool.waitForDocs('alert:test.always-firing', reference, 3);
              await alertUtils.disable(response.body.id);
              await taskManagerUtils.waitForDisabled(response.body.id, testStart);

              // Ensure actions only executed once
              const searchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(searchResult.body.hits.total.value).to.eql(1);
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should throttle alerts with throttled action when appropriate', async () => {
          const testStart = new Date();
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringAction({
            reference,
            overwrites: {
              schedule: { interval: '1s' },
            },
            notifyWhen: 'onThrottleInterval',
            throttle: '1m',
            summary: false,
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
            case 'superuser at space1':
              expect(response.statusCode).to.eql(200);
              // Wait until alerts scheduled actions 3 times before disabling the alert and waiting for tasks to finish
              await esTestIndexTool.waitForDocs('alert:test.always-firing', reference, 3);
              await alertUtils.disable(response.body.id);
              await taskManagerUtils.waitForDisabled(response.body.id, testStart);

              // Ensure actions only executed once
              const searchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(searchResult.body.hits.total.value).to.eql(1);
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should not throttle when changing groups', async () => {
          const testStart = new Date();
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringAction({
            reference,
            overwrites: {
              schedule: { interval: '1s' },
              params: {
                index: ES_TEST_INDEX_NAME,
                reference,
                groupsToScheduleActionsInSeries: ['default', 'other'],
              },
              actions: [
                {
                  group: 'default',
                  id: indexRecordActionId,
                  params: {
                    index: ES_TEST_INDEX_NAME,
                    reference,
                    message: 'from:default',
                  },
                },
                {
                  group: 'other',
                  id: indexRecordActionId,
                  params: {
                    index: ES_TEST_INDEX_NAME,
                    reference,
                    message: 'from:other',
                  },
                },
              ],
            },
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
            case 'superuser at space1':
              expect(response.statusCode).to.eql(200);
              // Wait for actions to execute twice before disabling the alert and waiting for tasks to finish
              await esTestIndexTool.waitForDocs('action:test.index-record', reference, 2);
              await alertUtils.disable(response.body.id);
              await taskManagerUtils.waitForDisabled(response.body.id, testStart);

              // Ensure only 2 actions with proper params exists
              const searchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(searchResult.body.hits.total.value).to.eql(2);
              const messages: string[] = searchResult.body.hits.hits.map(
                // @ts-expect-error _search: unknown
                (hit: { _source: { params: { message: string } } }) => hit._source.params.message
              );
              expect(messages.sort()).to.eql(['from:default', 'from:other']);
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should reset throttle window when not firing', async () => {
          const testStart = new Date();
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringAction({
            reference,
            overwrites: {
              schedule: { interval: '1s' },
              params: {
                index: ES_TEST_INDEX_NAME,
                reference,
                groupsToScheduleActionsInSeries: ['default', null, 'default'],
              },
            },
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
            case 'superuser at space1':
              expect(response.statusCode).to.eql(200);
              // Actions should execute twice before widning things down
              await esTestIndexTool.waitForDocs('action:test.index-record', reference, 2);
              await alertUtils.disable(response.body.id);
              await taskManagerUtils.waitForDisabled(response.body.id, testStart);

              // Ensure only 2 actions are executed
              const searchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(searchResult.body.hits.total.value).to.eql(2);
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it(`shouldn't schedule actions when alert is muted`, async () => {
          const testStart = new Date();
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringAction({
            reference,
            overwrites: {
              enabled: false,
              schedule: { interval: '1s' },
            },
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
            case 'superuser at space1':
              await alertUtils.muteAll(response.body.id);
              await alertUtils.enable(response.body.id);

              // Wait until alerts schedule actions twice to ensure actions had a chance to skip
              // execution once before disabling the alert and waiting for tasks to finish
              await esTestIndexTool.waitForDocs('alert:test.always-firing', reference, 2);
              await alertUtils.disable(response.body.id);
              await taskManagerUtils.waitForDisabled(response.body.id, testStart);

              // Should not have executed any action
              const executedActionsResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(executedActionsResult.body.hits.total.value).to.eql(0);
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it(`shouldn't schedule actions when alert instance is muted`, async () => {
          const testStart = new Date();
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringAction({
            reference,
            overwrites: {
              enabled: false,
              schedule: { interval: '1s' },
            },
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
            case 'superuser at space1':
              await alertUtils.muteInstance(response.body.id, '1');
              await alertUtils.enable(response.body.id);

              // Wait until alerts scheduled actions twice to ensure actions had a chance to execute
              // once before disabling the alert and waiting for tasks to finish
              await esTestIndexTool.waitForDocs('alert:test.always-firing', reference, 2);
              await alertUtils.disable(response.body.id);
              await taskManagerUtils.waitForDisabled(response.body.id, testStart);

              // Should not have executed any action
              const executedActionsResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(executedActionsResult.body.hits.total.value).to.eql(0);
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it(`should unmute all instances when unmuting an alert`, async () => {
          const testStart = new Date();
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringAction({
            reference,
            overwrites: {
              enabled: false,
              schedule: { interval: '1m' },
            },
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
            case 'superuser at space1':
              await alertUtils.muteInstance(response.body.id, '1');
              await alertUtils.muteAll(response.body.id);
              await alertUtils.unmuteAll(response.body.id);
              await alertUtils.enable(response.body.id);

              // Ensure actions are executed once before disabling the alert and waiting for tasks to finish
              await esTestIndexTool.waitForDocs('action:test.index-record', reference, 1);
              await alertUtils.disable(response.body.id);
              await taskManagerUtils.waitForDisabled(response.body.id, testStart);

              // Should have one document indexed by the action
              const searchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(searchResult.body.hits.total.value).to.eql(1);
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should schedule actions for summary of alerts per rule run', async () => {
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringRuleWithSummaryAction({
            reference,
            overwrites: {
              schedule: { interval: '1s' },
            },
            notifyWhen: 'onActiveAlert',
            throttle: null,
            summary: true,
            alertsFilter: {
              query: { kql: 'kibana.alert.rule.name:abc', filters: [] },
            },
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing-alert-as-data',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
            case 'superuser at space1':
              expect(response.statusCode).to.eql(200);

              await esTestIndexTool.waitForDocs('rule:test.always-firing-alert-as-data', reference);
              await esTestIndexTool.waitForDocs('action:test.index-record', reference);
              const searchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );

              // @ts-expect-error doesnt handle total: number
              expect(searchResult.body.hits.total.value).to.be.greaterThan(0);
              // @ts-expect-error _source: unknown
              expect(searchResult.body.hits.hits[0]._source.params.message).to.eql(
                'Alerts, all:2, new:2 IDs:[1,2,], ongoing:0 IDs:[], recovered:0 IDs:[]'
              );
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should filter alerts by kql', async () => {
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringRuleWithSummaryAction({
            reference,
            overwrites: {
              schedule: { interval: '1h' },
            },
            notifyWhen: 'onActiveAlert',
            throttle: null,
            summary: true,
            alertsFilter: {
              query: { kql: 'kibana.alert.instance.id:1', filters: [] },
            },
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing-alert-as-data',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
            case 'superuser at space1':
              expect(response.statusCode).to.eql(200);

              await esTestIndexTool.waitForDocs('rule:test.always-firing-alert-as-data', reference);
              await esTestIndexTool.waitForDocs('action:test.index-record', reference);
              const searchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );

              // @ts-expect-error doesnt handle total: number
              expect(searchResult.body.hits.total.value).to.eql(1);
              // @ts-expect-error _source: unknown
              expect(searchResult.body.hits.hits[0]._source.params.message).to.eql(
                'Alerts, all:1, new:1 IDs:[1,], ongoing:0 IDs:[], recovered:0 IDs:[]'
              );
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should filter alerts by hours', async () => {
          const now = new Date();
          now.setHours(now.getHours() + 1);
          const hour = padStart(now.getUTCHours().toString(), 2, '0');
          const minutes = padStart(now.getUTCMinutes().toString(), 2, '0');

          const start = `${hour}:${minutes}`;
          const end = `${hour}:${minutes}`;

          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringRuleWithSummaryAction({
            reference,
            overwrites: {
              schedule: { interval: '1s' },
            },
            notifyWhen: 'onActiveAlert',
            throttle: null,
            summary: true,
            alertsFilter: {
              timeframe: {
                days: [1, 2, 3, 4, 5, 6, 7],
                timezone: 'UTC',
                hours: { start, end },
              },
            },
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing-alert-as-data',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
            case 'superuser at space1':
              expect(response.statusCode).to.eql(200);

              await esTestIndexTool.waitForDocs('rule:test.always-firing-alert-as-data', reference);
              const searchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );

              // @ts-expect-error doesnt handle total: number
              expect(searchResult.body.hits.total.value).to.eql(0);
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should schedule actions for summary of alerts on a custom interval', async () => {
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringRuleWithSummaryAction({
            reference,
            overwrites: {
              schedule: { interval: '3s' },
            },
            notifyWhen: 'onThrottleInterval',
            throttle: '10s',
            summary: true,
            messageTemplate: `{{alerts}}`,
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing-alert-as-data',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
            case 'superuser at space1':
              expect(response.statusCode).to.eql(200);

              await esTestIndexTool.waitForDocs('rule:test.always-firing-alert-as-data', reference); // rule execution
              await esTestIndexTool.waitForDocs('action:test.index-record', reference, 2); // action execution
              const searchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(searchResult.body.hits.total.value).to.eql(2);
              expectExpect(
                // Summary action is executed on first rule run then skipped 4 times (throttle is 5s and schedule.interval is 1s)
                // @ts-expect-error _source: unknown
                JSON.parse(searchResult.body.hits.hits[0]._source.params.message)
              ).toEqual(
                expectExpect.objectContaining({
                  new: {
                    count: 2,
                    data: [
                      {
                        _id: expectExpect.any(String),
                        _index: '.internal.alerts-observability.test.alerts.alerts-default-000001',
                        kibana: {
                          alert: {
                            action_group: 'default',
                            flapping_history: expectExpect.any(Array),
                            maintenance_window_ids: [],
                            maintenance_window_names: [],
                            pending_recovered_count: 0,
                            severity_improving: false,
                            snoozed: false,
                            muted: false,
                            rule: {
                              parameters: {
                                index: 'kibana-alerting-test-data',
                                reference,
                              },
                              category: 'Test: Always Firing Alert As Data',
                              consumer: 'alertsFixture',
                              execution: {
                                uuid: expectExpect.any(String),
                                timestamp: expectExpect.any(String),
                              },
                              name: 'abc',
                              producer: 'alertsFixture',
                              revision: 0,
                              rule_type_id: 'test.always-firing-alert-as-data',
                              uuid: expectExpect.any(String),
                              tags: ['tag-A', 'tag-B'],
                            },
                            consecutive_matches: 1,
                            duration: { us: 0 },
                            time_range: { gte: expectExpect.any(String) },
                            instance: { id: '1' },
                            start: expectExpect.any(String),
                            uuid: expectExpect.any(String),
                            status: 'active',
                            workflow_status: 'open',
                            flapping: false,
                          },
                          space_ids: ['space1'],
                          version: expectExpect.any(String),
                        },
                        '@timestamp': expectExpect.any(String),
                        event: { kind: 'signal', action: 'open' },
                        tags: ['tag-A', 'tag-B'],
                      },
                      {
                        _id: expectExpect.any(String),
                        _index: '.internal.alerts-observability.test.alerts.alerts-default-000001',
                        kibana: {
                          alert: {
                            action_group: 'default',
                            flapping_history: expectExpect.any(Array),
                            maintenance_window_ids: [],
                            maintenance_window_names: [],
                            pending_recovered_count: 0,
                            severity_improving: false,
                            snoozed: false,
                            muted: false,
                            rule: {
                              parameters: {
                                index: 'kibana-alerting-test-data',
                                reference,
                              },
                              category: 'Test: Always Firing Alert As Data',
                              consumer: 'alertsFixture',
                              execution: {
                                timestamp: expectExpect.any(String),
                                uuid: expectExpect.any(String),
                              },
                              name: 'abc',
                              producer: 'alertsFixture',
                              revision: 0,
                              rule_type_id: 'test.always-firing-alert-as-data',
                              uuid: expectExpect.any(String),
                              tags: ['tag-A', 'tag-B'],
                            },
                            consecutive_matches: 1,
                            duration: { us: 0 },
                            time_range: { gte: expectExpect.any(String) },
                            instance: { id: '2' },
                            start: expectExpect.any(String),
                            uuid: expectExpect.any(String),
                            status: 'active',
                            workflow_status: 'open',
                            flapping: false,
                          },
                          space_ids: ['space1'],
                          version: expectExpect.any(String),
                        },
                        '@timestamp': expectExpect.any(String),
                        event: { kind: 'signal', action: 'open' },
                        tags: ['tag-A', 'tag-B'],
                      },
                    ],
                  },
                  ongoing: { count: 0, data: [] },
                  recovered: { count: 0, data: [] },
                })
              );
              expectExpect(
                // @ts-expect-error _source: unknown
                //  Summary action is executed on the fifth rule run. The new alerts in the first execution become ongoing
                JSON.parse(searchResult.body.hits.hits[1]._source.params.message)
              ).toEqual(
                expectExpect.objectContaining({
                  new: { count: 0, data: [] },
                  ongoing: {
                    count: 2,
                    data: [
                      {
                        _id: expectExpect.any(String),
                        _index: '.internal.alerts-observability.test.alerts.alerts-default-000001',
                        kibana: {
                          alert: {
                            action_group: 'default',
                            flapping_history: expectExpect.any(Array),
                            maintenance_window_ids: [],
                            maintenance_window_names: [],
                            pending_recovered_count: 0,
                            previous_action_group: 'default',
                            muted: false,
                            rule: {
                              parameters: {
                                index: 'kibana-alerting-test-data',
                                reference,
                              },
                              category: 'Test: Always Firing Alert As Data',
                              consumer: 'alertsFixture',
                              execution: {
                                timestamp: expectExpect.any(String),
                                uuid: expectExpect.any(String),
                              },
                              name: 'abc',
                              producer: 'alertsFixture',
                              revision: 0,
                              rule_type_id: 'test.always-firing-alert-as-data',
                              uuid: expectExpect.any(String),
                              tags: ['tag-A', 'tag-B'],
                            },
                            consecutive_matches: expectExpect.any(Number),
                            duration: { us: expectExpect.any(Number) },
                            time_range: { gte: expectExpect.any(String) },
                            instance: { id: '1' },
                            snoozed: false,
                            start: expectExpect.any(String),
                            uuid: expectExpect.any(String),
                            status: 'active',
                            workflow_status: 'open',
                            flapping: false,
                          },
                          space_ids: ['space1'],
                          version: expectExpect.any(String),
                        },
                        '@timestamp': expectExpect.any(String),
                        event: { kind: 'signal', action: 'active' },
                        tags: ['tag-A', 'tag-B'],
                      },
                      {
                        _id: expectExpect.any(String),
                        _index: '.internal.alerts-observability.test.alerts.alerts-default-000001',
                        kibana: {
                          alert: {
                            action_group: 'default',
                            flapping_history: expectExpect.any(Array),
                            maintenance_window_ids: [],
                            maintenance_window_names: [],
                            pending_recovered_count: 0,
                            previous_action_group: 'default',
                            muted: false,
                            rule: {
                              parameters: {
                                index: 'kibana-alerting-test-data',
                                reference,
                              },
                              category: 'Test: Always Firing Alert As Data',
                              consumer: 'alertsFixture',
                              execution: {
                                timestamp: expectExpect.any(String),
                                uuid: expectExpect.any(String),
                              },
                              name: 'abc',
                              producer: 'alertsFixture',
                              revision: 0,
                              rule_type_id: 'test.always-firing-alert-as-data',
                              uuid: expectExpect.any(String),
                              tags: ['tag-A', 'tag-B'],
                            },
                            consecutive_matches: expectExpect.any(Number),
                            duration: { us: expectExpect.any(Number) },
                            time_range: { gte: expectExpect.any(String) },
                            instance: { id: '2' },
                            snoozed: false,
                            start: expectExpect.any(String),
                            uuid: expectExpect.any(String),
                            status: 'active',
                            workflow_status: 'open',
                            flapping: false,
                          },
                          space_ids: ['space1'],
                          version: expectExpect.any(String),
                        },
                        '@timestamp': expectExpect.any(String),
                        event: { kind: 'signal', action: 'active' },
                        tags: ['tag-A', 'tag-B'],
                      },
                    ],
                  },
                  recovered: { count: 0, data: [] },
                })
              );
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should pass summarized alerts to actions', async () => {
          const reference = alertUtils.generateReference();
          const response = await alertUtils.createAlwaysFiringRuleWithSummaryAction({
            reference,
            overwrites: {
              schedule: { interval: '1s' },
            },
            notifyWhen: 'onActiveAlert',
            throttle: null,
            summary: true,
            messageTemplate: `[{{alerts.all.data}}]`,
          });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: getUnauthorizedErrorMessage(
                  'create',
                  'test.always-firing-alert-as-data',
                  'alertsFixture'
                ),
                statusCode: 403,
              });
              break;
            case 'space_1_all_alerts_none_actions at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                error: 'Forbidden',
                message: `Unauthorized to get actions`,
                statusCode: 403,
              });
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
            case 'superuser at space1':
              expect(response.statusCode).to.eql(200);

              await esTestIndexTool.waitForDocs('rule:test.always-firing-alert-as-data', reference);
              await esTestIndexTool.waitForDocs('action:test.index-record', reference);
              const searchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(searchResult.body.hits.total.value).to.be.greaterThan(0);
              expectExpect(
                // @ts-expect-error _source: unknown
                JSON.parse(searchResult.body.hits.hits[0]._source.params.message)
              ).toEqual([
                expectExpect.objectContaining({
                  _id: expectExpect.any(String),
                  _index: '.internal.alerts-observability.test.alerts.alerts-default-000001',
                  kibana: {
                    alert: {
                      action_group: 'default',
                      flapping_history: expectExpect.any(Array),
                      maintenance_window_ids: [],
                      maintenance_window_names: [],
                      pending_recovered_count: 0,
                      severity_improving: false,
                      snoozed: false,
                      muted: false,
                      rule: {
                        parameters: {
                          index: 'kibana-alerting-test-data',
                          reference,
                        },
                        category: 'Test: Always Firing Alert As Data',
                        consumer: 'alertsFixture',
                        execution: {
                          uuid: expectExpect.any(String),
                          timestamp: expectExpect.any(String),
                        },
                        name: 'abc',
                        producer: 'alertsFixture',
                        revision: 0,
                        rule_type_id: 'test.always-firing-alert-as-data',
                        uuid: expectExpect.any(String),
                        tags: ['tag-A', 'tag-B'],
                      },
                      consecutive_matches: 1,
                      duration: { us: 0 },
                      time_range: { gte: expectExpect.any(String) },
                      instance: { id: '1' },
                      start: expectExpect.any(String),
                      uuid: expectExpect.any(String),
                      status: 'active',
                      workflow_status: 'open',
                      flapping: false,
                    },
                    space_ids: ['space1'],
                    version: expectExpect.any(String),
                  },
                  '@timestamp': expectExpect.any(String),
                  event: { kind: 'signal', action: 'open' },
                  tags: ['tag-A', 'tag-B'],
                }),
                expectExpect.objectContaining({
                  _id: expectExpect.any(String),
                  _index: '.internal.alerts-observability.test.alerts.alerts-default-000001',
                  kibana: {
                    alert: {
                      action_group: 'default',
                      flapping_history: expectExpect.any(Array),
                      maintenance_window_ids: [],
                      maintenance_window_names: [],
                      pending_recovered_count: 0,
                      severity_improving: false,
                      snoozed: false,
                      muted: false,
                      rule: {
                        parameters: {
                          index: 'kibana-alerting-test-data',
                          reference,
                        },
                        category: 'Test: Always Firing Alert As Data',
                        consumer: 'alertsFixture',
                        execution: {
                          uuid: expectExpect.any(String),
                          timestamp: expectExpect.any(String),
                        },
                        name: 'abc',
                        producer: 'alertsFixture',
                        revision: 0,
                        rule_type_id: 'test.always-firing-alert-as-data',
                        uuid: expectExpect.any(String),
                        tags: ['tag-A', 'tag-B'],
                      },
                      consecutive_matches: 1,
                      duration: { us: 0 },
                      time_range: { gte: expectExpect.any(String) },
                      instance: { id: '2' },
                      start: expectExpect.any(String),
                      uuid: expectExpect.any(String),
                      status: 'active',
                      workflow_status: 'open',
                      flapping: false,
                    },
                    space_ids: ['space1'],
                    version: expectExpect.any(String),
                  },
                  '@timestamp': expectExpect.any(String),
                  event: { kind: 'signal', action: 'open' },
                  tags: ['tag-A', 'tag-B'],
                }),
              ]);

              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should create new, ongoing and recovered alerts', async () => {
          const reference = alertUtils.generateReference();
          const createdRule = await alertUtils.createPatternFiringRuleWithSummaryAction({
            reference,
            overwrites: {
              // set the schedule long so we can use "runSoon" to specify rule runs
              schedule: { interval: '1d' },
            },
            pattern: { alertA: [true, true, false, false, false, false] },
          });

          const ruleId = createdRule.body.id;

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all at space2':
            case 'space_1_all at space2':
            case 'global_read at space1':
            case 'space_1_all_alerts_none_actions at space1':
              expect(createdRule.statusCode).to.eql(403);
              break;
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              break;
            case 'superuser at space1':
              expect(createdRule.statusCode).to.eql(200);

              // #####################################
              // first run (new alerts)
              // #####################################
              const searchResult = await esTestIndexTool.waitForDocs(
                'action:test.index-record',
                reference,
                1
              ); // action execution

              expect(searchResult[0]._source.params.message).to.be(
                'Alerts, all:1, new:1 IDs:[alertA,], ongoing:0 IDs:[], recovered:0 IDs:[]'
              );

              // #####################################
              // second run (ongoing alerts)
              // #####################################
              await alertUtils.runSoon(ruleId);

              const secondSearchResult = await esTestIndexTool.waitForDocs(
                'action:test.index-record',
                reference,
                2
              );

              expect(secondSearchResult[1]._source.params.message).to.be(
                'Alerts, all:1, new:0 IDs:[], ongoing:1 IDs:[alertA,], recovered:0 IDs:[]'
              );

              // #####################################
              // third run (recovered alerts)
              // #####################################
              await alertUtils.runSoon(ruleId);

              const thirdSearchResult = await esTestIndexTool.waitForDocs(
                'action:test.index-record',
                reference,
                3
              );

              expect(thirdSearchResult[2]._source.params.message).to.be(
                'Alerts, all:1, new:0 IDs:[], ongoing:0 IDs:[], recovered:1 IDs:[alertA,]'
              );

              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });
      });
    }

    describe('connector adapters', () => {
      const space = SuperuserAtSpace1.space;

      const connectorId = 'system-connector-test.system-action-connector-adapter';
      const name = 'Test system action with a connector adapter set';

      it('should use connector adapters correctly on system actions', async () => {
        const alertUtils = new AlertUtils({
          supertestWithoutAuth,
          objectRemover,
          space,
          user: SuperuserAtSpace1.user,
        });

        const startDate = new Date().toISOString();
        const reference = alertUtils.generateReference();
        /**
         * Creates a rule that always fire with a system action
         * that has configured a connector adapter.
         *
         * System action: x-pack/platform/test/alerting_api_integration/common/plugins/alerts/server/action_types.ts
         * Adapter: x-pack/platform/test/alerting_api_integration/common/plugins/alerts/server/connector_adapters.ts
         */
        const response = await alertUtils.createAlwaysFiringSystemAction({
          reference,
          overwrites: { schedule: { interval: '1m' } },
        });

        expect(response.status).to.eql(200);

        await validateSystemActionEventLog({
          spaceId: space.id,
          connectorId,
          outcome: 'success',
          message: `action executed: test.system-action-connector-adapter:${connectorId}: ${name}`,
          startDate,
        });

        /**
         * The executor function of the system action
         * writes the params in the test index. We
         * get the doc to verify that the connector adapter
         * injected the param correctly.
         */
        await esTestIndexTool.waitForDocs(
          'action:test.system-action-connector-adapter',
          reference,
          1
        );

        const docs = await esTestIndexTool.search(
          'action:test.system-action-connector-adapter',
          reference
        );

        const doc = docs.body.hits.hits[0]._source as { params: Record<string, unknown> };

        expect(doc.params).to.eql({
          myParam: 'param from rule action',
          index: 'kibana-alerting-test-data',
          reference: 'alert-utils-ref:1:superuser',
          /**
           * Param was injected by the connector adapter in
           * x-pack/platform/test/alerting_api_integration/common/plugins/alerts/server/connector_adapters.ts
           */
          injected: 'param from connector adapter',
        });
      });
    });
  });

  interface ValidateEventLogParams {
    spaceId: string;
    alertId: string;
    ruleTypeId: string;
    outcome: string;
    message: string;
    errorMessage?: string;
    ruleObject: any;
  }

  async function validateEventLog(params: ValidateEventLogParams): Promise<void> {
    const { spaceId, alertId, outcome, message, errorMessage, ruleObject } = params;

    const events: IValidatedEvent[] = await retry.try(async () => {
      return await getEventLog({
        getService,
        spaceId,
        type: 'alert',
        id: alertId,
        provider: 'alerting',
        actions: new Map([['execute', { gte: 1 }]]),
      });
    });

    const event = events[0];

    const duration = event?.event?.duration;
    const eventStart = Date.parse(event?.event?.start || 'undefined');
    const eventEnd = Date.parse(event?.event?.end || 'undefined');
    const dateNow = Date.now();

    expect(typeof duration).to.be('string');
    expect(eventStart).to.be.ok();
    expect(eventEnd).to.be.ok();

    const durationDiff = Math.abs(nanosToMillis(duration!) - (eventEnd - eventStart));

    // account for rounding errors
    expect(durationDiff < 1).to.equal(true);
    expect(eventStart <= eventEnd).to.equal(true);
    expect(eventEnd <= dateNow).to.equal(true);

    expect(event?.event?.outcome).to.equal(outcome);
    expect(event?.kibana?.alerting?.outcome).to.equal(outcome);

    expect(event?.kibana?.saved_objects).to.eql([
      {
        rel: 'primary',
        type: RULE_SAVED_OBJECT_TYPE,
        id: alertId,
        namespace: spaceId,
        type_id: ruleObject.alertInfo.ruleTypeId,
      },
    ]);

    expect(event?.kibana?.alert?.rule?.execution?.metrics?.number_of_triggered_actions).to.be(1);
    expect(event?.kibana?.alert?.rule?.execution?.metrics?.number_of_searches).to.be(0);
    expect(event?.kibana?.alert?.rule?.execution?.metrics?.es_search_duration_ms).to.be(0);
    expect(event?.kibana?.alert?.rule?.execution?.metrics?.total_search_duration_ms).to.be(0);
    expect(event?.kibana?.alert?.rule?.execution?.metrics?.alert_counts?.active).to.be(1);
    expect(event?.kibana?.alert?.rule?.execution?.metrics?.alert_counts?.new).to.be(1);
    expect(event?.kibana?.alert?.rule?.execution?.metrics?.alert_counts?.recovered).to.be(0);

    expect(
      event?.kibana?.alert?.rule?.execution?.metrics?.claim_to_start_duration_ms
    ).to.be.greaterThan(0);
    expect(event?.kibana?.alert?.rule?.execution?.metrics?.total_run_duration_ms).to.be.greaterThan(
      0
    );
    expect(
      event?.kibana?.alert?.rule?.execution?.metrics?.prepare_rule_duration_ms
    ).to.be.greaterThan(0);
    expect(
      event?.kibana?.alert?.rule?.execution?.metrics?.rule_type_run_duration_ms
    ).to.be.greaterThan(0);
    // Process alerts is fast enough that it will sometimes report 0ms
    const procesAlertsDurationMs =
      event?.kibana?.alert?.rule?.execution?.metrics?.process_alerts_duration_ms;
    expect(
      (typeof procesAlertsDurationMs === 'number' ? procesAlertsDurationMs : -1) >= 0
    ).to.be.ok();
    expect(
      event?.kibana?.alert?.rule?.execution?.metrics?.trigger_actions_duration_ms
    ).to.be.greaterThan(0);
    expect(
      event?.kibana?.alert?.rule?.execution?.metrics?.process_rule_duration_ms
    ).to.be.greaterThan(0);

    expect(event?.rule).to.eql({
      id: alertId,
      license: 'basic',
      category: ruleObject.alertInfo.ruleTypeId,
      ruleset: ruleObject.alertInfo.producer,
      name: ruleObject.alertInfo.name,
    });

    expect(event?.message).to.eql(message);

    if (errorMessage) {
      expect(event?.error?.message).to.eql(errorMessage);
    }
  }

  interface ValidateSystemActionEventLogParams {
    spaceId: string;
    connectorId: string;
    outcome: string;
    message: string;
    startDate: string;
    errorMessage?: string;
  }

  const validateSystemActionEventLog = async (
    params: ValidateSystemActionEventLogParams
  ): Promise<void> => {
    const { spaceId, connectorId, outcome, message, startDate, errorMessage } = params;

    const events: IValidatedEvent[] = await retry.try(async () => {
      const events_ = await getEventLog({
        getService,
        spaceId,
        type: 'action',
        id: connectorId,
        provider: 'actions',
        actions: new Map([['execute', { gte: 1 }]]),
      });

      const filteredEvents = events_.filter((event) => event!['@timestamp']! >= startDate);
      if (filteredEvents.length < 1) throw new Error('no recent events found yet');

      return filteredEvents;
    });

    expect(events.length).to.be(1);

    const event = events[0];

    expect(event?.message).to.eql(message);
    expect(event?.event?.outcome).to.eql(outcome);

    if (errorMessage) {
      expect(event?.error?.message).to.eql(errorMessage);
    }
  };
}
