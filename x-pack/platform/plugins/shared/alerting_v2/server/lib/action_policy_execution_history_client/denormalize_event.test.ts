/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IValidatedEvent } from '@kbn/event-log-plugin/server';
import { ACTION_POLICY_SAVED_OBJECT_TYPE, RULE_SAVED_OBJECT_TYPE } from '../../saved_objects';
import { ACTION_POLICY_EVENT_ACTIONS } from '../dispatcher/steps/constants';
import {
  collectIdsFromEvents,
  denormalizeEvent,
  isPolicyOutcome,
  isString,
  type NameMaps,
} from './denormalize_event';

const EMPTY_NAME_MAPS: NameMaps = {
  policyNames: new Map(),
  ruleNames: new Map(),
  workflowNames: new Map(),
};

const buildEvent = (overrides: Partial<NonNullable<IValidatedEvent>> = {}): IValidatedEvent =>
  ({
    '@timestamp': '2026-05-05T10:00:00.000Z',
    event: { action: ACTION_POLICY_EVENT_ACTIONS.DISPATCHED, provider: 'alerting_v2' },
    kibana: {
      saved_objects: [{ type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' }],
      alerting_v2: { dispatcher: {} },
    },
    ...overrides,
  } as IValidatedEvent);

describe('isString', () => {
  it('returns true for strings', () => {
    expect(isString('hello')).toBe(true);
    expect(isString('')).toBe(true);
  });

  it('returns false for non-strings', () => {
    expect(isString(undefined)).toBe(false);
    expect(isString(null)).toBe(false);
    expect(isString(42)).toBe(false);
    expect(isString({})).toBe(false);
  });
});

describe('isPolicyOutcome', () => {
  it('accepts dispatched and throttled', () => {
    expect(isPolicyOutcome('dispatched')).toBe(true);
    expect(isPolicyOutcome('throttled')).toBe(true);
  });

  it('rejects unmatched and other strings', () => {
    expect(isPolicyOutcome('unmatched')).toBe(false);
    expect(isPolicyOutcome('foo')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isPolicyOutcome(undefined)).toBe(false);
    expect(isPolicyOutcome(null)).toBe(false);
    expect(isPolicyOutcome(42)).toBe(false);
  });
});

describe('collectIdsFromEvents', () => {
  it('returns empty arrays for an empty input', () => {
    expect(collectIdsFromEvents([])).toEqual({
      policyIds: [],
      ruleIds: [],
      workflowIds: [],
    });
  });

  it('skips null events', () => {
    expect(collectIdsFromEvents([null as unknown as IValidatedEvent])).toEqual({
      policyIds: [],
      ruleIds: [],
      workflowIds: [],
    });
  });

  it('extracts ids from saved_objects + dispatcher fields', () => {
    const event = buildEvent({
      kibana: {
        saved_objects: [
          { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
          { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-1' },
          { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-2' },
        ],
        alerting_v2: {
          dispatcher: {
            rule_ids: ['rule-3'],
            workflow_ids: ['wf-1', 'wf-2'],
          },
        },
      },
    });

    expect(collectIdsFromEvents([event])).toEqual({
      policyIds: ['policy-1'],
      ruleIds: ['rule-1', 'rule-2', 'rule-3'],
      workflowIds: ['wf-1', 'wf-2'],
    });
  });

  it('deduplicates ids across events', () => {
    const eventA = buildEvent({
      kibana: {
        saved_objects: [
          { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
          { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-1' },
        ],
        alerting_v2: { dispatcher: { workflow_ids: ['wf-1'] } },
      },
    });
    const eventB = buildEvent({
      kibana: {
        saved_objects: [
          { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
          { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-1' },
        ],
        alerting_v2: { dispatcher: { workflow_ids: ['wf-1'] } },
      },
    });

    expect(collectIdsFromEvents([eventA, eventB])).toEqual({
      policyIds: ['policy-1'],
      ruleIds: ['rule-1'],
      workflowIds: ['wf-1'],
    });
  });

  it('filters non-string ids', () => {
    const event = buildEvent({
      kibana: {
        saved_objects: [
          { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
          { type: RULE_SAVED_OBJECT_TYPE, id: 42 as unknown as string },
        ],
        alerting_v2: {
          dispatcher: {
            rule_ids: [null as unknown as string, 'rule-good'],
            workflow_ids: [undefined as unknown as string],
          },
        },
      },
    });

    expect(collectIdsFromEvents([event])).toEqual({
      policyIds: ['policy-1'],
      ruleIds: ['rule-good'],
      workflowIds: [],
    });
  });
});

describe('denormalizeEvent', () => {
  it('returns [] for null event', () => {
    expect(denormalizeEvent(null as unknown as IValidatedEvent, EMPTY_NAME_MAPS)).toEqual([]);
  });

  it('returns [] when action is not a policy outcome', () => {
    const event = buildEvent({
      event: { action: ACTION_POLICY_EVENT_ACTIONS.UNMATCHED, provider: 'alerting_v2' },
    });
    expect(denormalizeEvent(event, EMPTY_NAME_MAPS)).toEqual([]);
  });

  it('returns [] when @timestamp is missing', () => {
    const event = buildEvent({ '@timestamp': undefined });
    expect(denormalizeEvent(event, EMPTY_NAME_MAPS)).toEqual([]);
  });

  it('returns [] when no policy ref exists', () => {
    const event = buildEvent({
      kibana: {
        saved_objects: [{ type: RULE_SAVED_OBJECT_TYPE, id: 'rule-1' }],
        alerting_v2: { dispatcher: {} },
      },
    });
    expect(denormalizeEvent(event, EMPTY_NAME_MAPS)).toEqual([]);
  });

  it('returns [] when policy has no rules referenced', () => {
    const event = buildEvent({
      kibana: {
        saved_objects: [{ type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' }],
        alerting_v2: { dispatcher: {} },
      },
    });
    expect(denormalizeEvent(event, EMPTY_NAME_MAPS)).toEqual([]);
  });

  it('emits one row per rule referenced', () => {
    const event = buildEvent({
      kibana: {
        saved_objects: [
          { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
          { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-a' },
          { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-b' },
        ],
        alerting_v2: {
          dispatcher: {
            episode_count: 3,
            action_group_count: 2,
            workflow_ids: ['wf-1'],
          },
        },
      },
    });

    const rows = denormalizeEvent(event, EMPTY_NAME_MAPS);
    expect(rows).toHaveLength(2);
    expect(rows[0].rule.id).toBe('rule-a');
    expect(rows[1].rule.id).toBe('rule-b');
    expect(rows.every((r) => r.policy.id === 'policy-1')).toBe(true);
    expect(rows.every((r) => r.episode_count === 3)).toBe(true);
    expect(rows.every((r) => r.action_group_count === 2)).toBe(true);
  });

  it('combines ref-based rule ids with spillover dispatcher.rule_ids', () => {
    const event = buildEvent({
      kibana: {
        saved_objects: [
          { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
          { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-a' },
        ],
        alerting_v2: { dispatcher: { rule_ids: ['rule-b', 'rule-c'] } },
      },
    });

    const rows = denormalizeEvent(event, EMPTY_NAME_MAPS);
    expect(rows.map((r) => r.rule.id)).toEqual(['rule-a', 'rule-b', 'rule-c']);
  });

  it('fills names from maps when present', () => {
    const event = buildEvent({
      kibana: {
        saved_objects: [
          { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
          { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-a' },
        ],
        alerting_v2: { dispatcher: { workflow_ids: ['wf-1'] } },
      },
    });

    const rows = denormalizeEvent(event, {
      policyNames: new Map([['policy-1', 'My Policy']]),
      ruleNames: new Map([['rule-a', 'My Rule']]),
      workflowNames: new Map([['wf-1', 'My Workflow']]),
    });

    expect(rows[0].policy).toEqual({ id: 'policy-1', name: 'My Policy' });
    expect(rows[0].rule).toEqual({ id: 'rule-a', name: 'My Rule' });
    expect(rows[0].workflows).toEqual([{ id: 'wf-1', name: 'My Workflow' }]);
  });

  it('falls back to null name when id missing from maps', () => {
    const event = buildEvent({
      kibana: {
        saved_objects: [
          { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
          { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-a' },
        ],
        alerting_v2: { dispatcher: { workflow_ids: ['wf-1'] } },
      },
    });

    const rows = denormalizeEvent(event, EMPTY_NAME_MAPS);
    expect(rows[0].policy.name).toBeNull();
    expect(rows[0].rule.name).toBeNull();
    expect(rows[0].workflows[0].name).toBeNull();
  });

  it('preserves the outcome verbatim', () => {
    const dispatched = denormalizeEvent(
      buildEvent({
        event: { action: ACTION_POLICY_EVENT_ACTIONS.DISPATCHED, provider: 'alerting_v2' },
        kibana: {
          saved_objects: [
            { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
            { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-a' },
          ],
          alerting_v2: { dispatcher: {} },
        },
      }),
      EMPTY_NAME_MAPS
    );
    const throttled = denormalizeEvent(
      buildEvent({
        event: { action: ACTION_POLICY_EVENT_ACTIONS.THROTTLED, provider: 'alerting_v2' },
        kibana: {
          saved_objects: [
            { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
            { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-a' },
          ],
          alerting_v2: { dispatcher: {} },
        },
      }),
      EMPTY_NAME_MAPS
    );

    expect(dispatched[0].outcome).toBe('dispatched');
    expect(throttled[0].outcome).toBe('throttled');
  });

  it('coerces missing numeric counts to 0', () => {
    const event = buildEvent({
      kibana: {
        saved_objects: [
          { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
          { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-a' },
        ],
        alerting_v2: { dispatcher: {} },
      },
    });
    const rows = denormalizeEvent(event, EMPTY_NAME_MAPS);
    expect(rows[0].episode_count).toBe(0);
    expect(rows[0].action_group_count).toBe(0);
    expect(rows[0].workflows).toEqual([]);
  });

  describe('when search is not active', () => {
    it('returns all rule ids when matchingSearchIds is undefined', () => {
      const event = buildEvent({
        kibana: {
          saved_objects: [
            { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
            { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-a' },
            { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-b' },
          ],
          alerting_v2: { dispatcher: {} },
        },
      });
      const rows = denormalizeEvent(event, EMPTY_NAME_MAPS, undefined);
      expect(rows.map((r) => r.rule.id)).toEqual(['rule-a', 'rule-b']);
    });
  });

  describe('when search is active', () => {
    it('returns [] when search is active but there are no matches', () => {
      const event = buildEvent({
        kibana: {
          saved_objects: [
            { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
            { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-a' },
          ],
          alerting_v2: { dispatcher: {} },
        },
      });
      expect(
        denormalizeEvent(event, EMPTY_NAME_MAPS, {
          policyIds: [],
          ruleIds: [],
          hasMatches: false,
          matches: null,
        })
      ).toEqual([]);
    });

    it('returns all rule ids if policy is in search matches', () => {
      const event = buildEvent({
        kibana: {
          saved_objects: [
            { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
            { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-a' },
            { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-b' },
          ],
          alerting_v2: { dispatcher: {} },
        },
      });
      const rows = denormalizeEvent(event, EMPTY_NAME_MAPS, {
        policyIds: ['policy-1'],
        ruleIds: [],
        hasMatches: true,
        matches: null,
      });
      expect(rows.map((r) => r.rule.id)).toEqual(['rule-a', 'rule-b']);
    });

    it('returns only matching rule ids if policy is not in search matches', () => {
      const event = buildEvent({
        kibana: {
          saved_objects: [
            { type: ACTION_POLICY_SAVED_OBJECT_TYPE, id: 'policy-1' },
            { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-a' },
            { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-b' },
            { type: RULE_SAVED_OBJECT_TYPE, id: 'rule-c' },
          ],
          alerting_v2: { dispatcher: {} },
        },
      });
      const rows = denormalizeEvent(event, EMPTY_NAME_MAPS, {
        policyIds: ['policy-2'],
        ruleIds: ['rule-a', 'rule-c'],
        hasMatches: true,
        matches: null,
      });
      expect(rows.map((r) => r.rule.id)).toEqual(['rule-a', 'rule-c']);
    });
  });
});
