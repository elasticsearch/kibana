/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildSequenceEsql, buildSequenceRecoveryEsql } from './build_esql';
import type { SequenceFormValues } from './form_types';
import { generateStepId } from './form_types';

const makeRule = (
  id: string,
  groupingFields: string[] = [],
  kind: 'alert' | 'signal' = 'alert'
) => ({
  ruleId: id,
  ruleName: `Rule ${id}`,
  groupingFields,
  kind,
});
const makeCorrelatedRule = (id: string, kind: 'alert' | 'signal' = 'alert') =>
  makeRule(id, ['host.name'], kind);
const makeSignalRule = (id: string, groupingFields: string[] = []) =>
  makeRule(id, groupingFields, 'signal');
const makeCorrelatedSignalRule = (id: string) => makeSignalRule(id, ['host.name']);

const twoStepOr = (): SequenceFormValues => ({
  steps: [
    { id: generateStepId(), rules: [makeRule('rule-a')], operator: 'or' },
    { id: generateStepId(), rules: [makeRule('rule-b')], operator: 'or' },
  ],
  hopWindows: [{ value: 5, unit: 'm' }],
  recoveryStepIndices: [1],
});

describe('buildSequenceEsql', () => {
  it('returns empty string when fewer than 2 steps', () => {
    const state: SequenceFormValues = {
      steps: [{ id: 's1', rules: [makeRule('a')], operator: 'or' }],
      hopWindows: [],
      recoveryStepIndices: [0],
    };
    expect(buildSequenceEsql(state)).toBe('');
  });

  it('returns empty string when any step has no rules', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('a')], operator: 'or' },
        { id: 's2', rules: [], operator: 'or' },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    expect(buildSequenceEsql(state)).toBe('');
  });

  it('generates a valid two-step OR query (uncorrelated)', () => {
    const query = buildSequenceEsql(twoStepOr());

    expect(query).toContain('FROM .rule-events');
    expect(query).toContain('type == "alert" AND rule.id IN ("rule-a", "rule-b")');
    expect(query).not.toContain('WHERE type == "alert" AND status == "breached"');

    expect(query).toContain('EVAL sequence_group = "default"');
    expect(query).toContain('BY sequence_group');
    expect(query).not.toContain('BY group_hash');

    expect(query).toContain(
      't_0 = VALUES(CASE(rule.id == "rule-a" AND type == "alert" AND status == "breached", @timestamp, NULL))'
    );
    expect(query).toContain(
      't_1 = VALUES(CASE(rule.id == "rule-b" AND type == "alert" AND status == "breached", @timestamp, NULL))'
    );
    expect(query).toContain(
      'r_1 = MAX(CASE(rule.id == "rule-b" AND status == "recovered", @timestamp, NULL))'
    );
    expect(query).toContain('a_1 = MAX(CASE(rule.id == "rule-b", @timestamp, NULL))');

    expect(query).toContain('MV_EXPAND t_0');
    expect(query).toContain('MV_EXPAND t_1');

    expect(query).toContain('t_0 IS NOT NULL AND t_1 IS NOT NULL');

    expect(query).toContain('t_1 > t_0');
    expect(query).toContain('DATE_DIFF("seconds", t_0, t_1) <= 300');

    expect(query).toContain('WHERE NOT ((r_1 IS NOT NULL AND r_1 == a_1))');

    expect(query).toContain('STATS sequence_match_count = COUNT(*)');
    expect(query).toContain('BY sequence_group');
  });

  it('generates a correlated query when all rules share the same grouping fields', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeCorrelatedRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeCorrelatedRule('rule-b')], operator: 'or' },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceEsql(state);

    expect(query).toContain('BY group_hash');
    expect(query).not.toContain('sequence_group');
    expect(query).toContain('WHERE NOT ((r_1 IS NOT NULL AND r_1 == a_1))');
    expect(query).toContain('STATS sequence_match_count = COUNT(*)');
  });

  it('generates an uncorrelated query when grouping fields differ across rules', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a', ['host.name'])], operator: 'or' },
        { id: 's2', rules: [makeRule('rule-b', ['service.name'])], operator: 'or' },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceEsql(state);

    expect(query).toContain('sequence_group = "default"');
    expect(query).toContain('BY sequence_group');
    expect(query).not.toContain('BY group_hash');
  });

  it('generates an uncorrelated query when some rules have no grouping fields', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeCorrelatedRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeRule('rule-b')], operator: 'or' },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceEsql(state);

    expect(query).toContain('sequence_group = "default"');
    expect(query).not.toContain('BY group_hash');
  });

  it('generates an OR step with multiple rule IDs merged into one CASE', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a'), makeRule('rule-b')], operator: 'or' },
        { id: 's2', rules: [makeRule('rule-c')], operator: 'or' },
      ],
      hopWindows: [{ value: 10, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceEsql(state);

    expect(query).toContain('rule.id == "rule-a" AND type == "alert"');
    expect(query).toContain('rule.id == "rule-b" AND type == "alert"');
    expect(query).toContain(
      't_1 = VALUES(CASE(rule.id == "rule-c" AND type == "alert" AND status == "breached", @timestamp, NULL))'
    );
  });

  it('generates an AND step with separate columns and GREATEST', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a')], operator: 'or' },
        {
          id: 's2',
          rules: [makeRule('rule-b'), makeRule('rule-c')],
          operator: 'and',
        },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceEsql(state);

    expect(query).toContain(
      't_1_0 = VALUES(CASE(rule.id == "rule-b" AND type == "alert" AND status == "breached", @timestamp, NULL))'
    );
    expect(query).toContain(
      't_1_1 = VALUES(CASE(rule.id == "rule-c" AND type == "alert" AND status == "breached", @timestamp, NULL))'
    );
    expect(query).toContain('MV_EXPAND t_1_0');
    expect(query).toContain('MV_EXPAND t_1_1');
    expect(query).toContain('t_1_0 IS NOT NULL AND t_1_1 IS NOT NULL');
    expect(query).toContain('t_1_eff = GREATEST(t_1_0, t_1_1)');
    expect(query).toContain('t_1_eff > t_0');
    expect(query).toContain('DATE_DIFF("seconds", t_0, t_1_eff) <= 300');

    expect(query).toContain('r_1_0 = MAX(CASE(rule.id == "rule-b" AND status == "recovered"');
    expect(query).toContain('a_1_0 = MAX(CASE(rule.id == "rule-b"');
    expect(query).toContain('r_1_1 = MAX(CASE(rule.id == "rule-c" AND status == "recovered"');
    expect(query).toContain('a_1_1 = MAX(CASE(rule.id == "rule-c"');
    expect(query).toContain(
      '(r_1_0 IS NOT NULL AND r_1_0 == a_1_0) OR (r_1_1 IS NOT NULL AND r_1_1 == a_1_1)'
    );
  });

  it('uses all rule IDs in recovery tracking columns for an OR step', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeRule('rule-b'), makeRule('rule-c')], operator: 'or' },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceEsql(state);

    expect(query).toContain(
      'r_1 = MAX(CASE(rule.id IN ("rule-b", "rule-c") AND status == "recovered", @timestamp, NULL))'
    );
    expect(query).toContain('a_1 = MAX(CASE(rule.id IN ("rule-b", "rule-c"), @timestamp, NULL))');
    expect(query).toContain('WHERE NOT ((r_1 IS NOT NULL AND r_1 == a_1))');
  });

  it('deduplicates rule IDs in the IN(...) pre-filter', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeRule('rule-a'), makeRule('rule-b')], operator: 'or' },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceEsql(state);
    const inMatch = query.match(/rule\.id IN \(([^)]+)\)/);
    expect(inMatch).not.toBeNull();
    const ids = inMatch![1].split(',').map((s) => s.trim());
    expect(ids.filter((id) => id === '"rule-a"').length).toBe(1);
  });

  it('applies per-hop DATE_DIFF checks for a three-step sequence', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('a')], operator: 'or' },
        { id: 's2', rules: [makeRule('b')], operator: 'or' },
        { id: 's3', rules: [makeRule('c')], operator: 'or' },
      ],
      hopWindows: [
        { value: 5, unit: 'm' },
        { value: 10, unit: 'm' },
      ],
      recoveryStepIndices: [2],
    };
    const query = buildSequenceEsql(state);

    expect(query).toContain('DATE_DIFF("seconds", t_0, t_1) <= 300');
    expect(query).toContain('DATE_DIFF("seconds", t_1, t_2) <= 600');
    expect(query).toContain('MIN(t_2)');
  });

  it('escapes special characters in rule IDs', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-with-"quotes"')], operator: 'or' },
        { id: 's2', rules: [makeRule('rule-b')], operator: 'or' },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceEsql(state);

    expect(query).toContain('rule.id == "rule-with-\\"quotes\\""');
  });
});

