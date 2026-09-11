/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_EPISODE_ACTION_TYPE, type CreateAlertActionBody } from '@kbn/alerting-v2-schemas';
import type { AlertAction } from '../../../resources/datastreams/alert_actions';
import type { ActionHandler, HandlerItem, PreparedAction } from '../handler';
import type { AlertEventRecord } from '../types';
import { ACTION_HANDLERS, type ActionHandlersRegistry, prepareWithHandler } from '.';

/**
 * `prepareWithHandler` takes the registry as a parameter, so tests
 * build their own inline registries instead of touching the canonical
 * one. No `wipeRegistry`, no `afterEach` teardown — `ACTION_HANDLERS`
 * is only read here for the isolated pin tests below, never mutated
 * or restored.
 */

// Minimal stand-ins — `prepareWithHandler` never inspects these
// shapes, so casting through `unknown` keeps the test wiring small
// without weakening any production type.
const fakeAlertEvent = {} as AlertEventRecord;
const fakeAuditDoc = {} as AlertAction;

const makeAckItem = (): HandlerItem<
  Extract<CreateAlertActionBody, { action_type: typeof ALERT_EPISODE_ACTION_TYPE.ACK }>
> => ({
  action: {
    action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
  },
  alertEvent: fakeAlertEvent,
  alertActionDoc: fakeAuditDoc,
});

const makeUnsnoozeItem = (): HandlerItem<
  Extract<CreateAlertActionBody, { action_type: typeof ALERT_EPISODE_ACTION_TYPE.UNSNOOZE }>
> => ({
  action: {
    action_type: ALERT_EPISODE_ACTION_TYPE.UNSNOOZE,
  },
  alertEvent: fakeAlertEvent,
  alertActionDoc: fakeAuditDoc,
});

/**
 * Builds a test registry whose every slot points at `defaultHandler`
 * (so every `action_type` resolves to something), then overrides the
 * specific slots a given test cares about. Defaulting all slots keeps
 * the mapped-type's exhaustiveness invariant satisfied without each
 * test spelling out every action_type.
 *
 * The single cast bridges the variance gap: `ActionHandler` is
 * contravariant in `TBody` (the *sound* reason the wide `defaultHandler`
 * fits every narrow slot); method-shorthand on `prepare` means TS itself
 * checks bivariantly — same conclusion, looser rule. Either way, TS
 * can't follow the wide-handler-fits-every-narrow-slot reasoning across
 * `Object.fromEntries`, hence the cast.
 */
const buildTestRegistry = (
  overrides: Partial<ActionHandlersRegistry>,
  defaultHandler: ActionHandler = {
    prepare: () => ({ alertActionDoc: fakeAuditDoc }),
  }
): ActionHandlersRegistry => {
  const base = Object.fromEntries(
    Object.values(ALERT_EPISODE_ACTION_TYPE).map((actionType) => [actionType, defaultHandler])
  ) as ActionHandlersRegistry;
  return { ...base, ...overrides };
};

describe('production handler registry (ACTION_HANDLERS)', () => {
  it('has a registered handler for every AlertEpisodeActionType value', () => {
    // The mapped type for `ActionHandlersRegistry` already enforces
    // exhaustiveness at compile time, but the runtime assertion
    // protects against accidental shape regression of the canonical
    // registry and gives a much friendlier failure when somebody adds
    // a new action_type and forgets to register a handler.
    const declaredActionTypes = Object.values(ALERT_EPISODE_ACTION_TYPE).sort();
    const registeredActionTypes = Object.keys(ACTION_HANDLERS).sort();

    expect(registeredActionTypes).toEqual(declaredActionTypes);
  });

  /**
   * Behavioural coverage for the audit-only singleton. The orchestrator
   * tests cover ack/tag/snooze/etc. end-to-end, but the singleton
   * itself is the production behaviour for six action types and
   * deserves an isolated pin so any future tweak to its contract
   * surfaces here first.
   */
  describe('audit-only slots', () => {
    const AUDIT_ONLY_ACTION_TYPES = [
      ALERT_EPISODE_ACTION_TYPE.ACK,
      ALERT_EPISODE_ACTION_TYPE.UNACK,
      ALERT_EPISODE_ACTION_TYPE.ASSIGN,
      ALERT_EPISODE_ACTION_TYPE.TAG,
      ALERT_EPISODE_ACTION_TYPE.SNOOZE,
      ALERT_EPISODE_ACTION_TYPE.UNSNOOZE,
    ] as const;

    it('shares one singleton across every audit-only slot', () => {
      // Identity check: the design relies on one prepare-function
      // serving six slots. Anyone replacing one slot with a bespoke
      // handler in the future should do so deliberately — this test
      // makes that intent visible.
      const singletons = AUDIT_ONLY_ACTION_TYPES.map((type) => ACTION_HANDLERS[type]);
      for (const handler of singletons) {
        expect(handler).toBe(singletons[0]);
      }
    });

    it('returns only the precomputed audit doc — no synthetic rule event', () => {
      const item = makeAckItem();
      const prepared = ACTION_HANDLERS[ALERT_EPISODE_ACTION_TYPE.ACK].prepare(item);

      expect(prepared).toEqual({ alertActionDoc: item.alertActionDoc });
    });
  });
});

describe('prepareWithHandler', () => {
  it("delegates to the handler registered for the item's action_type and returns its `PreparedAction`", () => {
    // Two distinct handlers in the same registry prove the helper
    // routes by the discriminant rather than picking whichever is
    // present first.
    const ackPrepared: PreparedAction = { alertActionDoc: fakeAuditDoc };
    const unsnoozePrepared: PreparedAction = { alertActionDoc: fakeAuditDoc };

    const ackPrepare = jest.fn().mockReturnValue(ackPrepared);
    const unsnoozePrepare = jest.fn().mockReturnValue(unsnoozePrepared);

    const registry = buildTestRegistry({
      [ALERT_EPISODE_ACTION_TYPE.ACK]: { prepare: ackPrepare },
      [ALERT_EPISODE_ACTION_TYPE.UNSNOOZE]: { prepare: unsnoozePrepare },
    });

    const ackItem = makeAckItem();
    const unsnoozeItem = makeUnsnoozeItem();

    expect(prepareWithHandler(ackItem, registry)).toBe(ackPrepared);
    expect(prepareWithHandler(unsnoozeItem, registry)).toBe(unsnoozePrepared);

    expect(ackPrepare).toHaveBeenCalledTimes(1);
    expect(unsnoozePrepare).toHaveBeenCalledTimes(1);
  });

  it('forwards the item unchanged to the handler', () => {
    // The handler must see exactly what the orchestrator passed; the
    // helper has no business mutating the argument.
    const prepare = jest.fn().mockReturnValue({ alertActionDoc: fakeAuditDoc });
    const registry = buildTestRegistry({
      [ALERT_EPISODE_ACTION_TYPE.ACK]: { prepare },
    });

    const item = makeAckItem();
    prepareWithHandler(item, registry);

    expect(prepare).toHaveBeenCalledWith(item);
  });
});
