/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import { Alert } from './alert';
import type { AlertInstanceState, AlertInstanceContext, DefaultActionGroupId } from '../../common';
import { alertWithAnyUUID } from '../test_utils';
import type { CombinedSummarizedAlerts } from '../types';
import type { RawRuleSnoozedInstance } from '../saved_objects/schemas/raw_rule';

let clock: sinon.SinonFakeTimers;

beforeAll(() => {
  clock = sinon.useFakeTimers();
});
beforeEach(() => clock.reset());
afterAll(() => clock.restore());

describe('getId()', () => {
  test('correctly sets id in constructor', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    expect(alert.getId()).toEqual('1');
  });
});

describe('matchesUuid()', () => {
  test('returns true if alert UUID matches given uuid', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    const uuid = alert.getUuid();

    expect(alert.matchesUuid(uuid)).toBe(true);
  });

  test('returns true if alert ID matches given uuid', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('123');

    expect(alert.matchesUuid('123')).toBe(true);
  });

  test('returns false if neither alert ID or UUID matches given uuid', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('123');

    expect(alert.matchesUuid('xyz')).toBe(false);
  });
});

describe('hasScheduledActions()', () => {
  test('defaults to false', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    expect(alert.hasScheduledActions()).toEqual(false);
  });

  test('returns true when scheduleActions is called', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    alert.scheduleActions('default');
    expect(alert.hasScheduledActions()).toEqual(true);
  });
});

describe('isThrottled', () => {
  test(`should throttle when group didn't change and throttle period is still active`, () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    clock.tick(30000);
    alert.scheduleActions('default');
    expect(alert.isThrottled({ throttle: '1m' })).toEqual(true);
  });

  test(`should use actionHash if it was used in a legacy action`, () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
          actions: {
            'slack:alert:1h': { date: new Date().toISOString() },
          },
        },
      },
    });
    clock.tick(30000);
    alert.scheduleActions('default');
    expect(
      alert.isThrottled({ throttle: '1m', actionHash: 'slack:alert:1h', uuid: '111-222' })
    ).toEqual(true);
  });

  test(`shouldn't throttle when group didn't change and throttle period expired`, () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    clock.tick(30000);
    alert.scheduleActions('default');
    expect(alert.isThrottled({ throttle: '15s' })).toEqual(false);
  });

  test(`shouldn't throttle when group changes`, () => {
    const alert = new Alert<never, never, 'default' | 'other-group'>('1', {
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    clock.tick(5000);
    alert.scheduleActions('other-group');
    expect(alert.isThrottled({ throttle: '1m' })).toEqual(false);
  });

  test(`throttle a specific action`, () => {
    const alert = new Alert<never, never, 'default' | 'other-group'>('1', {
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
          actions: {
            '111-111': { date: new Date().toISOString() },
          },
        },
      },
    });
    clock.tick(5000);
    alert.scheduleActions('other-group');
    expect(alert.isThrottled({ throttle: '1m', uuid: '111-111' })).toEqual(false);
  });

  test(`shouldn't throttle a specific action when group didn't change and throttle period expired`, () => {
    const alert = new Alert<never, never, 'default' | 'other-group'>('1', {
      meta: {
        lastScheduledActions: {
          date: new Date('2020-01-01').toISOString(),
          group: 'default',
          actions: {
            '111-111': { date: new Date().toISOString() },
          },
        },
      },
    });
    clock.tick(30000);
    alert.scheduleActions('default');
    expect(alert.isThrottled({ throttle: '15s', uuid: '111-111', actionHash: 'slack:1h' })).toEqual(
      false
    );
  });

  test(`shouldn't throttle a specific action when group changes`, () => {
    const alert = new Alert<never, never, 'default' | 'other-group'>('1', {
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
          actions: {
            '111-111': { date: new Date().toISOString() },
          },
        },
      },
    });
    clock.tick(5000);
    alert.scheduleActions('other-group');
    expect(alert.isThrottled({ throttle: '1m', uuid: '111-111' })).toEqual(false);
  });
});