describe('buildSequenceRecoveryEsql', () => {
  it('returns empty string when fewer than 2 steps', () => {
    const state: SequenceFormValues = {
      steps: [{ id: 's1', rules: [makeRule('a')], operator: 'or' }],
      hopWindows: [],
      recoveryStepIndices: [0],
    };
    expect(buildSequenceRecoveryEsql(state)).toBe('');
  });

  it('generates an uncorrelated recovery query: latest event for tracked rule is "recovered"', () => {
    const query = buildSequenceRecoveryEsql(twoStepOr());

    expect(query).toContain('FROM .rule-events');
    expect(query).toContain('type == "alert"');
    expect(query).toContain('rule.id == "rule-b"');
    expect(query).toContain('SORT @timestamp DESC');
    expect(query).toContain('LIMIT 1');
    expect(query).toContain('sequence_group = "default"');
    expect(query).toContain('WHERE status == "recovered"');
    expect(query).not.toContain('MV_EXPAND');
    expect(query).not.toContain('VALUES(CASE');
  });

  it('tracks a non-last step when recoveryStepIndices targets step 0', () => {
    const state: SequenceFormValues = {
      ...twoStepOr(),
      recoveryStepIndices: [0],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain('rule.id == "rule-a"');
    expect(query).not.toContain('rule-b');
  });

  it('uses simple format for single-step recovery targeting step 0', () => {
    const state: SequenceFormValues = {
      ...twoStepOr(),
      recoveryStepIndices: [0],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain('rule.id == "rule-a"');
    expect(query).toContain('SORT @timestamp DESC');
    expect(query).toContain('LIMIT 1');
    expect(query).toContain('WHERE status == "recovered"');
  });

  it('uses simple format for single-step recovery targeting last step', () => {
    const state: SequenceFormValues = {
      ...twoStepOr(),
      recoveryStepIndices: [1],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain('rule.id == "rule-b"');
    expect(query).toContain('SORT @timestamp DESC');
    expect(query).toContain('LIMIT 1');
    expect(query).toContain('WHERE status == "recovered"');
  });

  it('checks all rules in AND tracking step (any-rule-recovers)', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeRule('rule-b'), makeRule('rule-c')], operator: 'and' },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain('rule.id IN ("rule-b", "rule-c")');
    expect(query).toContain('r_1_0 = MAX(CASE(rule.id == "rule-b" AND status == "recovered"');
    expect(query).toContain('a_1_0 = MAX(CASE(rule.id == "rule-b"');
    expect(query).toContain('r_1_1 = MAX(CASE(rule.id == "rule-c" AND status == "recovered"');
    expect(query).toContain('a_1_1 = MAX(CASE(rule.id == "rule-c"');
    expect(query).toContain(
      '(r_1_0 IS NOT NULL AND r_1_0 == a_1_0) OR (r_1_1 IS NOT NULL AND r_1_1 == a_1_1)'
    );
  });

  it('watches all rules in an OR recovery step (uncorrelated last-step mode)', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeRule('rule-b'), makeRule('rule-c')], operator: 'or' },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain('rule.id IN ("rule-b", "rule-c")');
    expect(query).toContain('SORT @timestamp DESC');
    expect(query).toContain('LIMIT 1');
    expect(query).toContain('WHERE status == "recovered"');
  });

  it('watches all rules in an OR recovery step (custom multi-step mode)', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a'), makeRule('rule-d')], operator: 'or' },
        { id: 's2', rules: [makeRule('rule-b'), makeRule('rule-c')], operator: 'or' },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [0, 1],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain(
      'r_0 = MAX(CASE(rule.id IN ("rule-a", "rule-d") AND status == "recovered"'
    );
    expect(query).toContain('a_0 = MAX(CASE(rule.id IN ("rule-a", "rule-d")');
    expect(query).toContain(
      'r_1 = MAX(CASE(rule.id IN ("rule-b", "rule-c") AND status == "recovered"'
    );
    expect(query).toContain('a_1 = MAX(CASE(rule.id IN ("rule-b", "rule-c")');
    expect(query).toContain('rule.id IN ("rule-a", "rule-d", "rule-b", "rule-c")');
  });

  it('generates a correlated recovery query using MAX(CASE) per group_hash', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeCorrelatedRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeCorrelatedRule('rule-b')], operator: 'or' },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain('BY group_hash');
    expect(query).toContain('MAX(CASE(status == "recovered"');
    expect(query).toContain('latest_recovered == latest_any');
    expect(query).not.toContain('SORT');
    expect(query).not.toContain('LIMIT');
    expect(query).not.toContain('sequence_group');
  });
});

