/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import type { RawRule } from '../../../../types';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { IScopedChangeTrackingService } from '../../../../rules_client/lib/change_tracking';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { logRuleChanges } from './log_rule_changes';

// A fixed reference timestamp used across the tests so assertions are deterministic.
const REFERENCE_TIMESTAMP_MS = Date.UTC(2026, 0, 15, 12, 30, 45, 678);
const REFERENCE_TIMESTAMP_ISO = new Date(REFERENCE_TIMESTAMP_MS).toISOString();

describe('logBulkRuleChanges', () => {
  let changeTrackingService: jest.Mocked<IScopedChangeTrackingService>;

  beforeEach(() => {
    changeTrackingService = createMockChangeTrackingService();
  });

  it('logs every successful rule change in a single bulk call', async () => {
    const context = buildContext({ changeTrackingService });
    const ruleSOs = [buildRuleSO('rule-1'), buildRuleSO('rule-2')];

    await logRuleChanges({
      rulesClientContext: context,
      ruleSOs,
      changesContext: {
        action: RuleChangeTrackingAction.ruleDelete,
        timestamp: REFERENCE_TIMESTAMP_MS,
      },
    });

    expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
    const [changes, opts] = changeTrackingService.logBulk.mock.calls[0];
    expect(changes).toEqual([
      {
        timestamp: REFERENCE_TIMESTAMP_ISO,
        objectId: 'rule-1',
        objectType: RULE_SAVED_OBJECT_TYPE,
        module: 'stack',
        snapshot: expect.objectContaining({ id: 'rule-1', name: 'rule rule-1' }),
      },
      {
        timestamp: REFERENCE_TIMESTAMP_ISO,
        objectId: 'rule-2',
        objectType: RULE_SAVED_OBJECT_TYPE,
        module: 'stack',
        snapshot: expect.objectContaining({ id: 'rule-2', name: 'rule rule-2' }),
      },
    ]);
    expect(opts).toEqual({
      action: RuleChangeTrackingAction.ruleDelete,
      spaceId: 'default',
    });
  });

  it('skips rule change that have an error (e.g. partial bulk failures)', async () => {
    const context = buildContext({ changeTrackingService });
    const ruleSOs = [
      buildRuleSO('rule-1'),
      buildErroredRuleSO('rule-failed'),
      buildRuleSO('rule-3'),
    ];

    await logRuleChanges({
      rulesClientContext: context,
      ruleSOs,
      changesContext: {
        action: RuleChangeTrackingAction.ruleDisable,
        timestamp: REFERENCE_TIMESTAMP_MS,
      },
    });

    expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
    const [changes] = changeTrackingService.logBulk.mock.calls[0];
    expect(changes.map((c) => c.objectId)).toEqual(['rule-1', 'rule-3']);
  });

  it('skips rule types that opt out of change tracking', async () => {
    const context = buildContext(
      { changeTrackingService },
      {
        '123': { solution: 'stack', trackChanges: true },
        '456': { solution: 'security', trackChanges: false },
      }
    );
    const ruleSOs = [buildRuleSO('rule-1', '123'), buildRuleSO('rule-2', '456')];

    await logRuleChanges({
      rulesClientContext: context,
      ruleSOs,
      changesContext: {
        action: RuleChangeTrackingAction.ruleEnable,
        timestamp: REFERENCE_TIMESTAMP_MS,
      },
    });

    expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
    const [changes] = changeTrackingService.logBulk.mock.calls[0];
    expect(changes.map((c) => c.objectId)).toEqual(['rule-1']);
  });

  it('preserves rule type solution per change, supporting mixed solutions in one bulk call', async () => {
    const context = buildContext(
      { changeTrackingService },
      {
        '123': { solution: 'stack', trackChanges: true },
        '456': { solution: 'security', trackChanges: true },
      }
    );
    const ruleSOs = [buildRuleSO('rule-stack', '123'), buildRuleSO('rule-sec', '456')];

    await logRuleChanges({
      rulesClientContext: context,
      ruleSOs,
      changesContext: {
        action: RuleChangeTrackingAction.ruleUpdate,
        timestamp: REFERENCE_TIMESTAMP_MS,
      },
    });

    const [changes] = changeTrackingService.logBulk.mock.calls[0];
    expect(changes).toEqual([
      expect.objectContaining({ objectId: 'rule-stack', module: 'stack' }),
      expect.objectContaining({ objectId: 'rule-sec', module: 'security' }),
    ]);
  });

  it('does not call logBulk when every rule change failed', async () => {
    const context = buildContext({ changeTrackingService });
    const ruleSOs = [buildErroredRuleSO('rule-1'), buildErroredRuleSO('rule-2')];

    await logRuleChanges({
      rulesClientContext: context,
      ruleSOs,
      changesContext: {
        action: RuleChangeTrackingAction.ruleDisable,
        timestamp: REFERENCE_TIMESTAMP_MS,
      },
    });

    expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
  });

  it('does not call logBulk when no rule type opts in to tracking', async () => {
    const context = buildContext(
      { changeTrackingService },
      { '123': { solution: 'stack', trackChanges: false } }
    );
    const ruleSOs = [buildRuleSO('rule-1'), buildRuleSO('rule-2')];

    await logRuleChanges({
      rulesClientContext: context,
      ruleSOs,
      changesContext: {
        action: RuleChangeTrackingAction.ruleDelete,
        timestamp: REFERENCE_TIMESTAMP_MS,
      },
    });

    expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
  });

  it('does not call logBulk when the input is empty', async () => {
    const context = buildContext({ changeTrackingService });

    await logRuleChanges({
      rulesClientContext: context,
      ruleSOs: [],
      changesContext: {
        action: RuleChangeTrackingAction.ruleEnable,
        timestamp: REFERENCE_TIMESTAMP_MS,
      },
    });

    expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
  });

  it('does nothing when the change tracking service is not configured', async () => {
    const context = buildContext({ changeTrackingService: undefined });

    await logRuleChanges({
      rulesClientContext: context,
      ruleSOs: [buildRuleSO('rule-1')],
      changesContext: {
        action: RuleChangeTrackingAction.ruleEnable,
        timestamp: REFERENCE_TIMESTAMP_MS,
      },
    });

    expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
  });

  it('succeeds when a rule saved object omits references (treats them as empty)', async () => {
    const context = buildContext({ changeTrackingService });
    const ruleSOWithoutRefs = buildRuleSO('rule-1');
    delete (ruleSOWithoutRefs as Partial<SavedObject<RawRule>>).references;

    await logRuleChanges({
      rulesClientContext: context,
      ruleSOs: [ruleSOWithoutRefs as SavedObject<RawRule>],
      changesContext: {
        action: RuleChangeTrackingAction.ruleUpdate,
        timestamp: REFERENCE_TIMESTAMP_MS,
      },
    });

    const [changes] = changeTrackingService.logBulk.mock.calls[0];
    expect(changes[0].snapshot).toEqual(expect.objectContaining({ id: 'rule-1', actions: [] }));
  });

  it('swallows registry errors', async () => {
    const ruleTypeRegistry = {
      get: jest.fn().mockImplementation(() => {
        throw new Error('rule type missing');
      }),
      ensureRuleTypeEnabled: jest.fn(),
      has: jest.fn(),
      register: jest.fn(),
      list: jest.fn(),
    } as unknown as RulesClientContext['ruleTypeRegistry'];
    const context = buildContext({ changeTrackingService, ruleTypeRegistry });

    await expect(
      logRuleChanges({
        rulesClientContext: context,
        ruleSOs: [buildRuleSO('rule-1')],
        changesContext: {
          action: RuleChangeTrackingAction.ruleDelete,
          timestamp: REFERENCE_TIMESTAMP_MS,
        },
      })
    ).resolves.toBeUndefined();

    expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
    expect(context.logger.warn).not.toHaveBeenCalled();
  });

  it('swallows changeTrackingService.logBulk errors and warns instead of bubbling them', async () => {
    changeTrackingService.logBulk.mockRejectedValueOnce(new Error('boom'));
    const context = buildContext({ changeTrackingService });

    await expect(
      logRuleChanges({
        rulesClientContext: context,
        ruleSOs: [buildRuleSO('rule-1')],
        changesContext: {
          action: RuleChangeTrackingAction.ruleEnable,
          timestamp: REFERENCE_TIMESTAMP_MS,
        },
      })
    ).resolves.toBeUndefined();

    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `Unable to log bulk rule changes for action "${RuleChangeTrackingAction.ruleEnable}"`
      )
    );
  });

  describe('timestamp', () => {
    it('records the caller-supplied timestamp on every emitted change as ISO-8601', async () => {
      const context = buildContext({ changeTrackingService });
      const ruleSOs = [buildRuleSO('rule-1'), buildRuleSO('rule-2')];

      await logRuleChanges({
        rulesClientContext: context,
        ruleSOs,
        changesContext: {
          action: RuleChangeTrackingAction.ruleUpdate,
          timestamp: REFERENCE_TIMESTAMP_MS,
        },
      });

      const [changes] = changeTrackingService.logBulk.mock.calls[0];
      expect(changes.map((c) => c.timestamp)).toEqual([
        REFERENCE_TIMESTAMP_ISO,
        REFERENCE_TIMESTAMP_ISO,
      ]);
    });

    it.each<{ label: string; input: number | string | Date; expected: string }>([
      {
        label: 'epoch milliseconds (number)',
        input: REFERENCE_TIMESTAMP_MS,
        expected: REFERENCE_TIMESTAMP_ISO,
      },
      {
        label: 'ISO-8601 string',
        input: REFERENCE_TIMESTAMP_ISO,
        expected: REFERENCE_TIMESTAMP_ISO,
      },
      {
        label: 'Date instance',
        input: new Date(REFERENCE_TIMESTAMP_MS),
        expected: REFERENCE_TIMESTAMP_ISO,
      },
    ])('normalizes a $label timestamp to ISO-8601', async ({ input, expected }) => {
      const context = buildContext({ changeTrackingService });

      await logRuleChanges({
        rulesClientContext: context,
        ruleSOs: [buildRuleSO('rule-1')],
        changesContext: {
          action: RuleChangeTrackingAction.ruleUpdate,
          timestamp: input,
        },
      });

      const [changes] = changeTrackingService.logBulk.mock.calls[0];
      expect(changes[0].timestamp).toBe(expected);
    });

    it('uses the same timestamp for every change in a multi-rule call (single operation snapshot)', async () => {
      const context = buildContext({ changeTrackingService });

      await logRuleChanges({
        rulesClientContext: context,
        ruleSOs: [buildRuleSO('rule-1'), buildRuleSO('rule-2'), buildRuleSO('rule-3')],
        changesContext: {
          action: RuleChangeTrackingAction.ruleDelete,
          timestamp: REFERENCE_TIMESTAMP_MS,
        },
      });

      const [changes] = changeTrackingService.logBulk.mock.calls[0];
      const distinctTimestamps = new Set(changes.map((c) => c.timestamp));
      expect(distinctTimestamps).toEqual(new Set([REFERENCE_TIMESTAMP_ISO]));
    });
  });

  describe('metadata', () => {
    it('logs metadata when provided', async () => {
      const context = buildContext({ changeTrackingService });

      await logRuleChanges({
        rulesClientContext: context,
        ruleSOs: [buildRuleSO('rule-1'), buildRuleSO('rule-2')],
        changesContext: {
          action: RuleChangeTrackingAction.ruleDelete,
          timestamp: REFERENCE_TIMESTAMP_MS,
          metadata: { bulkCount: 100 },
        },
      });

      const [, opts] = changeTrackingService.logBulk.mock.calls[0];
      expect(opts.data).toEqual({ metadata: { bulkCount: 100 } });
    });

    it('omits metadata when nothing is provided', async () => {
      const context = buildContext({ changeTrackingService });

      await logRuleChanges({
        rulesClientContext: context,
        ruleSOs: [buildRuleSO('rule-1'), buildRuleSO('rule-2')],
        changesContext: {
          action: RuleChangeTrackingAction.ruleDelete,
          timestamp: REFERENCE_TIMESTAMP_MS,
        },
      });

      const [, opts] = changeTrackingService.logBulk.mock.calls[0];
      expect(opts.data).toBeUndefined();
    });
  });
});

