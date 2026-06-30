/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { RuleNotifyWhen } from '@kbn/alerting-plugin/common';
import { Spaces } from '../../../scenarios';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { getUrlPrefix, getTestRuleData, ObjectRemover, getEventLog } from '../../../../common/lib';
import { runSoon } from '../../helpers';

const FUTURE_SNOOZE_EXPIRES_AT = '2099-12-31T23:59:59.000Z';

export default function taskRunnerPerAlertSnoozeTests({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const retry = getService('retry');

  describe('per-alert snooze evaluation', () => {
    const objectRemover = new ObjectRemover(supertest);

    after(async () => objectRemover.removeAll());

    async function createNoopConnector(): Promise<string> {
      const { body } = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/actions/connector`)
        .set('kbn-xsrf', 'foo')
        .send({ name: 'noop connector', connector_type_id: 'test.noop', config: {}, secrets: {} })
        .expect(200);
      return body.id;
    }

    async function createPatternFiringRule(
      connectorId: string,
      pattern: Record<string, boolean[]>
    ): Promise<string> {
      const { body } = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
        .set('kbn-xsrf', 'foo')
        .send(
          getTestRuleData({
            rule_type_id: 'test.patternFiring',
            schedule: { interval: '24h' },
            throttle: null,
            notify_when: null,
            params: { pattern },
            actions: [
              {
                id: connectorId,
                group: 'default',
                params: {},
                frequency: {
                  summary: false,
                  throttle: null,
                  notify_when: RuleNotifyWhen.ACTIVE,
                },
              },
            ],
          })
        )
        .expect(200);
      objectRemover.add(Spaces.space1.id, body.id, 'rule', 'alerting');
      return body.id;
    }

    async function waitForExecutions(ruleId: string, minCount: number): Promise<void> {
      await retry.try(async () => {
        await getEventLog({
          getService,
          spaceId: Spaces.space1.id,
          type: 'alert',
          id: ruleId,
          provider: 'alerting',
          actions: new Map([['execute', { gte: minCount }]]),
        });
      });
    }

    async function getExecuteActionEventCount(ruleId: string): Promise<number> {
      const { body } = await supertest
        .get(
          `${getUrlPrefix(Spaces.space1.id)}/_test/event_log/alert/${ruleId}/_find?per_page=5000`
        )
        .expect(200);

      return (body.data as Array<{ event?: { action?: string; provider?: string } }>).filter(
        (ev) => ev?.event?.provider === 'alerting' && ev?.event?.action === 'execute-action'
      ).length;
    }

    async function snoozeAlertInstance(ruleId: string, instanceId: string): Promise<void> {
      await supertest
        .post(
          `${getUrlPrefix(
            Spaces.space1.id
          )}/api/alerting/rule/${ruleId}/alert/${instanceId}/_snooze?validate_alerts_existence=false`
        )
        .set('kbn-xsrf', 'foo')
        .send({ expires_at: FUTURE_SNOOZE_EXPIRES_AT })
        .expect(204);
    }

    async function unsnoozeAlertInstance(ruleId: string, instanceId: string): Promise<void> {
      await supertest
        .post(
          `${getUrlPrefix(
            Spaces.space1.id
          )}/api/alerting/rule/${ruleId}/alert/${instanceId}/_unsnooze`
        )
        .set('kbn-xsrf', 'foo')
        .send({})
        .expect(204);
    }

    it('should suppress actions for a snoozed alert instance', async () => {
      const connectorId = await createNoopConnector();
      const ruleId = await createPatternFiringRule(connectorId, {
        'instance-1': new Array(10).fill(true),
      });

      // Wait for the initial execution (rule runs immediately on creation)
      await waitForExecutions(ruleId, 1);

      // Confirm that run 1 scheduled an action for instance-1
      await retry.try(async () => {
        await getEventLog({
          getService,
          spaceId: Spaces.space1.id,
          type: 'alert',
          id: ruleId,
          provider: 'alerting',
          actions: new Map([['execute-action', { gte: 1 }]]),
        });
      });

      const actionCountBeforeSnooze = await getExecuteActionEventCount(ruleId);
      expect(actionCountBeforeSnooze).to.be.greaterThan(0);

      await snoozeAlertInstance(ruleId, 'instance-1');

      // Trigger a second run
      await runSoon({ id: ruleId, supertest, retry });
      await waitForExecutions(ruleId, 2);

      // The action count must not have increased — snooze suppressed the action
      const actionCountAfterSnooze = await getExecuteActionEventCount(ruleId);
      expect(actionCountAfterSnooze).to.eql(actionCountBeforeSnooze);
    });

    it('should restore actions after unsnoozing an alert instance', async () => {
      const connectorId = await createNoopConnector();
      const ruleId = await createPatternFiringRule(connectorId, {
        'instance-1': new Array(10).fill(true),
      });

      await waitForExecutions(ruleId, 1);
      await retry.try(async () => {
        await getEventLog({
          getService,
          spaceId: Spaces.space1.id,
          type: 'alert',
          id: ruleId,
          provider: 'alerting',
          actions: new Map([['execute-action', { gte: 1 }]]),
        });
      });

      await snoozeAlertInstance(ruleId, 'instance-1');

      // Run while snoozed — action should be suppressed
      await runSoon({ id: ruleId, supertest, retry });
      await waitForExecutions(ruleId, 2);
      const actionCountWhileSnoozed = await getExecuteActionEventCount(ruleId);

      await unsnoozeAlertInstance(ruleId, 'instance-1');

      // Run after unsnooze — action should fire again
      await runSoon({ id: ruleId, supertest, retry });
      await waitForExecutions(ruleId, 3);

      const actionCountAfterUnsnooze = await getExecuteActionEventCount(ruleId);
      expect(actionCountAfterUnsnooze).to.be.greaterThan(actionCountWhileSnoozed);
    });

    it('should only suppress actions for the snoozed instance and not affect other instances', async () => {
      const connectorId = await createNoopConnector();
      const ruleId = await createPatternFiringRule(connectorId, {
        'instance-1': new Array(10).fill(true),
        'instance-2': new Array(10).fill(true),
      });

      await waitForExecutions(ruleId, 1);
      await retry.try(async () => {
        await getEventLog({
          getService,
          spaceId: Spaces.space1.id,
          type: 'alert',
          id: ruleId,
          provider: 'alerting',
          actions: new Map([['execute-action', { gte: 2 }]]),
        });
      });

      const actionCountAfterRun1 = await getExecuteActionEventCount(ruleId);

      // Snooze only instance-1; instance-2 remains unaffected
      await snoozeAlertInstance(ruleId, 'instance-1');

      await runSoon({ id: ruleId, supertest, retry });
      await waitForExecutions(ruleId, 2);

      const actionCountAfterRun2 = await getExecuteActionEventCount(ruleId);

      // Only instance-2's action should have fired in run 2 (one additional, not two)
      expect(actionCountAfterRun2).to.eql(actionCountAfterRun1 + 1);
    });

    describe('condition-based snooze evaluation', () => {
      /**
       * Creates a rule using the AAD-enabled pattern-firing rule type. This rule
       * type writes alerts to an alerts-as-data index and reports a `patternIndex`
       * field in each alert's payload. The field starts at 0 on the first
       * execution and increments by 1 on every subsequent run, making it a
       * reliable target for `field_change` condition tests.
       */
      async function createPatternFiringAadRule(
        connectorId: string,
        pattern: Record<string, boolean[]>,
        severityPattern?: Record<string, Array<string | null>>
      ): Promise<string> {
        const { body } = await supertest
          .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
          .set('kbn-xsrf', 'foo')
          .send(
            getTestRuleData({
              rule_type_id: 'test.patternFiringAad',
              schedule: { interval: '24h' },
              throttle: null,
              notify_when: null,
              params: { pattern, ...(severityPattern ? { severityPattern } : {}) },
              actions: [
                {
                  id: connectorId,
                  group: 'default',
                  params: {},
                  frequency: {
                    summary: false,
                    throttle: null,
                    notify_when: RuleNotifyWhen.ACTIVE,
                  },
                },
              ],
            })
          )
          .expect(200);
        objectRemover.add(Spaces.space1.id, body.id, 'rule', 'alerting');
        return body.id;
      }

      async function snoozeAlertInstanceWithConditions(
        ruleId: string,
        instanceId: string,
        snoozeBody: {
          conditions: Array<
            | { type: 'field_change'; field: string }
            | { type: 'severity_change' }
            | { type: 'severity_equals'; value: string }
          >;
          condition_operator?: 'any' | 'all';
          expires_at?: string;
        }
      ): Promise<void> {
        await supertest
          .post(
            `${getUrlPrefix(
              Spaces.space1.id
            )}/api/alerting/rule/${ruleId}/alert/${instanceId}/_snooze`
          )
          .set('kbn-xsrf', 'foo')
          .send(snoozeBody)
          .expect(204);
      }

      it('should expire condition-based snooze when a tracked field changes (field_change)', async () => {
        const connectorId = await createNoopConnector();
        const ruleId = await createPatternFiringAadRule(connectorId, {
          'instance-1': new Array(10).fill(true),
        });

        // Run 1: instance fires; alert is written to the AAD index with patternIndex=0
        await waitForExecutions(ruleId, 1);
        await retry.try(async () => {
          await getEventLog({
            getService,
            spaceId: Spaces.space1.id,
            type: 'alert',
            id: ruleId,
            provider: 'alerting',
            actions: new Map([['execute-action', { gte: 1 }]]),
          });
        });
        const actionCountAfterRun1 = await getExecuteActionEventCount(ruleId);

        // Snooze with a field_change condition on patternIndex.
        // The snapshot captures patternIndex=0 from the ES document written in run 1.
        await snoozeAlertInstanceWithConditions(ruleId, 'instance-1', {
          conditions: [{ type: 'field_change', field: 'patternIndex' }],
          expires_at: FUTURE_SNOOZE_EXPIRES_AT,
        });

        // Run 2: patternIndex advances to 1.
        // evaluatePerAlertSnoozeConditions sees 1 ≠ snapshot(0) → condition met
        // → snooze is lifted in this same run → action fires.
        await runSoon({ id: ruleId, supertest, retry });
        await waitForExecutions(ruleId, 2);

        const actionCountAfterRun2 = await getExecuteActionEventCount(ruleId);
        expect(actionCountAfterRun2).to.be.greaterThan(actionCountAfterRun1);
      });

      it('should expire snooze via severity_change when the alert severity changes', async () => {
        const connectorId = await createNoopConnector();
        // severityPattern drives kibana.alert.severity per run:
        //   run 0 → 'high', run 1 → 'critical', ...
        const ruleId = await createPatternFiringAadRule(
          connectorId,
          {
            'instance-1': new Array(10).fill(true),
          },
          {
            'instance-1': new Array(10).fill(null).map((_, i) => (i === 0 ? 'high' : 'critical')),
          }
        );

        // Run 1: alert fires with kibana.alert.severity='high'; alert written to AAD index
        await waitForExecutions(ruleId, 1);
        await retry.try(async () => {
          await getEventLog({
            getService,
            spaceId: Spaces.space1.id,
            type: 'alert',
            id: ruleId,
            provider: 'alerting',
            actions: new Map([['execute-action', { gte: 1 }]]),
          });
        });
        const actionCountAfterRun1 = await getExecuteActionEventCount(ruleId);

        // Snapshot captures kibana.alert.severity='high'
        await snoozeAlertInstanceWithConditions(ruleId, 'instance-1', {
          conditions: [{ type: 'severity_change' }],
        });

        // Run 2: severity='critical' ≠ snapshot('high') → condition met → snooze lifted → action fires
        await runSoon({ id: ruleId, supertest, retry });
        await waitForExecutions(ruleId, 2);

        expect(await getExecuteActionEventCount(ruleId)).to.be.greaterThan(actionCountAfterRun1);
      });

      it('should expire snooze via severity_equals when the alert severity matches the configured value', async () => {
        const connectorId = await createNoopConnector();
        // severityPattern: run 0 → 'high' (no match), run 1 → 'critical' (match), ...
        const ruleId = await createPatternFiringAadRule(
          connectorId,
          {
            'instance-1': new Array(10).fill(true),
          },
          {
            'instance-1': new Array(10).fill(null).map((_, i) => (i === 0 ? 'high' : 'critical')),
          }
        );

        // Run 1: alert fires with severity='high'; no match for severity_equals 'critical'
        await waitForExecutions(ruleId, 1);
        await retry.try(async () => {
          await getEventLog({
            getService,
            spaceId: Spaces.space1.id,
            type: 'alert',
            id: ruleId,
            provider: 'alerting',
            actions: new Map([['execute-action', { gte: 1 }]]),
          });
        });
        const actionCountAfterRun1 = await getExecuteActionEventCount(ruleId);

        // severity_equals needs no snapshot; snooze can be applied without validate_alerts_existence
        await snoozeAlertInstanceWithConditions(ruleId, 'instance-1', {
          conditions: [{ type: 'severity_equals', value: 'critical' }],
          expires_at: FUTURE_SNOOZE_EXPIRES_AT,
        });

        // Run 2: severity='critical' === 'critical' → condition met → snooze lifted → action fires
        await runSoon({ id: ruleId, supertest, retry });
        await waitForExecutions(ruleId, 2);

        expect(await getExecuteActionEventCount(ruleId)).to.be.greaterThan(actionCountAfterRun1);
      });

      it('should keep snooze active with all operator when only some conditions are met', async () => {
        const connectorId = await createNoopConnector();
        const ruleId = await createPatternFiringAadRule(connectorId, {
          'instance-1': new Array(10).fill(true),
        });

        await waitForExecutions(ruleId, 1);
        await retry.try(async () => {
          await getEventLog({
            getService,
            spaceId: Spaces.space1.id,
            type: 'alert',
            id: ruleId,
            provider: 'alerting',
            actions: new Map([['execute-action', { gte: 1 }]]),
          });
        });
        const actionCountAfterRun1 = await getExecuteActionEventCount(ruleId);

        // Snooze with all operator: two conditions must BOTH be satisfied.
        // Because all conditions are required, the snooze persists even though
        // patternIndex changes.
        await snoozeAlertInstanceWithConditions(ruleId, 'instance-1', {
          conditions: [
            { type: 'field_change', field: 'patternIndex' },
            { type: 'severity_equals', value: 'critical' },
          ],
          condition_operator: 'all',
          expires_at: FUTURE_SNOOZE_EXPIRES_AT,
        });

        // Run 2: patternIndex changes but severity_equals is not met.
        // all → not fully satisfied → snooze persists → action suppressed.
        await runSoon({ id: ruleId, supertest, retry });
        await waitForExecutions(ruleId, 2);

        const actionCountAfterRun2 = await getExecuteActionEventCount(ruleId);
        expect(actionCountAfterRun2).to.eql(actionCountAfterRun1);
      });

      it('should expire snooze with any operator when at least one condition is met', async () => {
        const connectorId = await createNoopConnector();
        const ruleId = await createPatternFiringAadRule(connectorId, {
          'instance-1': new Array(10).fill(true),
        });

        await waitForExecutions(ruleId, 1);
        await retry.try(async () => {
          await getEventLog({
            getService,
            spaceId: Spaces.space1.id,
            type: 'alert',
            id: ruleId,
            provider: 'alerting',
            actions: new Map([['execute-action', { gte: 1 }]]),
          });
        });
        const actionCountAfterRun1 = await getExecuteActionEventCount(ruleId);

        // Snooze with any operator: only one condition needs to be satisfied.
        // Because any condition is sufficient, the snooze is lifted when patternIndex changes.
        await snoozeAlertInstanceWithConditions(ruleId, 'instance-1', {
          conditions: [
            { type: 'field_change', field: 'patternIndex' },
            { type: 'severity_equals', value: 'critical' },
          ],
          condition_operator: 'any',
          expires_at: FUTURE_SNOOZE_EXPIRES_AT,
        });

        // Run 2: patternIndex changes → field_change condition met.
        // any → at least one condition satisfied → snooze lifted → action fires.
        await runSoon({ id: ruleId, supertest, retry });
        await waitForExecutions(ruleId, 2);

        const actionCountAfterRun2 = await getExecuteActionEventCount(ruleId);
        expect(actionCountAfterRun2).to.be.greaterThan(actionCountAfterRun1);
      });
    });
  });
}
