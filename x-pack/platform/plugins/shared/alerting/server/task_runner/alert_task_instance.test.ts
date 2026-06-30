/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import { TaskStatus } from '@kbn/task-manager-plugin/server';
import type { AlertTaskInstance } from './alert_task_instance';
import { taskInstanceToAlertTaskInstance } from './alert_task_instance';
import { v4 as uuidv4 } from 'uuid';
import type { SanitizedRule } from '../types';

const alert: SanitizedRule<{
  bar: boolean;
}> = {
  id: 'alert-123',
  alertTypeId: '123',
  schedule: { interval: '10s' },
  params: {
    bar: true,
  },
  actions: [],
  enabled: true,
  name: '',
  tags: [],
  consumer: '',
  createdBy: null,
  updatedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  apiKeyOwner: null,
  throttle: null,
  notifyWhen: null,
  muteAll: false,
  mutedInstanceIds: [],
  executionStatus: {
    status: 'unknown',
    lastExecutionDate: new Date('2020-08-20T19:23:38Z'),
  },
  revision: 0,
};

describe('Alert Task Instance', () => {
  test(`passes-through the state object`, () => {
    const taskInstance: ConcreteTaskInstance = {
      id: uuidv4(),
      attempts: 0,
      status: TaskStatus.Running,
      version: '123',
      runAt: new Date(),
      scheduledAt: new Date(),
      startedAt: new Date(),
      retryAt: new Date(Date.now() + 5 * 60 * 1000),
      state: { foo: true },
      taskType: 'alerting:test',
      params: {
        alertId: '1',
      },
      ownerId: null,
    };

    const alertTaskInsatnce: AlertTaskInstance = taskInstanceToAlertTaskInstance(taskInstance);

    expect(alertTaskInsatnce).toEqual(taskInstance);
  });

  test(`decodes a serialized spaceId param`, () => {
    const taskInstance: ConcreteTaskInstance = {
      id: uuidv4(),
      attempts: 0,
      status: TaskStatus.Running,
      version: '123',
      runAt: new Date(),
      scheduledAt: new Date(),
      startedAt: new Date(),
      retryAt: new Date(Date.now() + 5 * 60 * 1000),
      state: {},
      taskType: 'alerting:test',
      params: {
        alertId: '1',
        spaceId: 'my-space',
      },
      ownerId: null,
    };

    const alertTaskInstance = taskInstanceToAlertTaskInstance(taskInstance);

    expect(alertTaskInstance.params.spaceId).toEqual('my-space');
  });

  test(`validates that a TaskInstance has valid Params`, () => {
    const taskInstance: ConcreteTaskInstance = {
      id: uuidv4(),
      attempts: 0,
      status: TaskStatus.Running,
      version: '123',
      runAt: new Date(),
      scheduledAt: new Date(),
      startedAt: new Date(),
      retryAt: new Date(Date.now() + 5 * 60 * 1000),
      state: {},
      taskType: 'alerting:test',
      params: {
        alertId: '1',
      },
      ownerId: null,
    };

    const alertTaskInsatnce: AlertTaskInstance = taskInstanceToAlertTaskInstance(
      taskInstance,
      alert
    );

    expect(alertTaskInsatnce).toEqual(taskInstance);
  });

  test(`throws if params are invalid`, () => {
    const taskInstance: ConcreteTaskInstance = {
      id: '215ee69b-1df9-428e-ab1a-ccf274f8fa5b',
      attempts: 0,
      status: TaskStatus.Running,
      version: '123',
      runAt: new Date(),
      scheduledAt: new Date(),
      startedAt: new Date(),
      retryAt: new Date(Date.now() + 5 * 60 * 1000),
      state: {},
      taskType: 'alerting:test',
      params: {},
      ownerId: null,
    };

    expect(() =>
      taskInstanceToAlertTaskInstance(taskInstance, alert)
    ).toThrowErrorMatchingInlineSnapshot(
      `"Task \\"215ee69b-1df9-428e-ab1a-ccf274f8fa5b\\" (underlying Alert \\"alert-123\\") has an invalid param at .0.alertId"`
    );
  });
});