describe('scheduledActionGroupHasChanged()', () => {
  test('should be false if no last scheduled and nothing scheduled', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    expect(alert.scheduledActionGroupHasChanged()).toEqual(false);
  });

  test('should be false if group does not change', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    alert.scheduleActions('default');
    expect(alert.scheduledActionGroupHasChanged()).toEqual(false);
  });

  test('should be true if no last scheduled and has scheduled action', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    alert.scheduleActions('default');
    expect(alert.scheduledActionGroupHasChanged()).toEqual(true);
  });

  test('should be true if group does change', () => {
    const alert = new Alert<never, never, 'default' | 'penguin'>('1', {
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    alert.scheduleActions('penguin');
    expect(alert.scheduledActionGroupHasChanged()).toEqual(true);
  });
});

describe('getScheduledActionOptions()', () => {
  test('defaults to undefined', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    expect(alert.getScheduledActionOptions()).toBeUndefined();
  });
});

describe('unscheduleActions()', () => {
  test('makes hasScheduledActions() return false', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    alert.scheduleActions('default');
    expect(alert.hasScheduledActions()).toEqual(true);
    alert.unscheduleActions();
    expect(alert.hasScheduledActions()).toEqual(false);
  });

  test('makes getScheduledActionOptions() return undefined', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    alert.scheduleActions('default');
    expect(alert.getScheduledActionOptions()).toEqual({
      actionGroup: 'default',
      context: {},
      state: {},
    });
    alert.unscheduleActions();
    expect(alert.getScheduledActionOptions()).toBeUndefined();
  });
});

describe('getState()', () => {
  test('returns state passed to constructor', () => {
    const state = { foo: true };
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      state,
    });
    expect(alert.getState()).toEqual(state);
  });
});

describe('getUUID()', () => {
  test('returns a UUID for a new alert', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    const uuid = alert.getUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('returns same uuid from previous run of alert', () => {
    const uuid = 'previous-uuid';
    const meta = { uuid };
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta,
    });
    expect(alert.getUuid()).toEqual(uuid);
  });
});

describe('getStart()', () => {
  test('returns null for new alert', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    expect(alert.getStart()).toBeNull();
  });

  test('returns start time if set in state', () => {
    const uuid = 'previous-uuid';
    const meta = { uuid };
    const state = { foo: true, start: '2023-03-28T12:27:28.159Z', duration: '0' };
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      state,
      meta,
    });
    expect(alert.getStart()).toEqual('2023-03-28T12:27:28.159Z');
  });
});

describe('scheduleActions()', () => {
  test('makes hasScheduledActions() return true', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      state: { foo: true },
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    alert.replaceState({ otherField: true }).scheduleActions('default', { field: true });
    expect(alert.hasScheduledActions()).toEqual(true);
  });

  test('makes isThrottled() return true when throttled', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      state: { foo: true },
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    alert.replaceState({ otherField: true }).scheduleActions('default', { field: true });
    expect(alert.isThrottled({ throttle: '1m' })).toEqual(true);
  });

  test('make isThrottled() return false when throttled expired', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      state: { foo: true },
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    clock.tick(120000);
    alert.replaceState({ otherField: true }).scheduleActions('default', { field: true });
    expect(alert.isThrottled({ throttle: '1m' })).toEqual(false);
  });

  test('makes getScheduledActionOptions() return given options', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      state: { foo: true },
      meta: {},
    });
    alert.replaceState({ otherField: true }).scheduleActions('default', { field: true });
    expect(alert.getScheduledActionOptions()).toEqual({
      actionGroup: 'default',
      context: { field: true },
      state: { otherField: true },
    });
  });

  test('cannot schdule for execution twice', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    alert.scheduleActions('default', { field: true });
    expect(() =>
      alert.scheduleActions('default', { field: false })
    ).toThrowErrorMatchingInlineSnapshot(
      `"Alert instance execution has already been scheduled, cannot schedule twice"`
    );
  });
});

describe('replaceState()', () => {
  test('replaces previous state', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      state: { foo: true },
    });
    alert.replaceState({ bar: true });
    expect(alert.getState()).toEqual({ bar: true });
    alert.replaceState({ baz: true });
    expect(alert.getState()).toEqual({ baz: true });
  });
});

