/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService }: FtrProviderContext) {
  const es = getService('es');
  const log = getService('log');
  const retry = getService('retry');
  const supertest = getService('supertest');
  let currentTaskId: string;

  describe('task event log', () => {
    beforeEach(async () => {
      await supertest.delete('/api/sample_tasks').set('kbn-xsrf', 'xxx').expect(200);
    });

    afterEach(async () => {
      await es.deleteByQuery({
        index: '.kibana-event-log*',
        query: {
          bool: {
            filter: [{ term: { 'kibana.task.id': currentTaskId } }],
          },
        },
        conflicts: 'proceed',
      });
    });

    after(async () => {
      await supertest.delete('/api/sample_tasks').set('kbn-xsrf', 'xxx').expect(200);
    });

    function scheduleTask(
      task: Partial<ConcreteTaskInstance>
    ): Promise<{ id: string; taskType: string; runAt: string }> {
      return supertest
        .post('/api/sample_tasks/schedule')
        .set('kbn-xsrf', 'xxx')
        .send({ task })
        .expect(200)
        .then((response: { body: { id: string; taskType: string; runAt: string } }) => {
          log.debug(`Task Scheduled: ${response.body.id}`);
          return response.body;
        });
    }

    function runTaskSoon(task: { id: string }) {
      return supertest
        .post('/api/sample_tasks/run_soon')
        .set('kbn-xsrf', 'xxx')
        .send({ task })
        .expect(200)
        .then((response) => response.body);
    }

    it('logs a task-run event when a task completes successfully', async () => {
      const scheduledTask = await scheduleTask({
        taskType: 'sampleTask',
        params: {},
      });
      currentTaskId = scheduledTask.id;

      await runTaskSoon({ id: scheduledTask.id });

      await retry.try(async () => {
        const response = await es.search({
          index: '.kibana-event-log*',
          query: {
            bool: {
              filter: [
                { term: { 'event.provider': 'taskManager' } },
                { term: { 'event.action': 'task-run' } },
                { term: { 'kibana.task.id': scheduledTask.id } },
                { term: { 'event.outcome': 'success' } },
              ],
            },
          },
        });
        expect(response.hits.hits.length).to.eql(1);

        const event = response.hits.hits[0]._source as Record<string, any>;
        expect(event.event.action).to.eql('task-run');
        expect(event.event.provider).to.eql('taskManager');
        expect(event.event.outcome).to.eql('success');
        expect(event.kibana.task.id).to.eql(scheduledTask.id);
        expect(event.kibana.task.type).to.eql('sampleTask');
      });
    });

    it('logs a task-run event when a task fails', async () => {
      const scheduledTask = await scheduleTask({
        taskType: 'sampleTask',
        params: { failWith: 'Task error' },
      });
      currentTaskId = scheduledTask.id;

      await runTaskSoon({ id: scheduledTask.id });

      await retry.try(async () => {
        const response = await es.search({
          index: '.kibana-event-log*',
          query: {
            bool: {
              filter: [
                { term: { 'event.provider': 'taskManager' } },
                { term: { 'event.action': 'task-run' } },
                { term: { 'kibana.task.id': scheduledTask.id } },
                { term: { 'event.outcome': 'failure' } },
              ],
            },
          },
        });
        expect(response.hits.hits.length).to.eql(1);

        const event = response.hits.hits[0]._source as Record<string, any>;
        expect(event.event.action).to.eql('task-run');
        expect(event.event.provider).to.eql('taskManager');
        expect(event.event.outcome).to.eql('failure');
        expect(event.error.message).to.eql('Task error');
        expect(event.kibana.task.id).to.eql(scheduledTask.id);
        expect(event.kibana.task.type).to.eql('sampleTask');
      });
    });

    it('logs task-run-start, task-cancel, and task-run events when a task is cancelled', async () => {
      const scheduledTask = await scheduleTask({
        taskType: 'sampleRecurringTaskTimingOut',
      });
      currentTaskId = scheduledTask.id;

      await runTaskSoon({ id: scheduledTask.id });

      await retry.try(async () => {
        const response = await es.search({
          index: '.kibana-event-log*',
          query: {
            bool: {
              filter: [
                { term: { 'event.provider': 'taskManager' } },
                { term: { 'kibana.task.id': scheduledTask.id } },
              ],
            },
          },
          sort: [{ '@timestamp': 'asc' }],
        });
        expect(response.hits.hits.length).to.eql(3);

        const events = response.hits.hits.map((h) => h._source as Record<string, any>);
        const startEvent = events.find((e) => e.event.action === 'task-run-start');
        const cancelledEvent = events.find((e) => e.event.action === 'task-cancel');
        const runEvent = events.find((e) => e.event.action === 'task-run');

        expect(startEvent).to.be.ok();
        expect(startEvent!.event.provider).to.eql('taskManager');
        expect(startEvent!.kibana.task.id).to.eql(scheduledTask.id);
        expect(startEvent!.kibana.task.type).to.eql('sampleRecurringTaskTimingOut');

        expect(cancelledEvent).to.be.ok();
        expect(cancelledEvent!.event.provider).to.eql('taskManager');
        expect(cancelledEvent!.message).to.eql(
          `Task sampleRecurringTaskTimingOut "${scheduledTask.id}" has been cancelled.`
        );
        expect(cancelledEvent!.kibana.task.id).to.eql(scheduledTask.id);
        expect(cancelledEvent!.kibana.task.type).to.eql('sampleRecurringTaskTimingOut');

        expect(runEvent).to.be.ok();
        expect(runEvent!.event.provider).to.eql('taskManager');
        expect(runEvent!.event.outcome).to.eql('success');
        expect(runEvent!.kibana.task.id).to.eql(scheduledTask.id);
        expect(runEvent!.kibana.task.type).to.eql('sampleRecurringTaskTimingOut');
      });
    });

    it('logs task-run-start, task-cancel, and task-run events when a task is cancelled with an error', async () => {
      const scheduledTask = await scheduleTask({
        taskType: 'sampleRecurringTaskTimingOutWithError',
      });
      currentTaskId = scheduledTask.id;

      await runTaskSoon({ id: scheduledTask.id });

      await retry.try(async () => {
        const response = await es.search({
          index: '.kibana-event-log*',
          query: {
            bool: {
              filter: [
                { term: { 'event.provider': 'taskManager' } },
                { term: { 'kibana.task.id': scheduledTask.id } },
              ],
            },
          },
          sort: [{ '@timestamp': 'asc' }],
        });
        expect(response.hits.hits.length).to.eql(3);

        const events = response.hits.hits.map((h) => h._source as Record<string, any>);
        const startEvent = events.find((e) => e.event.action === 'task-run-start');
        const cancelledEvent = events.find((e) => e.event.action === 'task-cancel');
        const runEvent = events.find((e) => e.event.action === 'task-run');

        expect(startEvent).to.be.ok();
        expect(startEvent!.event.provider).to.eql('taskManager');
        expect(startEvent!.kibana.task.id).to.eql(scheduledTask.id);
        expect(startEvent!.kibana.task.type).to.eql('sampleRecurringTaskTimingOutWithError');

        expect(cancelledEvent).to.be.ok();
        expect(cancelledEvent!.event.provider).to.eql('taskManager');
        expect(cancelledEvent!.message).to.eql(
          `Task sampleRecurringTaskTimingOutWithError "${scheduledTask.id}" has been cancelled.`
        );
        expect(cancelledEvent!.kibana.task.id).to.eql(scheduledTask.id);
        expect(cancelledEvent!.kibana.task.type).to.eql('sampleRecurringTaskTimingOutWithError');

        expect(runEvent).to.be.ok();
        expect(runEvent!.event.provider).to.eql('taskManager');
        expect(runEvent!.event.outcome).to.eql('failure');
        expect(runEvent!.event.reason).to.eql(`Task "${scheduledTask.id}" was cancelled.`);
        expect(runEvent!.kibana.task.id).to.eql(scheduledTask.id);
        expect(runEvent!.kibana.task.type).to.eql('sampleRecurringTaskTimingOutWithError');
      });
    });
  });
}
