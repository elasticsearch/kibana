/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildThresholdEsql, buildRecoveryBlock } from './build_esql';
import { Aggregation, Comparator } from './form_types';
import type { ThresholdFormValues } from './form_types';

const makeValues = (overrides: Partial<ThresholdFormValues> = {}): ThresholdFormValues => ({
  indexPattern: 'logs-*',
  timeField: '@timestamp',
  stats: [{ id: '1', label: 'count', aggregation: Aggregation.COUNT }],
  evaluations: [],
  alertConditions: [{ id: '1', metric: 'count', comparator: Comparator.GT, threshold: [100] }],
  conditionOperator: 'AND',
  groupByFields: [],
  ...overrides,
});

describe('buildThresholdEsql', () => {
  describe('returns empty string for invalid input', () => {
    it('returns empty when indexPattern is missing', () => {
      expect(buildThresholdEsql(makeValues({ indexPattern: '' }))).toBe('');
    });

    it('returns empty when no valid stats', () => {
      expect(
        buildThresholdEsql(
          makeValues({
            stats: [{ id: '1', label: '', aggregation: Aggregation.COUNT }],
          })
        )
      ).toBe('');
    });

    it('returns empty when stat requires field but none is provided', () => {
      expect(
        buildThresholdEsql(
          makeValues({
            stats: [{ id: '1', label: 'avg_val', aggregation: Aggregation.AVG }],
          })
        )
      ).toBe('');
    });
  });

  describe('generates correct FROM clause', () => {
    it('includes index pattern', () => {
      const result = buildThresholdEsql(makeValues());
      expect(result).toMatch(/^FROM logs-\*/);
    });
  });

  describe('global filter', () => {
    it('includes WHERE clause for valid filter', () => {
      const result = buildThresholdEsql(makeValues({ filterQuery: 'status >= 500' }));
      expect(result).toContain('| WHERE status >= 500');
    });

    it('skips WHERE clause for invalid filter expression', () => {
      const result = buildThresholdEsql(makeValues({ filterQuery: '(((' }));
      expect(result).not.toContain('WHERE (((');
      expect(result).toMatch(/^FROM/);
    });

    it('skips WHERE clause for empty filter', () => {
      const result = buildThresholdEsql(makeValues({ filterQuery: '   ' }));
      const lines = result.split('\n');
      expect(lines[1]).toMatch(/STATS/);
    });
  });

  describe('STATS generation', () => {
    it('generates COUNT(*)', () => {
      const result = buildThresholdEsql(makeValues());
      expect(result).toContain('count = COUNT(*)');
    });

    it('generates AVG with field', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [{ id: '1', label: 'avg_cpu', aggregation: Aggregation.AVG, field: 'cpu.pct' }],
        })
      );
      expect(result).toContain('avg_cpu = AVG(cpu.pct)');
    });

    it('generates PERCENTILE with 95', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [{ id: '1', label: 'p95_lat', aggregation: Aggregation.P95, field: 'latency' }],
        })
      );
      expect(result).toContain('p95_lat = PERCENTILE(latency, 95)');
    });

    it('generates PERCENTILE with 99', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [{ id: '1', label: 'p99_lat', aggregation: Aggregation.P99, field: 'latency' }],
        })
      );
      expect(result).toContain('p99_lat = PERCENTILE(latency, 99)');
    });

    it('generates COUNT_DISTINCT for cardinality', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [
            { id: '1', label: 'uniq', aggregation: Aggregation.CARDINALITY, field: 'user.id' },
          ],
        })
      );
      expect(result).toContain('uniq = COUNT_DISTINCT(user.id)');
    });

    it('includes inline WHERE filter on stat', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [
            {
              id: '1',
              label: 'errors',
              aggregation: Aggregation.COUNT,
              filter: 'status >= 500',
            },
          ],
        })
      );
      expect(result).toContain('errors = COUNT(*) WHERE status >= 500');
    });

    it('escapes stat labels containing spaces', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [{ id: '1', label: 'error count', aggregation: Aggregation.COUNT }],
          alertConditions: [
            { id: '1', metric: 'error count', comparator: Comparator.GT, threshold: [100] },
          ],
        })
      );
      expect(result).toContain('`error count` = COUNT(*)');
    });

    it('does not escape simple stat labels', () => {
      const result = buildThresholdEsql(makeValues());
      expect(result).toContain('count = COUNT(*)');
      expect(result).not.toContain('`count`');
    });

    it('includes multiple stats', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [
            { id: '1', label: 'errors', aggregation: Aggregation.COUNT, filter: 'status >= 500' },
            { id: '2', label: 'total', aggregation: Aggregation.COUNT },
          ],
          alertConditions: [
            { id: '1', metric: 'errors', comparator: Comparator.GT, threshold: [100] },
          ],
        })
      );
      expect(result).toContain('errors = COUNT(*) WHERE status >= 500');
      expect(result).toContain('total = COUNT(*)');
    });
  });

  describe('field escaping', () => {
    it('escapes field names with special characters', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [{ id: '1', label: 'avg_val', aggregation: Aggregation.AVG, field: 'my-field' }],
        })
      );
      expect(result).toContain('AVG(`my-field`)');
    });

    it('does not escape simple field names', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [{ id: '1', label: 'avg_val', aggregation: Aggregation.AVG, field: 'cpu.pct' }],
        })
      );
      expect(result).toContain('AVG(cpu.pct)');
    });
  });

  describe('group by', () => {
    it('includes BY clause', () => {
      const result = buildThresholdEsql(makeValues({ groupByFields: ['host.name'] }));
      expect(result).toContain('BY host.name');
    });

    it('escapes group-by fields with special characters', () => {
      const result = buildThresholdEsql(makeValues({ groupByFields: ['my-host'] }));
      expect(result).toContain('BY `my-host`');
    });

    it('includes multiple group-by fields', () => {
      const result = buildThresholdEsql(
        makeValues({ groupByFields: ['host.name', 'service.name'] })
      );
      expect(result).toContain('BY host.name, service.name');
    });
  });

  describe('EVAL commands', () => {
    it('generates EVAL with valid expression', () => {
      const result = buildThresholdEsql(
        makeValues({
          evaluations: [{ id: '1', label: 'error_rate', expression: 'errors / total * 100' }],
        })
      );
      expect(result).toContain('| EVAL error_rate = errors / total * 100');
    });

    it('skips EVAL with invalid expression', () => {
      const result = buildThresholdEsql(
        makeValues({
          evaluations: [{ id: '1', label: 'bad', expression: '(((invalid' }],
        })
      );
      expect(result).not.toContain('EVAL');
    });

    it('skips EVAL with empty label or expression', () => {
      const result = buildThresholdEsql(
        makeValues({
          evaluations: [
            { id: '1', label: '', expression: 'x + 1' },
            { id: '2', label: 'valid', expression: '' },
          ],
        })
      );
      expect(result).not.toContain('EVAL');
    });
  });

  describe('alert conditions (WHERE clause)', () => {
    it('generates > condition', () => {
      const result = buildThresholdEsql(makeValues());
      expect(result).toContain('| WHERE count > 100');
    });

    it('generates >= condition', () => {
      const result = buildThresholdEsql(
        makeValues({
          alertConditions: [
            { id: '1', metric: 'count', comparator: Comparator.GTE, threshold: [50] },
          ],
        })
      );
      expect(result).toContain('| WHERE count >= 50');
    });

    it('generates BETWEEN condition', () => {
      const result = buildThresholdEsql(
        makeValues({
          alertConditions: [
            { id: '1', metric: 'val', comparator: Comparator.BETWEEN, threshold: [10, 20] },
          ],
        })
      );
      expect(result).toContain('val >= 10');
      expect(result).toContain('val <= 20');
    });

    it('generates NOT_BETWEEN condition', () => {
      const result = buildThresholdEsql(
        makeValues({
          alertConditions: [
            { id: '1', metric: 'val', comparator: Comparator.NOT_BETWEEN, threshold: [10, 20] },
          ],
        })
      );
      expect(result).toContain('val < 10');
      expect(result).toContain('val > 20');
    });

    it('joins multiple conditions with AND', () => {
      const result = buildThresholdEsql(
        makeValues({
          alertConditions: [
            { id: '1', metric: 'a', comparator: Comparator.GT, threshold: [1] },
            { id: '2', metric: 'b', comparator: Comparator.LT, threshold: [100] },
          ],
          conditionOperator: 'AND',
        })
      );
      expect(result).toMatch(/a > 1\.0 AND b < 100\.0/);
    });

    it('joins multiple conditions with OR', () => {
      const result = buildThresholdEsql(
        makeValues({
          alertConditions: [
            { id: '1', metric: 'a', comparator: Comparator.GT, threshold: [1] },
            { id: '2', metric: 'b', comparator: Comparator.LT, threshold: [100] },
          ],
          conditionOperator: 'OR',
        })
      );
      expect(result).toMatch(/a > 1\.0 OR b < 100\.0/);
    });

    it('omits WHERE when no conditions have metric', () => {
      const result = buildThresholdEsql(
        makeValues({
          alertConditions: [{ id: '1', metric: '', comparator: Comparator.GT, threshold: [100] }],
        })
      );
      expect(result).not.toContain('WHERE');
    });
  });

  describe('multiline formatting', () => {
    it('produces multiline output with pipe indentation', () => {
      const result = buildThresholdEsql(makeValues());
      const lines = result.split('\n');
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[0]).toMatch(/^FROM/);
      expect(lines.some((l) => l.trim().startsWith('|'))).toBe(true);
    });
  });

  describe('severity', () => {
    const cpuStat = {
      id: 's1',
      label: 'cpu_avg',
      aggregation: Aggregation.AVG,
      field: 'system.cpu',
    };
    const cpuCondition = {
      id: 'c1',
      metric: 'cpu_avg',
      comparator: Comparator.GT,
      threshold: [0.8],
    };

    it('emits a constant EVAL for single severity', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [cpuStat],
          alertConditions: [cpuCondition],
          severity: { mode: 'single', singleLevelSeverity: 'high', levels: [] },
        })
      );
      expect(result).toContain('| WHERE cpu_avg > 0.8');
      expect(result).toContain('| EVAL severity = "high"');
    });

    it('emits a CASE evaluated most-to-least severe for multi severity', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [cpuStat],
          alertConditions: [cpuCondition],
          severity: {
            mode: 'multi',
            singleLevelSeverity: 'high',
            levels: [
              { id: 'l1', severity: 'low', threshold: 0.8 },
              { id: 'l2', severity: 'medium', threshold: 0.9 },
              { id: 'l3', severity: 'high', threshold: 0.95 },
            ],
          },
        })
      );
      expect(result).toContain(
        '| EVAL severity = CASE(cpu_avg > 0.95, "high", cpu_avg > 0.9, "medium", "low")'
      );
    });

    it('builds the WHERE from the alert condition, not the severity levels', () => {
      // The lowest severity level is kept in sync with the condition threshold in the
      // form (ADR option 1), so build_esql never rewrites the WHERE from severity. Using
      // an intentionally out-of-sync level here documents that the WHERE follows the
      // condition threshold, not the level threshold.
      const result = buildThresholdEsql(
        makeValues({
          stats: [cpuStat],
          alertConditions: [{ ...cpuCondition, threshold: [0.7] }],
          severity: {
            mode: 'multi',
            singleLevelSeverity: 'high',
            levels: [
              { id: 'l1', severity: 'low', threshold: 0.8 },
              { id: 'l2', severity: 'high', threshold: 0.95 },
            ],
          },
        })
      );
      expect(result).toContain('| WHERE cpu_avg > 0.7');
    });

    it('supports descending thresholds with a < comparator', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [{ id: 's1', label: 'mem_free', aggregation: Aggregation.AVG, field: 'mem' }],
          alertConditions: [
            { id: 'c1', metric: 'mem_free', comparator: Comparator.LT, threshold: [500] },
          ],
          severity: {
            mode: 'multi',
            singleLevelSeverity: 'high',
            levels: [
              { id: 'l1', severity: 'low', threshold: 500 },
              { id: 'l2', severity: 'medium', threshold: 300 },
              { id: 'l3', severity: 'high', threshold: 100 },
            ],
          },
        })
      );
      expect(result).toContain(
        '| EVAL severity = CASE(mem_free < 100, "high", mem_free < 300, "medium", "low")'
      );
      expect(result).toContain('| WHERE mem_free < 500');
    });

    it('omits severity for range comparators in multi mode', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [cpuStat],
          alertConditions: [
            { id: 'c1', metric: 'cpu_avg', comparator: Comparator.BETWEEN, threshold: [0.8, 0.9] },
          ],
          severity: {
            mode: 'multi',
            singleLevelSeverity: 'high',
            levels: [{ id: 'l1', severity: 'low', threshold: 0.8 }],
          },
        })
      );
      expect(result).not.toContain('severity');
    });

    it('omits severity when multiple conditions are configured', () => {
      const result = buildThresholdEsql(
        makeValues({
          stats: [cpuStat, { id: 's2', label: 'mem', aggregation: Aggregation.AVG, field: 'mem' }],
          alertConditions: [
            cpuCondition,
            { id: 'c2', metric: 'mem', comparator: Comparator.GT, threshold: [10] },
          ],
          severity: { mode: 'single', singleLevelSeverity: 'high', levels: [] },
        })
      );
      expect(result).not.toContain('severity');
    });

    it('omits severity when no severity config is present', () => {
      const result = buildThresholdEsql(
        makeValues({ stats: [cpuStat], alertConditions: [cpuCondition] })
      );
      expect(result).not.toContain('severity');
    });
  });
});