describe('updateLastScheduledActions()', () => {
  test('replaces previous lastScheduledActions', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: {},
    });
    alert.updateLastScheduledActions('default');
    expect(alert.toJSON()).toEqual({
      state: {},
      meta: {
        uuid: expect.any(String),
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
        flappingHistory: [],
        maintenanceWindowIds: [],
        maintenanceWindowNames: [],
      },
    });
  });

  test('replaces previous lastScheduledActions with a scheduled action', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: {},
    });
    alert.updateLastScheduledActions('default', 'actionId1', '111-111');
    expect(alert.toJSON()).toEqual({
      state: {},
      meta: {
        flappingHistory: [],
        maintenanceWindowIds: [],
        maintenanceWindowNames: [],
        uuid: expect.any(String),
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
          actions: {
            '111-111': { date: new Date().toISOString() },
          },
        },
      },
    });
  });

  test('removes the objects with an old actionHash', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: {
        flappingHistory: [],
        maintenanceWindowIds: [],
        maintenanceWindowNames: [],
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
          actions: {
            'slack:alert:1h': { date: new Date().toISOString() },
          },
        },
      },
    });
    alert.updateLastScheduledActions('default', 'slack:alert:1h', '111-111');
    expect(alert.toJSON()).toEqual({
      state: {},
      meta: {
        flappingHistory: [],
        maintenanceWindowIds: [],
        maintenanceWindowNames: [],
        uuid: expect.any(String),
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
          actions: {
            '111-111': { date: new Date().toISOString() },
          },
        },
      },
    });
  });

  test('removes the outdated actions', () => {
    const actionsOnTheRule = ['222-222', '333-333'];

    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: {
        flappingHistory: [],
        maintenanceWindowIds: [],
        maintenanceWindowNames: [],
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
          actions: {
            '111-111': { date: new Date().toISOString() },
            '222-222': { date: new Date().toISOString() },
          },
        },
      },
    });
    alert.clearThrottlingLastScheduledActions(actionsOnTheRule);
    expect(alert.toJSON()).toEqual({
      state: {},
      meta: {
        flappingHistory: [],
        maintenanceWindowIds: [],
        maintenanceWindowNames: [],
        uuid: expect.any(String),
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
          actions: {
            '222-222': { date: new Date().toISOString() },
          },
        },
      },
    });
  });
  test('removes all the actions when there is no action on the rule', () => {
    const actionsOnTheRule: string[] = [];

    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: {
        flappingHistory: [],
        maintenanceWindowIds: [],
        maintenanceWindowNames: [],
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
          actions: {
            '111-111': { date: new Date().toISOString() },
            '222-222': { date: new Date().toISOString() },
          },
        },
      },
    });
    alert.clearThrottlingLastScheduledActions(actionsOnTheRule);
    expect(alert.toJSON()).toEqual({
      state: {},
      meta: {
        flappingHistory: [],
        maintenanceWindowIds: [],
        maintenanceWindowNames: [],
        uuid: expect.any(String),
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
          actions: {},
        },
      },
    });
  });
});

describe('getContext()', () => {
  test('returns empty object when context has not been set', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      state: { foo: true },
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    expect(alert.getContext()).toStrictEqual({});
  });

  test('returns context when context has not been set', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      state: { foo: true },
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    alert.setContext({ field: true });
    expect(alert.getContext()).toStrictEqual({ field: true });
  });
});

describe('hasContext()', () => {
  test('returns true when context has been set via scheduleActions()', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      state: { foo: true },
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    alert.scheduleActions('default', { field: true });
    expect(alert.hasContext()).toEqual(true);
  });

  test('returns true when context has been set via setContext()', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      state: { foo: true },
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    alert.setContext({ field: true });
    expect(alert.hasContext()).toEqual(true);
  });

  test('returns false when context has not been set', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      state: { foo: true },
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
      },
    });
    expect(alert.hasContext()).toEqual(false);
  });
});

describe('toJSON', () => {
  test('only serializes state and meta', () => {
    const alertInstance = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>(
      '1',
      {
        state: { foo: true },
        meta: {
          lastScheduledActions: {
            date: new Date().toISOString(),
            group: 'default',
          },
          flappingHistory: [false, true],
          maintenanceWindowIds: [],
          maintenanceWindowNames: [],
          flapping: false,
          pendingRecoveredCount: 2,
        },
      }
    );

    expect(alertInstance).toMatchObject({
      state: {
        foo: true,
      },
      meta: {
        lastScheduledActions: {
          date: expect.any(String),
          group: 'default',
        },
        uuid: expect.any(String),
        flappingHistory: [false, true],
        flapping: false,
        pendingRecoveredCount: 2,
      },
    });
  });
});