const buildRuleSO = (
  id: string,
  alertTypeId = '123',
  overrides: Partial<SavedObject<RawRule>> = {}
): SavedObject<RawRule> => ({
  id,
  type: RULE_SAVED_OBJECT_TYPE,
  attributes: {
    alertTypeId,
    name: `rule ${id}`,
    createdAt: new Date().toDateString(),
    updatedAt: new Date().toDateString(),
  } as RawRule,
  references: [],
  ...overrides,
});

const buildErroredRuleSO = (id: string): SavedObject<RawRule> => ({
  id,
  type: RULE_SAVED_OBJECT_TYPE,
  attributes: { alertTypeId: '123' } as RawRule,
  references: [],
  error: { error: 'Conflict', message: 'version_conflict_engine_exception', statusCode: 409 },
});

const createMockChangeTrackingService = (): jest.Mocked<IScopedChangeTrackingService> => ({
  log: jest.fn().mockResolvedValue(undefined),
  logBulk: jest.fn().mockResolvedValue(undefined),
  getHistory: jest.fn().mockResolvedValue({ items: [], total: 0 }),
});

interface RuleTypeStub {
  solution: string;
  trackChanges: boolean;
}

const buildContext = (
  overrides: Partial<RulesClientContext> = {},
  ruleTypesByAlertTypeId: Record<string, RuleTypeStub> = {
    '123': { solution: 'stack', trackChanges: true },
  }
): RulesClientContext => {
  const ruleTypeRegistry = {
    get: jest.fn().mockImplementation((alertTypeId: string) => {
      const ruleType = ruleTypesByAlertTypeId[alertTypeId];
      if (!ruleType) {
        throw new Error(`No rule type registered for ${alertTypeId}`);
      }
      return ruleType;
    }),
    ensureRuleTypeEnabled: jest.fn(),
    has: jest.fn(),
    register: jest.fn(),
    list: jest.fn(),
  } as unknown as RulesClientContext['ruleTypeRegistry'];

  return {
    logger: loggingSystemMock.createLogger(),
    spaceId: 'default',
    ruleTypeRegistry,
    isSystemAction: jest.fn().mockReturnValue(false),
    ...overrides,
  } as unknown as RulesClientContext;
};
