/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceStart, Logger } from '@kbn/core/server';
import {
  ThreeWayDiffConflict,
  ThreeWayDiffOutcome,
} from '../../../../../../common/api/detection_engine/prebuilt_rules';
import {
  DETECTION_RULE_UPGRADE_EVENT,
  DETECTION_RULE_BULK_UPGRADE_EVENT,
} from '../../../../telemetry/event_based/events';
import type { RuleUpgradeContext } from './update_rule_telemetry';
import {
  sendRuleUpdateTelemetryEvents,
  sendRuleBulkUpgradeTelemetryEvent,
} from './update_rule_telemetry';

const mockAnalytics = (): AnalyticsServiceStart =>
  ({ reportEvent: jest.fn() } as unknown as AnalyticsServiceStart);

const mockLogger = (): Logger =>
  ({
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger);

const createMockRuleUpdateContext = (
  overrides: Partial<RuleUpgradeContext> = {}
): RuleUpgradeContext => ({
  ruleId: 'r1',
  ruleName: 'Rule r1',
  hasBaseVersion: true,
  isCustomized: false,
  fieldsDiff: {
    name: {
      conflict: ThreeWayDiffConflict.SOLVABLE,
      diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
    },
  },
  ...overrides,
});

describe('sendRuleUpdateTelemetryEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('emits SUCCESS with calculated updated fields for processed rule', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    sendRuleUpdateTelemetryEvents(
      analytics,
      new Map([
        [
          'r1',
          createMockRuleUpdateContext({
            ruleId: 'r1',
            ruleName: 'Rule r1',
          }),
        ],
      ]),
      [{ rule_id: 'r1' }],
      [],
      [],
      logger
    );

    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    const [eventType, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];

    expect(eventType).toBe(DETECTION_RULE_UPGRADE_EVENT.eventType);

    expect(payload.ruleId).toBe('r1');
    expect(payload.ruleName).toBe('Rule r1');
    expect(payload.hasBaseVersion).toBe(true);
    expect(payload.finalResult).toBe('SUCCESS');

    expect(payload.updatedFieldsSummary).toEqual({
      count: 1,
      nonSolvableConflictsCount: 0,
      solvableConflictsCount: 1,
      noConflictsCount: 0,
    });
    expect(payload.updatedFieldsTotal).toEqual(['name']);
    expect(payload.updatedFieldsWithSolvableConflicts).toEqual(['name']);
    expect(payload.updatedFieldsWithNonSolvableConflicts).toEqual([]);
    expect(payload.updatedFieldsWithNoConflicts).toEqual([]);
    expect(payload.hasRuleTypeChange).toBe(false);
  });

  describe('hasRuleTypeChange', () => {
    test.each([
      [ThreeWayDiffOutcome.StockValueCanUpdate, true],
      [ThreeWayDiffOutcome.CustomizedValueCanUpdate, true],
      [ThreeWayDiffOutcome.MissingBaseCanUpdate, true],
      [ThreeWayDiffOutcome.CustomizedValueSameUpdate, false],
      [ThreeWayDiffOutcome.StockValueNoUpdate, false],
      [ThreeWayDiffOutcome.CustomizedValueNoUpdate, false],
      [ThreeWayDiffOutcome.MissingBaseNoUpdate, false],
    ])('reports %s as hasRuleTypeChange=%s', (diffOutcome, expected) => {
      const analytics = mockAnalytics();
      const logger = mockLogger();

      sendRuleUpdateTelemetryEvents(
        analytics,
        new Map([
          [
            'r1',
            createMockRuleUpdateContext({
              ruleId: 'r1',
              fieldsDiff: {
                type: {
                  conflict: ThreeWayDiffConflict.SOLVABLE,
                  diff_outcome: diffOutcome,
                },
              },
            }),
          ],
        ]),
        [{ rule_id: 'r1' }],
        [],
        [],
        logger
      );

      const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];
      expect(payload.hasRuleTypeChange).toBe(expected);
    });

    test('reports false when type key is absent from fieldsDiff', () => {
      const analytics = mockAnalytics();
      const logger = mockLogger();

      sendRuleUpdateTelemetryEvents(
        analytics,
        new Map([
          [
            'r1',
            createMockRuleUpdateContext({
              ruleId: 'r1',
              fieldsDiff: {
                name: {
                  conflict: ThreeWayDiffConflict.SOLVABLE,
                  diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
                },
              },
            }),
          ],
        ]),
        [{ rule_id: 'r1' }],
        [],
        [],
        logger
      );

      const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];
      expect(payload.hasRuleTypeChange).toBe(false);
    });

    test('is reported for SUCCESS, ERROR, and SKIP outcomes alike', () => {
      const analytics = mockAnalytics();
      const logger = mockLogger();

      const typeChangedCtx = createMockRuleUpdateContext({
        fieldsDiff: {
          type: {
            conflict: ThreeWayDiffConflict.SOLVABLE,
            diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
          },
        },
      });

      sendRuleUpdateTelemetryEvents(
        analytics,
        new Map([
          ['success1', typeChangedCtx],
          ['error1', typeChangedCtx],
          ['skip1', typeChangedCtx],
        ]),
        [{ rule_id: 'success1' }],
        [{ item: { rule_id: 'error1' } }],
        [{ rule_id: 'skip1' }],
        logger
      );

      expect(analytics.reportEvent).toHaveBeenCalledTimes(3);
      const payloads = (analytics.reportEvent as jest.Mock).mock.calls.map(([, p]) => p);

      for (const payload of payloads) {
        expect(payload.hasRuleTypeChange).toBe(true);
      }
    });
  });

  test('ignores fields that are not updatable outcomes', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    const notUpdatableCtx = createMockRuleUpdateContext({
      fieldsDiff: {
        description: {
          conflict: ThreeWayDiffConflict.NONE,
          diff_outcome: ThreeWayDiffOutcome.StockValueNoUpdate,
        },
        version: {
          conflict: ThreeWayDiffConflict.NONE,
          diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
        },
      },
    });

    sendRuleUpdateTelemetryEvents(
      analytics,
      new Map([['r1', notUpdatableCtx]]),
      [{ rule_id: 'r1' }],
      [],
      [],
      logger
    );

    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];

    expect(payload.updatedFieldsSummary).toEqual({
      count: 0,
      nonSolvableConflictsCount: 0,
      solvableConflictsCount: 0,
      noConflictsCount: 0,
    });
    expect(payload.updatedFieldsTotal).toEqual([]);
    expect(payload.updatedFieldsWithSolvableConflicts).toEqual([]);
    expect(payload.updatedFieldsWithNonSolvableConflicts).toEqual([]);
    expect(payload.updatedFieldsWithNoConflicts).toEqual([]);
  });

  test('emits ERROR for rules present in errors set', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    sendRuleUpdateTelemetryEvents(
      analytics,
      new Map([
        [
          'r1',
          createMockRuleUpdateContext({
            ruleId: 'r1',
            ruleName: 'Rule r1',
          }),
        ],
      ]),
      [],
      [{ item: { rule_id: 'r1' } }],
      [],
      logger
    );

    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];
    expect(payload.finalResult).toBe('ERROR');
    expect(payload.ruleId).toBe('r1');
    expect(payload.ruleName).toBe('Rule r1');
    expect(payload.hasBaseVersion).toBe(true);
    expect(payload.updatedFieldsSummary).toEqual({
      count: 1,
      nonSolvableConflictsCount: 0,
      solvableConflictsCount: 1,
      noConflictsCount: 0,
    });
    expect(payload.updatedFieldsTotal).toEqual(['name']);
    expect(payload.updatedFieldsWithSolvableConflicts).toEqual(['name']);
    expect(payload.updatedFieldsWithNonSolvableConflicts).toEqual([]);
    expect(payload.updatedFieldsWithNoConflicts).toEqual([]);
  });

  test('emits SKIP for rules present in skipped set', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    sendRuleUpdateTelemetryEvents(
      analytics,
      new Map([
        [
          'r1',
          createMockRuleUpdateContext({
            ruleId: 'r1',
            ruleName: 'Rule r1',
          }),
        ],
      ]),
      [],
      [],
      [{ rule_id: 'r1' }],
      logger
    );

    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];
    expect(payload.finalResult).toBe('SKIP');
    expect(payload.ruleId).toBe('r1');
    expect(payload.ruleName).toBe('Rule r1');
    expect(payload.hasBaseVersion).toBe(true);
    expect(payload.updatedFieldsSummary).toEqual({
      count: 1,
      nonSolvableConflictsCount: 0,
      solvableConflictsCount: 1,
      noConflictsCount: 0,
    });
    expect(payload.updatedFieldsTotal).toEqual(['name']);
    expect(payload.updatedFieldsWithSolvableConflicts).toEqual(['name']);
    expect(payload.updatedFieldsWithNonSolvableConflicts).toEqual([]);
    expect(payload.updatedFieldsWithNoConflicts).toEqual([]);
  });

  test('does not emit when there is no matching context for outcome lists', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    sendRuleUpdateTelemetryEvents(
      analytics,
      new Map([
        [
          'r1',
          createMockRuleUpdateContext({
            ruleId: 'r1',
            ruleName: 'Rule r1',
          }),
        ],
      ]),
      [{ rule_id: 'x' }],
      [{ item: { rule_id: 'y' } }],
      [{ rule_id: 'z' }],
      logger
    );

    expect(analytics.reportEvent).not.toHaveBeenCalled();
  });

  test('emits multiple events when multiple outcomes exist', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    const c1 = createMockRuleUpdateContext({ ruleId: 'r1', ruleName: 'Rule r1' });
    const c2 = createMockRuleUpdateContext({
      ruleId: 'r2',
      ruleName: 'Rule r2',
      fieldsDiff: {
        severity: {
          conflict: ThreeWayDiffConflict.NON_SOLVABLE,
          diff_outcome: ThreeWayDiffOutcome.CustomizedValueCanUpdate,
        },
      },
      hasBaseVersion: false,
    });
    const c3 = createMockRuleUpdateContext({
      ruleId: 'r3',
      ruleName: 'Rule r3',
      fieldsDiff: {
        note: {
          conflict: ThreeWayDiffConflict.NONE,
          diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
        },
      },
    });

    const c4 = createMockRuleUpdateContext({
      ruleId: 'r4',
      ruleName: 'Rule r4',
      fieldsDiff: {
        description: {
          conflict: ThreeWayDiffConflict.SOLVABLE,
          diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
        },
      },
    });

    sendRuleUpdateTelemetryEvents(
      analytics,
      new Map([
        ['r1', c1],
        ['r2', c2],
        ['r3', c3],
        ['r4', c4],
      ]),
      [{ rule_id: 'r1' }, { rule_id: 'r3' }],
      [{ item: { rule_id: 'r2' } }],
      [{ rule_id: 'r4' }],
      logger
    );

    expect(analytics.reportEvent).toHaveBeenCalledTimes(4);

    const payloads = (analytics.reportEvent as jest.Mock).mock.calls.map(([, p]) => p);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloadsMap = new Map(payloads.map((payload: any) => [payload.ruleId, payload]));

    expect(payloadsMap.get('r1')!.finalResult).toBe('SUCCESS');
    expect(payloadsMap.get('r1')!.updatedFieldsWithSolvableConflicts).toEqual(['name']);
    expect(payloadsMap.get('r1')!.hasBaseVersion).toBe(true);
    expect(payloadsMap.get('r1')!.updatedFieldsSummary).toEqual({
      count: 1,
      nonSolvableConflictsCount: 0,
      solvableConflictsCount: 1,
      noConflictsCount: 0,
    });

    expect(payloadsMap.get('r2')!.finalResult).toBe('ERROR');
    expect(payloadsMap.get('r2')!.hasBaseVersion).toBe(false);
    expect(payloadsMap.get('r2')!.updatedFieldsWithNonSolvableConflicts).toEqual(['severity']);
    expect(payloadsMap.get('r2')!.updatedFieldsSummary).toEqual({
      count: 1,
      nonSolvableConflictsCount: 1,
      solvableConflictsCount: 0,
      noConflictsCount: 0,
    });

    expect(payloadsMap.get('r3')!.finalResult).toBe('SUCCESS');
    expect(payloadsMap.get('r3')!.hasBaseVersion).toBe(true);
    expect(payloadsMap.get('r3')!.updatedFieldsWithNoConflicts).toEqual(['note']);
    expect(payloadsMap.get('r3')!.updatedFieldsSummary).toEqual({
      count: 1,
      nonSolvableConflictsCount: 0,
      solvableConflictsCount: 0,
      noConflictsCount: 1,
    });

    expect(payloadsMap.get('r4')!.finalResult).toBe('SKIP');
    expect(payloadsMap.get('r4')!.hasBaseVersion).toBe(true);
    expect(payloadsMap.get('r4')!.updatedFieldsWithSolvableConflicts).toEqual(['description']);
    expect(payloadsMap.get('r4')!.updatedFieldsSummary).toEqual({
      count: 1,
      nonSolvableConflictsCount: 0,
      solvableConflictsCount: 1,
      noConflictsCount: 0,
    });
  });
});