describe('toRaw', () => {
  test('returns unserialised underlying state and meta', () => {
    const raw = {
      state: { foo: true },
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
        flappingHistory: [false, true, true],
        pendingRecoveredCount: 2,
        activeCount: 1,
      },
    };
    const alertInstance = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>(
      '1',
      raw
    );
    expect(alertInstance.toRaw()).toEqual(raw);
  });

  test('returns unserialised underlying partial meta if recovered is true', () => {
    const raw = {
      state: { foo: true },
      meta: {
        lastScheduledActions: {
          date: new Date().toISOString(),
          group: 'default',
        },
        flappingHistory: [false, true, true],
        flapping: false,
        activeCount: 1,
      },
    };
    const alertInstance = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>(
      '1',
      raw
    );
    expect(alertInstance.toRaw(true)).toEqual({
      meta: {
        flappingHistory: [false, true, true],
        flapping: false,
        maintenanceWindowIds: [],
        maintenanceWindowNames: [],
        uuid: expect.any(String),
        activeCount: 1,
      },
    });
  });
});

describe('setFlappingHistory', () => {
  test('sets flappingHistory', () => {
    const alertInstance = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>(
      '1',
      {
        meta: { flappingHistory: [false, true, true] },
      }
    );
    alertInstance.setFlappingHistory([false]);
    expect(alertInstance.getFlappingHistory()).toEqual([false]);
    expect(alertWithAnyUUID(alertInstance.toRaw())).toMatchInlineSnapshot(`
      Object {
        "meta": Object {
          "flappingHistory": Array [
            false,
          ],
          "maintenanceWindowIds": Array [],
          "maintenanceWindowNames": Array [],
          "uuid": Any<String>,
        },
        "state": Object {},
      }
    `);
  });
});

describe('getFlappingHistory', () => {
  test('correctly sets flappingHistory', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: { flappingHistory: [false, false] },
    });
    expect(alert.getFlappingHistory()).toEqual([false, false]);
  });
});

describe('setFlapping', () => {
  test('sets flapping', () => {
    const alertInstance = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>(
      '1',
      {
        meta: { flapping: true },
      }
    );
    alertInstance.setFlapping(false);
    expect(alertInstance.getFlapping()).toEqual(false);
    expect(alertWithAnyUUID(alertInstance.toRaw())).toMatchInlineSnapshot(`
      Object {
        "meta": Object {
          "flapping": false,
          "flappingHistory": Array [],
          "maintenanceWindowIds": Array [],
          "maintenanceWindowNames": Array [],
          "uuid": Any<String>,
        },
        "state": Object {},
      }
    `);
  });
});

describe('getFlapping', () => {
  test('correctly sets flapping', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: { flapping: true },
    });
    expect(alert.getFlapping()).toEqual(true);
  });
});

describe('incrementPendingRecoveredCount', () => {
  test('correctly increments pendingRecoveredCount', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: { pendingRecoveredCount: 3 },
    });
    alert.incrementPendingRecoveredCount();
    expect(alert.getPendingRecoveredCount()).toEqual(4);
  });

  test('correctly increments pendingRecoveredCount when it is not already defined', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    alert.incrementPendingRecoveredCount();
    expect(alert.getPendingRecoveredCount()).toEqual(1);
  });
});

describe('getPendingRecoveredCount', () => {
  test('returns pendingRecoveredCount', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: { pendingRecoveredCount: 3 },
    });
    expect(alert.getPendingRecoveredCount()).toEqual(3);
  });

  test('defines and returns pendingRecoveredCount when it is not already defined', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    expect(alert.getPendingRecoveredCount()).toEqual(0);
  });
});

