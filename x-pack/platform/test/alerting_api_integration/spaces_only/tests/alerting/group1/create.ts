/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { SavedObject } from '@kbn/core/server';
import type { RawRule } from '@kbn/alerting-plugin/server/types';
import { RuleNotifyWhen } from '@kbn/alerting-plugin/server/types';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import { RULE_SAVED_OBJECT_TYPE } from '@kbn/alerting-plugin/server';
import { MAX_ARTIFACTS_DASHBOARDS_LENGTH } from '@kbn/alerting-plugin/common/routes/rule/request/schemas/v1';
import { MAX_ARTIFACTS_INVESTIGATION_GUIDE_LENGTH } from '@kbn/alerting-types/rule/latest';
import { ES_TEST_INDEX_NAME } from '@kbn/alerting-api-integration-helpers';
import { omit } from 'lodash';
import { Spaces } from '../../../scenarios';
import type { TaskManagerDoc } from '../../../../common/lib';
import {
  checkAAD,
  getUrlPrefix,
  getTestRuleData,
  ObjectRemover,
  getUnauthorizedErrorMessage,
  resetRulesSettings,
} from '../../../../common/lib';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';

export default function createAlertTests({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const es = getService('es');

  describe('create', () => {
    const objectRemover = new ObjectRemover(supertest);

    after(() => objectRemover.removeAll());

    async function getScheduledTask(id: string): Promise<TaskManagerDoc> {
      const scheduledTask = await es.get<TaskManagerDoc>({
        id: `task:${id}`,
        index: '.kibana_task_manager',
      });
      return scheduledTask._source!;
    }

    describe('create alert', function () {
      this.tags('skipFIPS');
      it('should handle create alert request appropriately', async () => {
        const { body: createdAction } = await supertest
          .post(`${getUrlPrefix(Spaces.space1.id)}/api/actions/connector`)
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'MY action',
            connector_type_id: 'test.noop',
            config: {},
            secrets: {},
          })
          .expect(200);

        const response = await supertest
          .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
          .set('kbn-xsrf', 'foo')
          .send(
            getTestRuleData({
              actions: [
                {
                  id: createdAction.id,
                  group: 'default',
                  params: {},
                },
              ],
            })
          );

        expect(response.status).to.eql(200);
        objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');
        expect(response.body).to.eql({
          id: response.body.id,
          name: 'abc',
          tags: ['foo'],
          actions: [
            {
              id: createdAction.id,
              connector_type_id: createdAction.connector_type_id,
              group: 'default',
              params: {},
              uuid: response.body.actions[0].uuid,
            },
          ],
          enabled: true,
          rule_type_id: 'test.noop',
          revision: 0,
          running: false,
          consumer: 'alertsFixture',
          params: {},
          created_by: null,
          schedule: { interval: '1m' },
          scheduled_task_id: response.body.scheduled_task_id,
          updated_by: null,
          api_key_owner: null,
          api_key_created_by_user: null,
          throttle: '1m',
          notify_when: 'onThrottleInterval',
          mute_all: false,
          muted_alert_ids: [],
          created_at: response.body.created_at,
          updated_at: response.body.updated_at,
          execution_status: response.body.execution_status,
          ...(response.body.next_run ? { next_run: response.body.next_run } : {}),
          ...(response.body.last_run ? { last_run: response.body.last_run } : {}),
        });
        expect(Date.parse(response.body.created_at)).to.be.greaterThan(0);
        expect(Date.parse(response.body.updated_at)).to.be.greaterThan(0);
        expect(Date.parse(response.body.updated_at)).to.eql(Date.parse(response.body.created_at));
        if (response.body.next_run) {
          expect(Date.parse(response.body.next_run)).to.be.greaterThan(0);
        }
        expect(typeof response.body.scheduled_task_id).to.be('string');
        const taskRecord = await getScheduledTask(response.body.scheduled_task_id);
        expect(taskRecord.type).to.eql('task');
        expect(taskRecord.task.taskType).to.eql('alerting:test.noop');
        expect(JSON.parse(taskRecord.task.params)).to.eql({
          alertId: response.body.id,
          spaceId: Spaces.space1.id,
          consumer: 'alertsFixture',
        });
        expect(taskRecord.task.enabled).to.eql(true);
        // Ensure AAD isn't broken
        await checkAAD({
          supertest,
          spaceId: Spaces.space1.id,
          type: RULE_SAVED_OBJECT_TYPE,
          id: response.body.id,
        });
      });
    });

    describe('store references correctly', function () {
      this.tags('skipFIPS');
      it('should store references correctly for actions', async () => {
        const { body: createdAction } = await supertest
          .post(`${getUrlPrefix(Spaces.space1.id)}/api/actions/connector`)
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'MY action',
            connector_type_id: 'test.noop',
            config: {},
            secrets: {},
          })
          .expect(200);

        const response = await supertest
          .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
          .set('kbn-xsrf', 'foo')
          .send(
            getTestRuleData({
              actions: [
                {
                  id: createdAction.id,
                  group: 'default',
                  params: {},
                },
                {
                  id: 'my-slack1',
                  group: 'default',
                  params: {
                    message: 'something important happened!',
                  },
                },
              ],
            })
          );

        expect(response.status).to.eql(200);

        objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');

        expect(response.body).to.eql({
          id: response.body.id,
          name: 'abc',
          tags: ['foo'],
          actions: [
            {
              id: createdAction.id,
              connector_type_id: createdAction.connector_type_id,
              group: 'default',
              params: {},
              uuid: response.body.actions[0].uuid,
            },
            {
              id: 'my-slack1',
              group: 'default',
              connector_type_id: '.slack',
              params: {
                message: 'something important happened!',
              },
              uuid: response.body.actions[1].uuid,
            },
          ],
          enabled: true,
          rule_type_id: 'test.noop',
          revision: 0,
          running: false,
          consumer: 'alertsFixture',
          params: {},
          created_by: null,
          schedule: { interval: '1m' },
          scheduled_task_id: response.body.scheduled_task_id,
          updated_by: null,
          api_key_owner: null,
          api_key_created_by_user: null,
          throttle: '1m',
          notify_when: 'onThrottleInterval',
          mute_all: false,
          muted_alert_ids: [],
          created_at: response.body.created_at,
          updated_at: response.body.updated_at,
          execution_status: response.body.execution_status,
          ...(response.body.next_run ? { next_run: response.body.next_run } : {}),
          ...(response.body.last_run ? { last_run: response.body.last_run } : {}),
        });

        if (response.body.next_run) {
          expect(Date.parse(response.body.next_run)).to.be.greaterThan(0);
        }

        const esResponse = await es.get<SavedObject<RawRule>>(
          {
            index: ALERTING_CASES_SAVED_OBJECT_INDEX,
            id: `alert:${response.body.id}`,
          },
          { meta: true }
        );
        expect(esResponse.statusCode).to.eql(200);
        const rawActions = (esResponse.body._source as any)?.alert.actions ?? [];
        expect(rawActions).to.eql([
          {
            actionRef: 'action_0',
            actionTypeId: 'test.noop',
            group: 'default',
            params: {},
            uuid: rawActions[0].uuid,
          },
          {
            actionRef: 'preconfigured:my-slack1',
            actionTypeId: '.slack',
            group: 'default',
            params: {
              message: 'something important happened!',
            },
            uuid: rawActions[1].uuid,
          },
        ]);

        const references = esResponse.body._source?.references ?? [];

        expect(references.length).to.eql(1);
        expect(references[0]).to.eql({
          id: createdAction.id,
          name: 'action_0',
          type: 'action',
        });
      });
    });

    // see: https://github.com/elastic/kibana/issues/100607
    // note this fails when the mappings for `params` does not have ignore_above
    it('should handle alerts with immense params', async () => {
      const { body: createdAction } = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/actions/connector`)
        .set('kbn-xsrf', 'foo')
        .send({
          name: 'MY action',
          connector_type_id: 'test.noop',
          config: {},
          secrets: {},
        })
        .expect(200);

      const lotsOfSpaces = ''.padEnd(100 * 1000); // 100K space chars
      const response = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
        .set('kbn-xsrf', 'foo')
        .send(
          getTestRuleData({
            params: {
              ignoredButPersisted: lotsOfSpaces,
            },
            actions: [
              {
                id: createdAction.id,
                group: 'default',
                params: {},
              },
            ],
          })
        );

      expect(response.status).to.eql(200);
      objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');

      expect(response.body.params.ignoredButPersisted).to.eql(lotsOfSpaces);

      // Ensure AAD isn't broken
      await checkAAD({
        supertest,
        spaceId: Spaces.space1.id,
        type: RULE_SAVED_OBJECT_TYPE,
        id: response.body.id,
      });
    });

    it('should create rules with mapped parameters', async () => {
      const { body: createdAction } = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/actions/connector`)
        .set('kbn-xsrf', 'foo')
        .send({
          name: 'MY action',
          connector_type_id: 'test.noop',
          config: {},
          secrets: {},
        })
        .expect(200);

      const createResponse = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
        .set('kbn-xsrf', 'foo')
        .send(
          getTestRuleData({
            params: {
              risk_score: 40,
              severity: 'medium',
              another_param: 'another',
            },
            actions: [
              {
                id: createdAction.id,
                group: 'default',
                params: {},
              },
            ],
          })
        )
        .expect(200);

      const response = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/internal/alerting/rules/_find`)
        .set('kbn-xsrf', 'kibana')
        .send({
          filter: `alert.attributes.params.risk_score:40`,
        })
        .expect(200);

      objectRemover.add(Spaces.space1.id, createResponse.body.id, 'rule', 'alerting');
      expect(response.body.total).to.equal(1);
      expect(response.body.data[0].mapped_params).to.eql({
        risk_score: 40,
        severity: '40-medium',
      });
    });

    it('should allow providing custom saved object ids (uuid v1)', async () => {
      const customId = '09570bb0-6299-11eb-8fde-9fe5ce6ea450';
      const response = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule/${customId}`)
        .set('kbn-xsrf', 'foo')
        .send(getTestRuleData());

      expect(response.status).to.eql(200);
      objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');
      expect(response.body.id).to.eql(customId);
      // Ensure AAD isn't broken
      await checkAAD({
        supertest,
        spaceId: Spaces.space1.id,
        type: RULE_SAVED_OBJECT_TYPE,
        id: customId,
      });
    });

    it('should allow providing custom saved object ids (uuid v4)', async () => {
      const customId = 'b3bc6d83-3192-4ffd-9702-ad4fb88617ba';
      const response = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule/${customId}`)
        .set('kbn-xsrf', 'foo')
        .send(getTestRuleData());

      expect(response.status).to.eql(200);
      objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');
      expect(response.body.id).to.eql(customId);
      // Ensure AAD isn't broken
      await checkAAD({
        supertest,
        spaceId: Spaces.space1.id,
        type: RULE_SAVED_OBJECT_TYPE,
        id: customId,
      });
    });

    it('should create a rule with a predefined non random ID', async () => {
      const ruleId = 'my_id';

      const response = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule/${ruleId}`)
        .set('kbn-xsrf', 'foo')
        .send(getTestRuleData())
        .expect(200);

      objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');

      expect(response.body.id).to.eql(ruleId);
    });

    it('should return 409 when document with id already exists', async () => {
      const customId = '5031f8f0-629a-11eb-b500-d1931a8e5df7';
      const createdAlertResponse = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule/${customId}`)
        .set('kbn-xsrf', 'foo')
        .send(getTestRuleData())
        .expect(200);
      objectRemover.add(Spaces.space1.id, createdAlertResponse.body.id, 'rule', 'alerting');
      await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule/${customId}`)
        .set('kbn-xsrf', 'foo')
        .send(getTestRuleData())
        .expect(409);
    });

    it('should handle create alert request appropriately when consumer is unknown', async () => {
      const response = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
        .set('kbn-xsrf', 'foo')
        .send(getTestRuleData({ consumer: 'some consumer patrick invented' }));

      expect(response.status).to.eql(403);
      expect(response.body).to.eql({
        error: 'Forbidden',
        message: getUnauthorizedErrorMessage(
          'create',
          'test.noop',
          'some consumer patrick invented'
        ),
        statusCode: 403,
      });
    });

    it('should handle create alert request appropriately when an alert is disabled ', async () => {
      const response = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
        .set('kbn-xsrf', 'foo')
        .send(getTestRuleData({ enabled: false }));

      expect(response.status).to.eql(200);
      objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');
      expect(response.body.scheduledTaskId).to.eql(undefined);
    });

    it('should not allow creating a default action without group', async () => {
      const customId = '1';
      const response = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule/${customId}`)
        .set('kbn-xsrf', 'foo')
        .send(
          getTestRuleData({
            actions: [
              {
                // group is missing
                id: 'test-id',
                params: {},
              },
            ],
          })
        );

      expect(response.status).to.eql(400);
      expect(response.body).to.eql({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Group is not defined in action test-id',
      });
    });

    it('should return 400 if the timezone of an action is not valid', async () => {
      const response = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
        .set('kbn-xsrf', 'foo')
        .send(
          getTestRuleData({
            actions: [
              {
                id: 'test-id',
                group: 'default',
                params: {},
                alerts_filter: {
                  timeframe: {
                    days: [1, 2, 3, 4, 5, 6, 7],
                    timezone: 'invalid',
                    hours: { start: '00:00', end: '01:00' },
                  },
                },
              },
            ],
          })
        );

      expect(response.status).to.eql(400);
      expect(response.body.error).to.eql('Bad Request');
      expect(response.body.message).to.contain('string is not a valid timezone: invalid');
    });

    it('creates a rule action with an is-one-of alerts filter', async () => {
      const phrasesFilterQuery = {
        bool: {
          should: [{ match_phrase: { 'host.name': 'a' } }, { match_phrase: { 'host.name': 'b' } }],
          minimum_should_match: 1,
        },
      };
      const phrasesFilter = {
        meta: {
          type: 'phrases',
          key: 'host.name',
          params: ['a', 'b'],
          negate: false,
          disabled: false,
        },
        query: phrasesFilterQuery,
      };

      const { body: createdAction } = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/actions/connector`)
        .set('kbn-xsrf', 'foo')
        .send({
          name: 'MY action',
          connector_type_id: 'test.noop',
          config: {},
          secrets: {},
        })
        .expect(200);

      const response = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
        .set('kbn-xsrf', 'foo')
        .send(
          getTestRuleData({
            rule_type_id: 'test.always-firing-alert-as-data',
            params: {
              index: ES_TEST_INDEX_NAME,
              reference: 'test-is-one-of-filter',
            },
            actions: [
              {
                id: createdAction.id,
                group: 'default',
                params: {},
                alerts_filter: {
                  query: {
                    kql: '',
                    filters: [phrasesFilter],
                  },
                },
              },
            ],
          })
        );

      expect(response.status).to.eql(200);
      objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');

      const responseFilter = response.body.actions[0].alerts_filter.query.filters[0];
      expect(responseFilter.meta.params).to.eql(['a', 'b']);
      expect(responseFilter.meta).to.not.have.property('value');
      expect(responseFilter.query).to.eql(phrasesFilterQuery);

      const esResponse = await es.get<SavedObject<RawRule>>(
        {
          index: ALERTING_CASES_SAVED_OBJECT_INDEX,
          id: `alert:${response.body.id}`,
        },
        { meta: true }
      );

      expect(esResponse.statusCode).to.eql(200);

      const storedFilter = (esResponse.body._source as any)?.alert.actions[0].alertsFilter.query
        .filters[0];

      expect(storedFilter.meta.params).to.eql(['a', 'b']);
      expect(storedFilter.meta).to.not.have.property('value');
      expect(storedFilter.query).to.eql(phrasesFilterQuery);
      expect(storedFilter.meta.type).to.eql('phrases');
      expect(storedFilter.meta.key).to.eql('host.name');
    });

    describe('system actions', () => {
      const systemAction = {
        id: 'system-connector-test.system-action',
        params: {},
      };

      it('should create a rule with a system action correctly', async () => {
        const response = await supertest
          .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
          .set('kbn-xsrf', 'foo')
          .send(
            getTestRuleData({
              actions: [systemAction],
            })
          );

        expect(response.status).to.eql(200);
        expect(response.body.actions.length).to.eql(1);

        objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');

        const action = response.body.actions[0];
        const { uuid, ...rest } = action;

        expect(rest).to.eql({
          id: 'system-connector-test.system-action',
          connector_type_id: 'test.system-action',
          params: {},
        });

        expect(uuid).to.not.be(undefined);

        const esResponse = await es.get<SavedObject<RawRule>>(
          {
            index: ALERTING_CASES_SAVED_OBJECT_INDEX,
            id: `alert:${response.body.id}`,
          },
          { meta: true }
        );

        expect(esResponse.statusCode).to.eql(200);
        expect((esResponse.body._source as any)?.alert.systemActions).to.be(undefined);

        const rawActions = (esResponse.body._source as any)?.alert.actions ?? [];
        const rawAction = rawActions[0];
        const { uuid: rawActionUuid, ...rawActionRest } = rawAction;

        expect(rawActionRest).to.eql({
          actionRef: 'system_action:system-connector-test.system-action',
          actionTypeId: 'test.system-action',
          params: {},
        });

        expect(uuid).to.not.be(undefined);

        const references = esResponse.body._source?.references ?? [];

        expect(references.length).to.eql(0);
      });

      it('should throw 400 if the system action is missing required properties', async () => {
        for (const propertyToOmit of ['id']) {
          const systemActionWithoutProperty = omit(systemAction, propertyToOmit);

          await supertest
            .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .send(
              getTestRuleData({
                actions: [systemActionWithoutProperty],
              })
            )
            .expect(400);
        }
      });

      it('should throw 400 if the system action is missing required params', async () => {
        const res = await supertest
          .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
          .set('kbn-xsrf', 'foo')
          .send(
            getTestRuleData({
              actions: [
                {
                  ...systemAction,
                  params: {},
                  id: 'system-connector-test.system-action-connector-adapter',
                },
              ],
            })
          )
          .expect(400);

        expect(res.body.message).to.eql(
          'Invalid system action params. System action type: test.system-action-connector-adapter - [myParam]: expected value of type [string] but got [undefined]'
        );
      });

      it('strips out properties from system actions that are part of the default actions', async () => {
        for (const propertyToAdd of [
          { group: 'default' },
          {
            frequency: {
              summary: false,
              throttle: '1s',
              notify_when: RuleNotifyWhen.THROTTLE,
            },
          },
          {
            alerts_filter: {
              query: { kql: 'kibana.alert.rule.name:abc', filters: [] },
            },
          },
        ]) {
          const systemActionWithProperty = { ...systemAction, ...propertyToAdd };

          const response = await supertest
            .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .send(
              getTestRuleData({
                actions: [systemActionWithProperty],
              })
            );

          expect(response.status).to.eql(200);
          expect(response.body.actions[0][Object.keys(propertyToAdd)[0]]).to.be(undefined);

          objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');

          const esResponse = await es.get<SavedObject<RawRule>>(
            {
              index: ALERTING_CASES_SAVED_OBJECT_INDEX,
              id: `alert:${response.body.id}`,
            },
            { meta: true }
          );

          expect(esResponse.statusCode).to.eql(200);
          expect((esResponse.body._source as any)?.alert.systemActions).to.be(undefined);

          const rawActions = (esResponse.body._source as any)?.alert.actions ?? [];
          expect(rawActions[0][Object.keys(propertyToAdd)[0]]).to.be(undefined);
        }
      });

      it('should throw 400 when using the same system action twice', async () => {
        await supertest
          .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
          .set('kbn-xsrf', 'foo')
          .send(
            getTestRuleData({
              actions: [systemAction, systemAction],
            })
          )
          .expect(400);
      });

      it('should allow multiple instances of the same system action if allowMultipleSystemActions is true', async () => {
        const multipleSystemAction = {
          id: 'system-connector-test.system-action-allow-multiple',
          params: {},
        };

        const response = await supertest
          .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
          .set('kbn-xsrf', 'foo')
          .send(
            getTestRuleData({
              actions: [multipleSystemAction, multipleSystemAction],
            })
          );

        expect(response.status).to.eql(200);
        expect(response.body.actions.length).to.eql(2);

        objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');

        const action1 = response.body.actions[0];
        const action2 = response.body.actions[1];

        expect(action1.id).to.eql('system-connector-test.system-action-allow-multiple');
        expect(action1.connector_type_id).to.eql('test.system-action-allow-multiple');
        expect(action1.uuid).to.not.be(undefined);

        expect(action2.id).to.eql('system-connector-test.system-action-allow-multiple');
        expect(action2.connector_type_id).to.eql('test.system-action-allow-multiple');
        expect(action2.uuid).to.not.be(undefined);

        // UUIDs should be different
        expect(action1.uuid).to.not.eql(action2.uuid);
      });

      describe('create rule flapping', () => {
        afterEach(async () => {
          await resetRulesSettings(supertest, 'space1');
        });

        it('should allow flapping to be created', async () => {
          const response = await supertest
            .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .send(
              getTestRuleData({
                flapping: {
                  enabled: false,
                  look_back_window: 5,
                  status_change_threshold: 5,
                },
              })
            );

          expect(response.status).to.eql(200);
          objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');

          expect(response.body.flapping).to.eql({
            enabled: false,
            look_back_window: 5,
            status_change_threshold: 5,
          });
        });

        it('should not throw if flapping is created when global flapping is off', async () => {
          await supertest
            .post(`${getUrlPrefix(Spaces.space1.id)}/internal/alerting/rules/settings/_flapping`)
            .set('kbn-xsrf', 'foo')
            .send({
              enabled: false,
              look_back_window: 5,
              status_change_threshold: 5,
            });

          const response = await supertest
            .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .send(
              getTestRuleData({
                flapping: {
                  enabled: true,
                  look_back_window: 5,
                  status_change_threshold: 5,
                },
              })
            );

          expect(response.status).to.eql(200);
          objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');

          expect(response.body.flapping).to.eql({
            enabled: true,
            look_back_window: 5,
            status_change_threshold: 5,
          });
        });

        it('should throw if flapping is invalid', async () => {
          await supertest
            .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .send(
              getTestRuleData({
                flapping: {
                  look_back_window: 5,
                  status_change_threshold: 10,
                },
              })
            )
            .expect(400);

          await supertest
            .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .send(
              getTestRuleData({
                flapping: {
                  look_back_window: -5,
                  status_change_threshold: -5,
                },
              })
            )
            .expect(400);
        });
      });
    });

    describe('artifacts', () => {
      const artifacts = {
        dashboards: [{ id: 'dashboard-1' }, { id: 'dashboard-2' }],
        investigation_guide: { blob: 'Sample investigation guide' },
      };

      describe('create rule with artifacts correctly', function () {
        this.tags('skipFIPS');

        it('should return artifacts in the rule response', async () => {
          const response = await supertest
            .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .send(
              getTestRuleData({
                artifacts,
              })
            );

          expect(response.status).to.eql(200);

          objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');

          expect(response.body.artifacts).to.eql(artifacts);
        });

        it('should store references correctly for artifacts', async () => {
          const response = await supertest
            .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .send(
              getTestRuleData({
                artifacts,
              })
            );
          expect(response.status).to.eql(200);

          objectRemover.add(Spaces.space1.id, response.body.id, 'rule', 'alerting');

          expect(response.body).to.eql({
            id: response.body.id,
            name: 'abc',
            tags: ['foo'],
            actions: [],
            enabled: true,
            rule_type_id: 'test.noop',
            revision: 0,
            running: false,
            consumer: 'alertsFixture',
            params: {},
            created_by: null,
            schedule: { interval: '1m' },
            scheduled_task_id: response.body.scheduled_task_id,
            updated_by: null,
            api_key_owner: null,
            api_key_created_by_user: null,
            throttle: '1m',
            notify_when: 'onThrottleInterval',
            mute_all: false,
            muted_alert_ids: [],
            created_at: response.body.created_at,
            updated_at: response.body.updated_at,
            execution_status: response.body.execution_status,
            ...(response.body.next_run ? { next_run: response.body.next_run } : {}),
            ...(response.body.last_run ? { last_run: response.body.last_run } : {}),
            artifacts,
          });

          const esResponse = await es.get<SavedObject<RawRule>>(
            {
              index: ALERTING_CASES_SAVED_OBJECT_INDEX,
              id: `alert:${response.body.id}`,
            },
            { meta: true }
          );

          const rawDashboards = (esResponse.body._source as any)?.alert.artifacts.dashboards ?? [];
          expect(rawDashboards).to.eql([
            {
              refId: 'dashboard_0',
            },
            {
              refId: 'dashboard_1',
            },
          ]);

          const references = esResponse.body._source?.references ?? [];

          expect(references.length).to.eql(2);

          expect(references[0]).to.eql({
            id: artifacts.dashboards[0].id,
            name: 'dashboard_0',
            type: 'dashboard',
          });

          expect(references[1]).to.eql({
            id: artifacts.dashboards[1].id,
            name: 'dashboard_1',
            type: 'dashboard',
          });
        });

        it('should deny creating a rule with an investigation guide that exceeds size limits', () =>
          supertest
            .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .send(
              getTestRuleData({
                artifacts: {
                  investigation_guide: {
                    // purposefully exceed limit
                    blob: 'a'.repeat(MAX_ARTIFACTS_INVESTIGATION_GUIDE_LENGTH + 1),
                  },
                },
              })
            )
            .expect(400));

        it('should deny creating a rule that exceeds dashboard length limits', () =>
          supertest
            .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
            .set('kbn-xsrf', 'foo')
            .send(
              getTestRuleData({
                artifacts: {
                  dashboards: Array.from(
                    { length: MAX_ARTIFACTS_DASHBOARDS_LENGTH + 1 },
                    (_, idx) => ({ id: `dashboard-${idx}` })
                  ),
                },
              })
            )
            .expect(400));
      });
    });
  });
}