describe('sendRuleBulkUpgradeTelemetryEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sends bulk upgrade telemetry with correct structure for successful updates', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    const ruleContextsMap = new Map([
      [
        'r1',
        createMockRuleUpdateContext({
          ruleId: 'r1',
          fieldsDiff: {
            name: {
              conflict: ThreeWayDiffConflict.SOLVABLE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        }),
      ],
      [
        'r2',
        createMockRuleUpdateContext({
          ruleId: 'r2',
          fieldsDiff: {
            description: {
              conflict: ThreeWayDiffConflict.NONE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        }),
      ],
    ]);

    sendRuleBulkUpgradeTelemetryEvent(
      analytics,
      ruleContextsMap,
      [{ rule_id: 'r1' }, { rule_id: 'r2' }],
      [],
      [],
      logger
    );

    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    const [eventType, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];

    expect(eventType).toBe(DETECTION_RULE_BULK_UPGRADE_EVENT.eventType);
    expect(payload).toEqual({
      successfulUpdates: {
        totalNumberOfRules: 2,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 2,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 1,
        numOfNoConflicts: 1,
        numOfRulesWithRuleTypeChange: 0,
      },
      errorUpdates: {
        totalNumberOfRules: 0,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 0,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 0,
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
      skippedUpdates: {
        totalNumberOfRules: 0,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 0,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 0,
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
    });
  });

  test('calculates correct conflict types for each rule based on highest severity', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    const ruleContextsMap = new Map([
      [
        'r1',
        createMockRuleUpdateContext({
          ruleId: 'r1',
          fieldsDiff: {
            name: {
              conflict: ThreeWayDiffConflict.NON_SOLVABLE,
              diff_outcome: ThreeWayDiffOutcome.CustomizedValueCanUpdate,
            },
            description: {
              conflict: ThreeWayDiffConflict.SOLVABLE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        }),
      ],
      [
        'r2',
        createMockRuleUpdateContext({
          ruleId: 'r2',
          fieldsDiff: {
            severity: {
              conflict: ThreeWayDiffConflict.SOLVABLE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
            note: {
              conflict: ThreeWayDiffConflict.NONE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        }),
      ],
      [
        'r3',
        createMockRuleUpdateContext({
          ruleId: 'r3',
          fieldsDiff: {
            tags: {
              conflict: ThreeWayDiffConflict.NONE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        }),
      ],
    ]);

    sendRuleBulkUpgradeTelemetryEvent(
      analytics,
      ruleContextsMap,
      [{ rule_id: 'r1' }, { rule_id: 'r2' }, { rule_id: 'r3' }],
      [],
      [],
      logger
    );

    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];

    // Rule r1 has NON_SOLVABLE conflict (highest priority), so it counts as non-solvable
    // Rule r2 has SOLVABLE conflict (no non-solvable), so it counts as solvable
    // Rule r3 has only NONE conflicts, so it counts as no conflicts
    expect(payload.successfulUpdates).toEqual({
      totalNumberOfRules: 3,
      numOfCustomizedRules: 0,
      numOfNonCustomizedRules: 3,
      numOfNonSolvableConflicts: 1, // r1
      numOfSolvableConflicts: 1, // r2
      numOfNoConflicts: 1, // r3
      numOfRulesWithRuleTypeChange: 0,
    });
  });

  test('handles mixed results correctly (success, error, skip)', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    const ruleContextsMap = new Map([
      [
        'success1',
        createMockRuleUpdateContext({
          ruleId: 'success1',
          fieldsDiff: {
            name: {
              conflict: ThreeWayDiffConflict.SOLVABLE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        }),
      ],
      [
        'error1',
        createMockRuleUpdateContext({
          ruleId: 'error1',
          fieldsDiff: {
            description: {
              conflict: ThreeWayDiffConflict.NON_SOLVABLE,
              diff_outcome: ThreeWayDiffOutcome.CustomizedValueCanUpdate,
            },
          },
        }),
      ],
      [
        'skip1',
        createMockRuleUpdateContext({
          ruleId: 'skip1',
          fieldsDiff: {
            tags: {
              conflict: ThreeWayDiffConflict.NONE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        }),
      ],
    ]);

    sendRuleBulkUpgradeTelemetryEvent(
      analytics,
      ruleContextsMap,
      [{ rule_id: 'success1' }],
      [{ item: { rule_id: 'error1' } }],
      [{ rule_id: 'skip1' }],
      logger
    );

    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];

    expect(payload).toEqual({
      successfulUpdates: {
        totalNumberOfRules: 1,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 1,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 1,
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
      errorUpdates: {
        totalNumberOfRules: 1,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 1,
        numOfNonSolvableConflicts: 1,
        numOfSolvableConflicts: 0,
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
      skippedUpdates: {
        totalNumberOfRules: 1,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 1,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 0,
        numOfNoConflicts: 1,
        numOfRulesWithRuleTypeChange: 0,
      },
    });
  });

  test('handles empty inputs gracefully', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    sendRuleBulkUpgradeTelemetryEvent(analytics, new Map(), [], [], [], logger);

    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    const [eventType, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];

    expect(eventType).toBe(DETECTION_RULE_BULK_UPGRADE_EVENT.eventType);
    expect(payload).toEqual({
      successfulUpdates: {
        totalNumberOfRules: 0,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 0,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 0,
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
      errorUpdates: {
        totalNumberOfRules: 0,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 0,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 0,
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
      skippedUpdates: {
        totalNumberOfRules: 0,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 0,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 0,
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
    });
  });

  test('handles rules not found in context map', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    const ruleContextsMap = new Map([
      [
        'existing-rule',
        createMockRuleUpdateContext({
          ruleId: 'existing-rule',
          fieldsDiff: {
            name: {
              conflict: ThreeWayDiffConflict.SOLVABLE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        }),
      ],
    ]);

    sendRuleBulkUpgradeTelemetryEvent(
      analytics,
      ruleContextsMap,
      [{ rule_id: 'existing-rule' }, { rule_id: 'non-existing-rule' }],
      [{ item: { rule_id: 'non-existing-error' } }],
      [{ rule_id: 'non-existing-skip' }],
      logger
    );

    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];

    // Should count only rules that exist in the context map, non-existing rules are skipped
    expect(payload).toEqual({
      successfulUpdates: {
        totalNumberOfRules: 1, // Only existing-rule is counted
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 1, // Only existing-rule
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 1, // existing-rule has solvable conflict
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
      errorUpdates: {
        totalNumberOfRules: 0, // non-existing-error is skipped
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 0,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 0,
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
      skippedUpdates: {
        totalNumberOfRules: 0, // non-existing-skip is skipped
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 0,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 0,
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
    });

    // Verify warnings are logged for missing rules
    expect(logger.debug).toHaveBeenCalledWith('Rule non-existing-rule not found in context map');
    expect(logger.debug).toHaveBeenCalledWith('Rule non-existing-error not found in context map');
    expect(logger.debug).toHaveBeenCalledWith('Rule non-existing-skip not found in context map');
  });

  test('handles errors gracefully and logs to logger', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    // Mock analytics.reportEvent to throw an error
    (analytics.reportEvent as jest.Mock).mockImplementation(() => {
      throw new Error('Analytics service error');
    });

    const ruleContextsMap = new Map([
      [
        'r1',
        createMockRuleUpdateContext({
          ruleId: 'r1',
        }),
      ],
    ]);

    // Should not throw an error
    expect(() => {
      sendRuleBulkUpgradeTelemetryEvent(
        analytics,
        ruleContextsMap,
        [{ rule_id: 'r1' }],
        [],
        [],
        logger
      );
    }).not.toThrow();

    expect(logger.debug).toHaveBeenCalledWith(
      'Failed to send detection rule bulk upgrade telemetry',
      expect.any(Error)
    );
  });

  test('handles large number of rules across different categories', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    const ruleContextsMap = new Map();
    const successRules = [];
    const errorRules = [];
    const skipRules = [];

    // Create 10 successful rules with different conflict types
    for (let i = 1; i <= 10; i++) {
      const conflictType =
        i <= 3
          ? ThreeWayDiffConflict.NON_SOLVABLE
          : i <= 6
          ? ThreeWayDiffConflict.SOLVABLE
          : ThreeWayDiffConflict.NONE;

      ruleContextsMap.set(
        `success-${i}`,
        createMockRuleUpdateContext({
          ruleId: `success-${i}`,
          fieldsDiff: {
            name: {
              conflict: conflictType,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        })
      );
      successRules.push({ rule_id: `success-${i}` });
    }

    // Create 5 error rules
    for (let i = 1; i <= 5; i++) {
      ruleContextsMap.set(
        `error-${i}`,
        createMockRuleUpdateContext({
          ruleId: `error-${i}`,
          fieldsDiff: {
            description: {
              conflict: ThreeWayDiffConflict.SOLVABLE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        })
      );
      errorRules.push({ item: { rule_id: `error-${i}` } });
    }

    // Create 3 skipped rules
    for (let i = 1; i <= 3; i++) {
      ruleContextsMap.set(
        `skip-${i}`,
        createMockRuleUpdateContext({
          ruleId: `skip-${i}`,
          fieldsDiff: {
            tags: {
              conflict: ThreeWayDiffConflict.NONE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        })
      );
      skipRules.push({ rule_id: `skip-${i}` });
    }

    sendRuleBulkUpgradeTelemetryEvent(
      analytics,
      ruleContextsMap,
      successRules,
      errorRules,
      skipRules,
      logger
    );

    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];

    expect(payload).toEqual({
      successfulUpdates: {
        totalNumberOfRules: 10,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 10,
        numOfNonSolvableConflicts: 3, // Rules 1-3
        numOfSolvableConflicts: 3, // Rules 4-6
        numOfNoConflicts: 4, // Rules 7-10
        numOfRulesWithRuleTypeChange: 0,
      },
      errorUpdates: {
        totalNumberOfRules: 5,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 5,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 5, // All error rules have solvable conflicts
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
      skippedUpdates: {
        totalNumberOfRules: 3,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 3,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 0,
        numOfNoConflicts: 3, // All skip rules have no conflicts
        numOfRulesWithRuleTypeChange: 0,
      },
    });
  });

  test('tracks customized vs non-customized rules correctly', () => {
    const analytics = mockAnalytics();
    const logger = mockLogger();

    const ruleContextsMap = new Map([
      [
        'customized-1',
        createMockRuleUpdateContext({
          ruleId: 'customized-1',
          isCustomized: true,
          fieldsDiff: {
            name: {
              conflict: ThreeWayDiffConflict.SOLVABLE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        }),
      ],
      [
        'customized-2',
        createMockRuleUpdateContext({
          ruleId: 'customized-2',
          isCustomized: true,
          fieldsDiff: {
            description: {
              conflict: ThreeWayDiffConflict.NON_SOLVABLE,
              diff_outcome: ThreeWayDiffOutcome.CustomizedValueCanUpdate,
            },
          },
        }),
      ],
      [
        'non-customized-1',
        createMockRuleUpdateContext({
          ruleId: 'non-customized-1',
          isCustomized: false,
          fieldsDiff: {
            tags: {
              conflict: ThreeWayDiffConflict.NONE,
              diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
            },
          },
        }),
      ],
    ]);

    sendRuleBulkUpgradeTelemetryEvent(
      analytics,
      ruleContextsMap,
      [{ rule_id: 'customized-1' }, { rule_id: 'non-customized-1' }],
      [{ item: { rule_id: 'customized-2' } }],
      [],
      logger
    );

    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];

    expect(payload).toEqual({
      successfulUpdates: {
        totalNumberOfRules: 2,
        numOfCustomizedRules: 1, // customized-1
        numOfNonCustomizedRules: 1, // non-customized-1
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 1, // customized-1
        numOfNoConflicts: 1, // non-customized-1
        numOfRulesWithRuleTypeChange: 0,
      },
      errorUpdates: {
        totalNumberOfRules: 1,
        numOfCustomizedRules: 1, // customized-2
        numOfNonCustomizedRules: 0,
        numOfNonSolvableConflicts: 1, // customized-2
        numOfSolvableConflicts: 0,
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
      skippedUpdates: {
        totalNumberOfRules: 0,
        numOfCustomizedRules: 0,
        numOfNonCustomizedRules: 0,
        numOfNonSolvableConflicts: 0,
        numOfSolvableConflicts: 0,
        numOfNoConflicts: 0,
        numOfRulesWithRuleTypeChange: 0,
      },
    });
  });

  describe('numOfRulesWithRuleTypeChange', () => {
    test('counts rules whose type field can update, ignoring rules without a type change', () => {
      const analytics = mockAnalytics();
      const logger = mockLogger();

      const ruleContextsMap = new Map([
        [
          'r1',
          createMockRuleUpdateContext({
            ruleId: 'r1',
            fieldsDiff: {
              type: {
                conflict: ThreeWayDiffConflict.SOLVABLE,
                diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
              },
            },
          }),
        ],
        [
          'r2',
          createMockRuleUpdateContext({
            ruleId: 'r2',
            fieldsDiff: {
              type: {
                conflict: ThreeWayDiffConflict.NONE,
                diff_outcome: ThreeWayDiffOutcome.StockValueNoUpdate,
              },
            },
          }),
        ],
        [
          'r3',
          createMockRuleUpdateContext({
            ruleId: 'r3',
            fieldsDiff: {
              name: {
                conflict: ThreeWayDiffConflict.NONE,
                diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
              },
            },
          }),
        ],
      ]);

      sendRuleBulkUpgradeTelemetryEvent(
        analytics,
        ruleContextsMap,
        [{ rule_id: 'r1' }, { rule_id: 'r2' }, { rule_id: 'r3' }],
        [],
        [],
        logger
      );

      const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];

      expect(payload.successfulUpdates.totalNumberOfRules).toBe(3);
      expect(payload.successfulUpdates.numOfRulesWithRuleTypeChange).toBe(1);
    });

    test('counts a rule with a non-solvable type change conflict (before the early return)', () => {
      const analytics = mockAnalytics();
      const logger = mockLogger();

      const ruleContextsMap = new Map([
        [
          'r1',
          createMockRuleUpdateContext({
            ruleId: 'r1',
            fieldsDiff: {
              name: {
                conflict: ThreeWayDiffConflict.NON_SOLVABLE,
                diff_outcome: ThreeWayDiffOutcome.CustomizedValueCanUpdate,
              },
              type: {
                conflict: ThreeWayDiffConflict.NON_SOLVABLE,
                diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
              },
            },
          }),
        ],
      ]);

      sendRuleBulkUpgradeTelemetryEvent(
        analytics,
        ruleContextsMap,
        [{ rule_id: 'r1' }],
        [],
        [],
        logger
      );

      const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];

      expect(payload.successfulUpdates.numOfNonSolvableConflicts).toBe(1);
      expect(payload.successfulUpdates.numOfRulesWithRuleTypeChange).toBe(1);
    });

    test('reports 0 on all three summaries for an empty rule-id list', () => {
      const analytics = mockAnalytics();
      const logger = mockLogger();

      sendRuleBulkUpgradeTelemetryEvent(analytics, new Map(), [], [], [], logger);

      const [, payload] = (analytics.reportEvent as jest.Mock).mock.calls[0];

      expect(payload.successfulUpdates.numOfRulesWithRuleTypeChange).toBe(0);
      expect(payload.errorUpdates.numOfRulesWithRuleTypeChange).toBe(0);
      expect(payload.skippedUpdates.numOfRulesWithRuleTypeChange).toBe(0);
    });
  });
});