describe('buildSequenceEsql — signal rules', () => {
  it('uses type IN ("alert", "signal") when signal rules are present', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeSignalRule('signal-b')], operator: 'or' },
      ],
      hopWindows: [{ value: 15, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceEsql(state);

    expect(query).toContain('type IN ("alert", "signal")');
    expect(query).not.toContain('WHERE type == "alert"');
  });

  it('keeps type == "alert" when no signal rules are present', () => {
    const query = buildSequenceEsql(twoStepOr());
    expect(query).toContain('type == "alert"');
    expect(query).not.toContain('type IN');
  });

  it('omits r_{N} recovery marker when signal rule is a recovery tracking step', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeSignalRule('signal-b')], operator: 'or' },
      ],
      hopWindows: [{ value: 15, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceEsql(state);

    expect(query).not.toContain('r_1 = MAX');
    expect(query).toContain('a_1 = MAX(CASE(rule.id == "signal-b", @timestamp, NULL))');
  });

  it('uses staleness-based mutual exclusivity predicate when signal rule is a recovery tracking step', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeSignalRule('signal-b')], operator: 'or' },
      ],
      hopWindows: [{ value: 15, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceEsql(state);

    expect(query).toContain('WHERE NOT ((a_1 IS NULL OR DATE_DIFF("seconds", a_1, NOW()) > 900))');
    expect(query).not.toContain('r_1 IS NOT NULL AND r_1 == a_1');
  });

  it('handles signal rule in an OR step (breach timestamps still use status == "breached")', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a'), makeSignalRule('signal-b')], operator: 'or' },
        { id: 's2', rules: [makeRule('rule-c')], operator: 'or' },
      ],
      hopWindows: [{ value: 5, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceEsql(state);

    expect(query).toContain('rule.id == "rule-a" AND type == "alert"');
    expect(query).toContain('rule.id == "signal-b" AND type == "signal"');
    expect(query).toContain('AND status == "breached"');
    expect(query).toContain('type IN ("alert", "signal")');
  });
});