describe('resetPendingRecoveredCount', () => {
  test('resets pendingRecoveredCount to 0', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: { pendingRecoveredCount: 3 },
    });
    alert.resetPendingRecoveredCount();
    expect(alert.getPendingRecoveredCount()).toEqual(0);
  });
});
describe('isFilteredOut', () => {
  const summarizedAlerts: CombinedSummarizedAlerts = {
    all: {
      count: 1,
      data: [
        {
          _id: '1',
          _index: '.alerts',
          '@timestamp': '',
          // @ts-expect-error
          kibana: {
            alert: {
              instance: { id: 'a' },
              rule: {
                category: 'category',
                consumer: 'consumer',
                name: 'name',
                producer: 'producer',
                revision: 0,
                rule_type_id: 'rule_type_id',
                uuid: 'uuid',
              },
              status: 'status',
              uuid: '1',
            },
            space_ids: ['default'],
          },
        },
      ],
    },
    new: { count: 0, data: [] },
    ongoing: { count: 0, data: [] },
    recovered: { count: 0, data: [] },
  };

  test('returns false if summarizedAlerts is null', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: { pendingRecoveredCount: 3, uuid: '1' },
    });
    expect(alert.isFilteredOut(null)).toBe(false);
  });
  test('returns false if the alert with same ID is in summarizedAlerts', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: { pendingRecoveredCount: 3, uuid: 'no' },
    });
    expect(alert.isFilteredOut(summarizedAlerts)).toBe(false);
  });
  test('returns false if the alert with same UUID is in summarizedAlerts', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('2', {
      meta: { pendingRecoveredCount: 3, uuid: '1' },
    });
    expect(alert.isFilteredOut(summarizedAlerts)).toBe(false);
  });
  test('returns true if the alert with same UUID or ID is not in summarizedAlerts', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('2', {
      meta: { pendingRecoveredCount: 3, uuid: '3' },
    });
    expect(alert.isFilteredOut(summarizedAlerts)).toBe(true);
  });
});

describe('incrementActiveCount', () => {
  test('correctly increments activeCount', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: { activeCount: 3 },
    });
    alert.incrementActiveCount();
    expect(alert.getActiveCount()).toEqual(4);
  });

  test('correctly increments activeCount when it is not already defined', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    alert.incrementActiveCount();
    expect(alert.getActiveCount()).toEqual(1);
  });
});

describe('getActiveCount', () => {
  test('returns ActiveCount', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: { activeCount: 3 },
    });
    expect(alert.getActiveCount()).toEqual(3);
  });

  test('defines and returns activeCount when it is not already defined', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    expect(alert.getActiveCount()).toEqual(0);
  });
});

describe('resetActiveCount', () => {
  test('resets activeCount to 0', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1', {
      meta: { activeCount: 3 },
    });
    alert.resetActiveCount();
    expect(alert.getActiveCount()).toEqual(0);
  });
});

describe('isDelayed', () => {
  test('returns false when status is not delayed', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    alert.setStatus('active');
    expect(alert.isDelayed()).toEqual(false);
  });

  test('returns false when status is not set', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    expect(alert.isDelayed()).toEqual(false);
  });

  test('returns true when status is delayed', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    alert.setStatus('delayed');
    expect(alert.isDelayed()).toEqual(true);
  });
});

describe('setSnoozeConfig and getSnoozeConfig', () => {
  test('stores and retrieves a snooze config with all fields', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    const config: RawRuleSnoozedInstance = {
      instanceId: '1',
      snoozedAt: '2024-01-01T00:00:00.000Z',
      snoozedBy: 'user',
      expiresAt: '2024-12-31T00:00:00.000Z',
    };
    alert.setSnoozeConfig(config);
    expect(alert.getSnoozeConfig()).toEqual(config);
  });

  test('stores and retrieves a snooze config without expiresAt (indefinite)', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    const config: RawRuleSnoozedInstance = {
      instanceId: '1',
      snoozedAt: '2024-01-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    alert.setSnoozeConfig(config);
    expect(alert.getSnoozeConfig()).toEqual(config);
    expect(alert.getSnoozeConfig()?.expiresAt).toBeUndefined();
  });

  test('returns undefined when no snooze config has been set', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    expect(alert.getSnoozeConfig()).toBeUndefined();
  });

  test('overwrites a previously set snooze config', () => {
    const alert = new Alert<AlertInstanceState, AlertInstanceContext, DefaultActionGroupId>('1');
    const first: RawRuleSnoozedInstance = {
      instanceId: '1',
      snoozedAt: '2024-01-01T00:00:00.000Z',
      snoozedBy: 'user-a',
    };
    const second: RawRuleSnoozedInstance = {
      instanceId: '1',
      snoozedAt: '2025-06-01T00:00:00.000Z',
      snoozedBy: 'user-b',
      expiresAt: '2025-07-01T00:00:00.000Z',
    };
    alert.setSnoozeConfig(first);
    alert.setSnoozeConfig(second);
    expect(alert.getSnoozeConfig()).toEqual(second);
  });
});