describe('buildRecoveryBlock', () => {
  it('returns undefined when no recovery config', () => {
    expect(buildRecoveryBlock(makeValues())).toBeUndefined();
  });

  it('returns undefined when no valid conditions', () => {
    expect(
      buildRecoveryBlock(
        makeValues({
          recovery: {
            conditions: [{ id: '1', metric: '', comparator: Comparator.LTE, threshold: [50] }],
            conditionOperator: 'AND',
          },
        })
      )
    ).toBeUndefined();
  });

  it('generates simple recovery WHERE block', () => {
    const result = buildRecoveryBlock(
      makeValues({
        recovery: {
          conditions: [{ id: '1', metric: 'count', comparator: Comparator.LTE, threshold: [100] }],
          conditionOperator: 'AND',
        },
      })
    );
    expect(result).toContain('WHERE count <= 100');
  });

  it('generates recovery block with multiple conditions joined by AND', () => {
    const result = buildRecoveryBlock(
      makeValues({
        recovery: {
          conditions: [
            { id: '1', metric: 'count', comparator: Comparator.LTE, threshold: [100] },
            { id: '2', metric: 'errors', comparator: Comparator.LT, threshold: [5] },
          ],
          conditionOperator: 'AND',
        },
      })
    );
    expect(result).toMatch(/count <= 100\.0 AND errors < 5\.0/);
  });

  it('generates recovery block with OR operator', () => {
    const result = buildRecoveryBlock(
      makeValues({
        recovery: {
          conditions: [
            { id: '1', metric: 'a', comparator: Comparator.LT, threshold: [10] },
            { id: '2', metric: 'b', comparator: Comparator.GT, threshold: [20] },
          ],
          conditionOperator: 'OR',
        },
      })
    );
    expect(result).toMatch(/a < 10\.0 OR b > 20\.0/);
  });

  it('generates recovery block with BETWEEN condition', () => {
    const result = buildRecoveryBlock(
      makeValues({
        recovery: {
          conditions: [
            { id: '1', metric: 'val', comparator: Comparator.BETWEEN, threshold: [0, 50] },
          ],
          conditionOperator: 'AND',
        },
      })
    );
    expect(result).toContain('val >= 0');
    expect(result).toContain('val <= 50');
  });
});