describe('buildSequenceRecoveryEsql — signal rules', () => {
  it('generates staleness-based uncorrelated recovery when signal rule is a recovery tracking step', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeSignalRule('signal-b')], operator: 'or' },
      ],
      hopWindows: [{ value: 15, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain('FROM .rule-events');
    expect(query).toContain('type == "signal"');
    expect(query).toContain('rule.id == "signal-b"');
    expect(query).toContain(
      'STATS latest_breach = MAX(CASE(status == "breached", @timestamp, NULL))'
    );
    expect(query).toContain('sequence_group = "default"');
    expect(query).toContain(
      'WHERE latest_breach IS NULL OR DATE_DIFF("seconds", latest_breach, NOW()) > 900'
    );
    expect(query).not.toContain('status == "recovered"');
    expect(query).not.toContain('SORT');
    expect(query).not.toContain('LIMIT');
  });

  it('generates staleness-based correlated recovery when signal rule is a recovery tracking step', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeCorrelatedRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeCorrelatedSignalRule('signal-b')], operator: 'or' },
      ],
      hopWindows: [{ value: 15, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain('BY group_hash');
    expect(query).toContain(
      'STATS latest_breach = MAX(CASE(status == "breached", @timestamp, NULL))'
    );
    expect(query).toContain('DATE_DIFF("seconds", latest_breach, NOW()) > 900');
    expect(query).not.toContain('sequence_group');
    expect(query).not.toContain('status == "recovered"');
    expect(query).not.toContain('IS NULL');
  });

  it('uses the preceding hop window as the staleness threshold', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('a')], operator: 'or' },
        { id: 's2', rules: [makeRule('b')], operator: 'or' },
        { id: 's3', rules: [makeSignalRule('signal-c')], operator: 'or' },
      ],
      hopWindows: [
        { value: 5, unit: 'm' },
        { value: 1, unit: 'h' },
      ],
      recoveryStepIndices: [2],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain('DATE_DIFF("seconds", latest_breach, NOW()) > 3600');
  });

  it('uses first hop window for step 0 tracking (no preceding hop)', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeSignalRule('signal-a')], operator: 'or' },
        { id: 's2', rules: [makeRule('rule-b')], operator: 'or' },
      ],
      hopWindows: [{ value: 10, unit: 'm' }],
      recoveryStepIndices: [0],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain('DATE_DIFF("seconds", latest_breach, NOW()) > 600');
    expect(query).toContain('rule.id == "signal-a"');
  });

  it('handles mixed alert+signal multi-tracking steps', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a')], operator: 'or' },
        { id: 's2', rules: [makeSignalRule('signal-b')], operator: 'or' },
      ],
      hopWindows: [{ value: 15, unit: 'm' }],
      recoveryStepIndices: [0, 1],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain('type IN ("alert", "signal")');
    expect(query).toContain('r_0 = MAX(CASE(rule.id == "rule-a" AND status == "recovered"');
    expect(query).toContain('a_0 = MAX(CASE(rule.id == "rule-a"');
    expect(query).not.toContain('r_1 =');
    expect(query).toContain('a_1 = MAX(CASE(rule.id == "signal-b"');
    expect(query).toContain('r_0 IS NOT NULL AND r_0 == a_0');
    expect(query).toContain('DATE_DIFF("seconds", a_1, NOW()) > 900');
  });

  it('still works for alert-only tracking steps (no regression)', () => {
    const query = buildSequenceRecoveryEsql(twoStepOr());

    expect(query).toContain('type == "alert"');
    expect(query).toContain('SORT @timestamp DESC');
    expect(query).toContain('WHERE status == "recovered"');
    expect(query).not.toContain('DATE_DIFF');
    expect(query).not.toContain('latest_breach');
  });

  it('AND tracking step with mixed alert+signal uses any-rule-recovers with OR', () => {
    const state: SequenceFormValues = {
      steps: [
        { id: 's1', rules: [makeRule('rule-a')], operator: 'or' },
        {
          id: 's2',
          rules: [makeRule('rule-b'), makeSignalRule('signal-c')],
          operator: 'and',
        },
      ],
      hopWindows: [{ value: 10, unit: 'm' }],
      recoveryStepIndices: [1],
    };
    const query = buildSequenceRecoveryEsql(state);

    expect(query).toContain('r_1_0 = MAX(CASE(rule.id == "rule-b" AND status == "recovered"');
    expect(query).toContain('a_1_0 = MAX(CASE(rule.id == "rule-b"');
    expect(query).not.toContain('r_1_1');
    expect(query).toContain('a_1_1 = MAX(CASE(rule.id == "signal-c"');
    expect(query).toContain('(r_1_0 IS NOT NULL AND r_1_0 == a_1_0)');
    expect(query).toContain('DATE_DIFF("seconds", a_1_1, NOW()) > 600');
    expect(query).toContain('type IN ("alert", "signal")');
  });
});
