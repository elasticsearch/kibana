/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parseThresholdEsql, parseRecoveryBlock, parseDiscoverQueryForBuilder } from './parse_esql';
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

const stripIds = (values: ThresholdFormValues | null) => {
  if (!values) return null;
  return {
    ...values,
    stats: values.stats.map(({ id, ...rest }) => rest),
    evaluations: values.evaluations.map(({ id, ...rest }) => rest),
    alertConditions: values.alertConditions.map(({ id, ...rest }) => rest),
    ...(values.recovery
      ? {
          recovery: {
            ...values.recovery,
            conditions: values.recovery.conditions.map(({ id, ...rest }) => rest),
          },
        }
      : {}),
  };
};

describe('parseThresholdEsql', () => {
  describe('returns null for non-builder queries', () => {
    it('returns null for empty string', () => {
      expect(parseThresholdEsql('')).toBeNull();
    });

    it('returns null for whitespace', () => {
      expect(parseThresholdEsql('   ')).toBeNull();
    });

    it('returns null for invalid ES|QL', () => {
      expect(parseThresholdEsql('NOT VALID ESQL AT ALL')).toBeNull();
    });

    it('returns null for query without STATS', () => {
      expect(parseThresholdEsql('FROM logs-* | WHERE status >= 500')).toBeNull();
    });

    it('returns null for FROM-only query', () => {
      expect(parseThresholdEsql('FROM logs-*')).toBeNull();
    });

    it('returns null for query with LIMIT after STATS', () => {
      expect(parseThresholdEsql('FROM logs-* | STATS count = COUNT(*) | LIMIT 10')).toBeNull();
    });

    it('returns null for query with unsupported aggregation', () => {
      expect(parseThresholdEsql('FROM logs-* | STATS m = MEDIAN(latency)')).toBeNull();
    });

    it('returns null when STATS appears before FROM', () => {
      expect(parseThresholdEsql('STATS c = COUNT(*)')).toBeNull();
    });

    it('returns null for query with SORT after STATS', () => {
      expect(parseThresholdEsql('FROM logs-* | STATS c = COUNT(*) | SORT c DESC')).toBeNull();
    });

    it('returns null for query with KEEP after STATS', () => {
      expect(parseThresholdEsql('FROM logs-* | STATS c = COUNT(*) | KEEP c')).toBeNull();
    });

    it('returns null for query with WHERE between EVALs', () => {
      expect(
        parseThresholdEsql(
          'FROM logs-* | STATS c = COUNT(*) | EVAL a = c * 2 | WHERE a > 5 | EVAL b = a + 1'
        )
      ).toBeNull();
    });

    it('returns null for query with two STATS commands', () => {
      expect(
        parseThresholdEsql('FROM logs-* | STATS c = COUNT(*) BY host.name | STATS total = SUM(c)')
      ).toBeNull();
    });

    it('returns null for query starting with ROW', () => {
      expect(parseThresholdEsql('ROW x = 1')).toBeNull();
    });

    it('returns null for non-numeric threshold in WHERE', () => {
      expect(parseThresholdEsql('FROM logs-* | STATS c = COUNT(*) | WHERE c > "abc"')).toBeNull();
    });

    it('returns null for WHERE with == (not a threshold comparator)', () => {
      expect(parseThresholdEsql('FROM logs-* | STATS c = COUNT(*) | WHERE c == 100')).toBeNull();
    });

    it('returns null for WHERE with LIKE', () => {
      expect(
        parseThresholdEsql('FROM logs-* | STATS c = COUNT(*) | WHERE c LIKE "foo"')
      ).toBeNull();
    });

    it('returns null for query with JOIN', () => {
      expect(
        parseThresholdEsql('FROM logs-* | STATS c = COUNT(*) | LOOKUP users ON user.id')
      ).toBeNull();
    });
  });

  describe('parses minimal queries', () => {
    it('parses FROM + STATS', () => {
      const result = parseThresholdEsql('FROM logs-* | STATS count = COUNT(*)');
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('logs-*');
      expect(result!.stats).toHaveLength(1);
      expect(result!.stats[0].aggregation).toBe(Aggregation.COUNT);
      expect(result!.stats[0].label).toBe('count');
    });

    it('parses FROM + STATS + WHERE condition', () => {
      const result = parseThresholdEsql('FROM logs-* | STATS count = COUNT(*) | WHERE count > 100');
      expect(result).not.toBeNull();
      expect(result!.alertConditions).toHaveLength(1);
      expect(result!.alertConditions[0].metric).toBe('count');
      expect(result!.alertConditions[0].comparator).toBe(Comparator.GT);
      expect(result!.alertConditions[0].threshold).toEqual([100]);
    });
  });

  describe('parses global filter', () => {
    it('extracts WHERE before STATS as filterQuery', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | WHERE service.name == "api" | STATS count = COUNT(*)'
      );
      expect(result).not.toBeNull();
      expect(result!.filterQuery).toBe('service.name == "api"');
    });

    it('extracts compound AND filter', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | WHERE service.name == "api" AND status >= 400 | STATS count = COUNT(*)'
      );
      expect(result).not.toBeNull();
      expect(result!.filterQuery).toContain('service.name == "api"');
      expect(result!.filterQuery).toContain('status >= 400');
    });

    it('extracts OR filter', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | WHERE env == "prod" OR env == "staging" | STATS count = COUNT(*)'
      );
      expect(result).not.toBeNull();
      expect(result!.filterQuery).toContain('env == "prod"');
    });

    it('sets filterQuery to undefined when no global WHERE exists', () => {
      const result = parseThresholdEsql('FROM logs-* | STATS count = COUNT(*)');
      expect(result).not.toBeNull();
      expect(result!.filterQuery).toBeUndefined();
    });
  });

  describe('parses all aggregation types', () => {
    it.each([
      ['AVG', 'latency', Aggregation.AVG],
      ['SUM', 'bytes', Aggregation.SUM],
      ['MIN', 'latency', Aggregation.MIN],
      ['MAX', 'latency', Aggregation.MAX],
      ['COUNT_DISTINCT', 'user.id', Aggregation.CARDINALITY],
    ])('parses %s aggregation', (fnName, field, expectedAgg) => {
      const query = `FROM logs-* | STATS result = ${fnName}(${field})`;
      const result = parseThresholdEsql(query);
      expect(result).not.toBeNull();
      expect(result!.stats[0].aggregation).toBe(expectedAgg);
      expect(result!.stats[0].field).toBe(field);
    });

    it('parses COUNT(*)', () => {
      const result = parseThresholdEsql('FROM logs-* | STATS c = COUNT(*)');
      expect(result).not.toBeNull();
      expect(result!.stats[0].aggregation).toBe(Aggregation.COUNT);
      expect(result!.stats[0].field).toBeUndefined();
    });

    it('parses PERCENTILE with 95', () => {
      const result = parseThresholdEsql('FROM logs-* | STATS p = PERCENTILE(latency, 95)');
      expect(result).not.toBeNull();
      expect(result!.stats[0].aggregation).toBe(Aggregation.P95);
      expect(result!.stats[0].field).toBe('latency');
    });

    it('parses PERCENTILE with 99', () => {
      const result = parseThresholdEsql('FROM logs-* | STATS p = PERCENTILE(latency, 99)');
      expect(result).not.toBeNull();
      expect(result!.stats[0].aggregation).toBe(Aggregation.P99);
    });

    it('rejects unsupported PERCENTILE value', () => {
      expect(parseThresholdEsql('FROM logs-* | STATS p = PERCENTILE(latency, 50)')).toBeNull();
    });

    it('parses aggregation with backtick-quoted field', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS avg_cpu = AVG(`system.cpu.system.pct`)'
      );
      expect(result).not.toBeNull();
      expect(result!.stats[0].aggregation).toBe(Aggregation.AVG);
      expect(result!.stats[0].field).toBe('system.cpu.system.pct');
    });
  });

  describe('parses inline WHERE on STATS', () => {
    it('extracts filter from STATS aggregation', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS errors = COUNT(*) WHERE status >= 500'
      );
      expect(result).not.toBeNull();
      expect(result!.stats[0].filter).toBe('status >= 500');
    });

    it('parses inline WHERE with compound filter', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS errors = COUNT(*) WHERE status >= 500 AND status < 600'
      );
      expect(result).not.toBeNull();
      expect(result!.stats[0].filter).toContain('status >= 500');
      expect(result!.stats[0].filter).toContain('status < 600');
    });

    it('parses inline WHERE with string equality filter', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS errors = COUNT(*) WHERE host.name == "host-1"'
      );
      expect(result).not.toBeNull();
      expect(result!.stats[0].filter).toBe('host.name == "host-1"');
    });

    it('stat without inline WHERE has undefined filter', () => {
      const result = parseThresholdEsql('FROM logs-* | STATS total = COUNT(*)');
      expect(result).not.toBeNull();
      expect(result!.stats[0].filter).toBeUndefined();
    });

    it('mixes stats with and without inline WHERE', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS errors = COUNT(*) WHERE status >= 500, total = COUNT(*)'
      );
      expect(result).not.toBeNull();
      expect(result!.stats[0].filter).toBe('status >= 500');
      expect(result!.stats[1].filter).toBeUndefined();
    });
  });

  describe('parses multiple stats', () => {
    it('parses two stats with group by', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS errors = COUNT(*) WHERE status >= 500, total = COUNT(*) BY host.name'
      );
      expect(result).not.toBeNull();
      expect(result!.stats).toHaveLength(2);
      expect(result!.stats[0].label).toBe('errors');
      expect(result!.stats[1].label).toBe('total');
      expect(result!.groupByFields).toEqual(['host.name']);
    });

    it('parses three stats with different aggregation types', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS c = COUNT(*), avg_lat = AVG(latency), max_lat = MAX(latency)'
      );
      expect(result).not.toBeNull();
      expect(result!.stats).toHaveLength(3);
      expect(result!.stats[0].aggregation).toBe(Aggregation.COUNT);
      expect(result!.stats[1].aggregation).toBe(Aggregation.AVG);
      expect(result!.stats[1].field).toBe('latency');
      expect(result!.stats[2].aggregation).toBe(Aggregation.MAX);
      expect(result!.stats[2].field).toBe('latency');
    });
  });

  describe('parses EVAL commands', () => {
    it('extracts evaluation label and expression', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS errors = COUNT(*) WHERE status >= 500, total = COUNT(*) | EVAL error_rate = errors / total * 100'
      );
      expect(result).not.toBeNull();
      expect(result!.evaluations).toHaveLength(1);
      expect(result!.evaluations[0].label).toBe('error_rate');
      expect(result!.evaluations[0].expression).toContain('errors');
    });

    it('parses multiple EVAL commands in order', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS errors = COUNT(*), total = COUNT(*) | EVAL ratio = errors / total | EVAL pct = ratio * 100'
      );
      expect(result).not.toBeNull();
      expect(result!.evaluations).toHaveLength(2);
      expect(result!.evaluations[0].label).toBe('ratio');
      expect(result!.evaluations[1].label).toBe('pct');
    });

    it('parses EVAL with no subsequent WHERE', () => {
      const result = parseThresholdEsql('FROM logs-* | STATS c = COUNT(*) | EVAL doubled = c * 2');
      expect(result).not.toBeNull();
      expect(result!.evaluations).toHaveLength(1);
      expect(result!.alertConditions[0].metric).toBe('');
    });
  });

  describe('parses all comparator types', () => {
    it.each([
      ['>', Comparator.GT],
      ['>=', Comparator.GTE],
      ['<', Comparator.LT],
      ['<=', Comparator.LTE],
    ])('parses %s comparator', (op, expectedComparator) => {
      const result = parseThresholdEsql(
        `FROM logs-* | STATS count = COUNT(*) | WHERE count ${op} 50`
      );
      expect(result).not.toBeNull();
      expect(result!.alertConditions[0].comparator).toBe(expectedComparator);
      expect(result!.alertConditions[0].threshold).toEqual([50]);
    });
  });

  describe('parses BETWEEN and NOT_BETWEEN', () => {
    it('parses BETWEEN (metric >= t0 AND metric <= t1)', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS count = COUNT(*) | WHERE count >= 10 AND count <= 100'
      );
      expect(result).not.toBeNull();
      expect(result!.alertConditions[0].comparator).toBe(Comparator.BETWEEN);
      expect(result!.alertConditions[0].threshold).toEqual([10, 100]);
    });

    it('parses NOT_BETWEEN (metric < t0 OR metric > t1)', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS count = COUNT(*) | WHERE count < 10 OR count > 100'
      );
      expect(result).not.toBeNull();
      expect(result!.alertConditions[0].comparator).toBe(Comparator.NOT_BETWEEN);
      expect(result!.alertConditions[0].threshold).toEqual([10, 100]);
    });
  });

  describe('parses multiple conditions', () => {
    it('parses AND-joined conditions', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS errors = COUNT(*), latency = AVG(duration) | WHERE errors > 10 AND latency > 500'
      );
      expect(result).not.toBeNull();
      expect(result!.alertConditions).toHaveLength(2);
      expect(result!.conditionOperator).toBe('AND');
    });

    it('parses OR-joined conditions', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS errors = COUNT(*), latency = AVG(duration) | WHERE errors > 10 OR latency > 500'
      );
      expect(result).not.toBeNull();
      expect(result!.alertConditions).toHaveLength(2);
      expect(result!.conditionOperator).toBe('OR');
    });

    it('parses three AND-joined conditions', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS a = COUNT(*), b = AVG(x), c = MAX(y) | WHERE a > 10 AND b > 20 AND c > 30'
      );
      expect(result).not.toBeNull();
      expect(result!.alertConditions).toHaveLength(3);
      expect(result!.conditionOperator).toBe('AND');
      expect(result!.alertConditions[0].threshold).toEqual([10]);
      expect(result!.alertConditions[1].threshold).toEqual([20]);
      expect(result!.alertConditions[2].threshold).toEqual([30]);
    });

    it('preserves metric names across multiple conditions', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS err = COUNT(*), lat = AVG(duration) | WHERE err > 5 AND lat >= 1000'
      );
      expect(result).not.toBeNull();
      expect(result!.alertConditions[0].metric).toBe('err');
      expect(result!.alertConditions[0].comparator).toBe(Comparator.GT);
      expect(result!.alertConditions[1].metric).toBe('lat');
      expect(result!.alertConditions[1].comparator).toBe(Comparator.GTE);
    });
  });

  describe('parses group by fields', () => {
    it('extracts single group by field', () => {
      const result = parseThresholdEsql('FROM logs-* | STATS count = COUNT(*) BY host.name');
      expect(result).not.toBeNull();
      expect(result!.groupByFields).toEqual(['host.name']);
    });

    it('extracts multiple group by fields', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS count = COUNT(*) BY host.name, service.name'
      );
      expect(result).not.toBeNull();
      expect(result!.groupByFields).toEqual(['host.name', 'service.name']);
    });
  });

  describe('parses multiline formatted queries', () => {
    it('handles newlines between pipes', () => {
      const query = [
        'FROM logs-*',
        '  | WHERE service.name == "api"',
        '  | STATS errors = COUNT(*) WHERE status >= 500',
        '  | EVAL doubled = errors * 2',
        '  | WHERE doubled > 10',
      ].join('\n');
      const result = parseThresholdEsql(query);
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('logs-*');
      expect(result!.filterQuery).toBe('service.name == "api"');
      expect(result!.stats[0].label).toBe('errors');
      expect(result!.stats[0].filter).toBe('status >= 500');
      expect(result!.evaluations[0].label).toBe('doubled');
      expect(result!.alertConditions[0].metric).toBe('doubled');
    });
  });

  describe('parses different index patterns', () => {
    it('parses simple index', () => {
      const result = parseThresholdEsql('FROM myindex | STATS c = COUNT(*)');
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('myindex');
    });

    it('parses index pattern with wildcard', () => {
      const result = parseThresholdEsql('FROM metrics-apm.* | STATS c = COUNT(*)');
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('metrics-apm.*');
    });

    it('parses remote cluster index pattern', () => {
      const result = parseThresholdEsql('FROM remote:logs-* | STATS c = COUNT(*)');
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('remote:logs-*');
    });
  });

  describe('always sets timeField to @timestamp', () => {
    it('defaults timeField regardless of query content', () => {
      const result = parseThresholdEsql('FROM logs-* | STATS c = COUNT(*)');
      expect(result).not.toBeNull();
      expect(result!.timeField).toBe('@timestamp');
    });
  });

  describe('default alert conditions when no trailing WHERE', () => {
    it('provides default alert condition with empty metric', () => {
      const result = parseThresholdEsql('FROM logs-* | STATS c = COUNT(*)');
      expect(result).not.toBeNull();
      expect(result!.alertConditions).toHaveLength(1);
      expect(result!.alertConditions[0].metric).toBe('');
      expect(result!.alertConditions[0].comparator).toBe(Comparator.GT);
      expect(result!.alertConditions[0].threshold).toEqual([100]);
    });
  });

  describe('decimal thresholds', () => {
    it('parses decimal threshold values', () => {
      const result = parseThresholdEsql(
        'FROM logs-* | STATS rate = AVG(latency) | WHERE rate > 99.5'
      );
      expect(result).not.toBeNull();
      expect(result!.alertConditions[0].threshold).toEqual([99.5]);
    });
  });

  describe('round-trip: buildThresholdEsql -> parseThresholdEsql', () => {
    const roundTrip = (values: ThresholdFormValues) => {
      const esql = buildThresholdEsql(values);
      const parsed = parseThresholdEsql(esql);
      return { esql, parsed };
    };

    it('round-trips a minimal COUNT query', () => {
      const original = makeValues();
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(stripIds(parsed)).toEqual(stripIds(original));
    });

    it('round-trips with a global filter', () => {
      const original = makeValues({
        filterQuery: 'service.name == "api"',
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.filterQuery).toBe('service.name == "api"');
      expect(parsed!.indexPattern).toBe(original.indexPattern);
    });

    it('round-trips with AVG aggregation and field', () => {
      const original = makeValues({
        stats: [{ id: '1', label: 'avg_latency', aggregation: Aggregation.AVG, field: 'duration' }],
        alertConditions: [
          { id: '1', metric: 'avg_latency', comparator: Comparator.GT, threshold: [500] },
        ],
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(stripIds(parsed)).toEqual(stripIds(original));
    });

    it('round-trips with multiple stats and group by', () => {
      const original = makeValues({
        stats: [
          { id: '1', label: 'errors', aggregation: Aggregation.COUNT, filter: 'status >= 500' },
          { id: '2', label: 'total', aggregation: Aggregation.COUNT },
        ],
        groupByFields: ['host.name'],
        alertConditions: [
          { id: '1', metric: 'errors', comparator: Comparator.GT, threshold: [10] },
        ],
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.stats).toHaveLength(2);
      expect(parsed!.groupByFields).toEqual(['host.name']);
    });

    it('round-trips with EVAL', () => {
      const original = makeValues({
        stats: [
          { id: '1', label: 'errors', aggregation: Aggregation.COUNT, filter: 'status >= 500' },
          { id: '2', label: 'total', aggregation: Aggregation.COUNT },
        ],
        evaluations: [{ id: '1', label: 'error_rate', expression: 'errors / total * 100' }],
        alertConditions: [
          { id: '1', metric: 'error_rate', comparator: Comparator.GT, threshold: [5] },
        ],
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.evaluations).toHaveLength(1);
      expect(parsed!.evaluations[0].label).toBe('error_rate');
    });

    it('round-trips with BETWEEN condition', () => {
      const original = makeValues({
        alertConditions: [
          { id: '1', metric: 'count', comparator: Comparator.BETWEEN, threshold: [10, 100] },
        ],
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.alertConditions[0].comparator).toBe(Comparator.BETWEEN);
      expect(parsed!.alertConditions[0].threshold).toEqual([10, 100]);
    });

    it('round-trips with NOT_BETWEEN condition', () => {
      const original = makeValues({
        alertConditions: [
          { id: '1', metric: 'count', comparator: Comparator.NOT_BETWEEN, threshold: [10, 100] },
        ],
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.alertConditions[0].comparator).toBe(Comparator.NOT_BETWEEN);
      expect(parsed!.alertConditions[0].threshold).toEqual([10, 100]);
    });

    it('round-trips with OR condition operator', () => {
      const original = makeValues({
        stats: [
          { id: '1', label: 'errors', aggregation: Aggregation.COUNT },
          { id: '2', label: 'latency', aggregation: Aggregation.AVG, field: 'duration' },
        ],
        alertConditions: [
          { id: '1', metric: 'errors', comparator: Comparator.GT, threshold: [10] },
          { id: '2', metric: 'latency', comparator: Comparator.GT, threshold: [500] },
        ],
        conditionOperator: 'OR',
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.conditionOperator).toBe('OR');
      expect(parsed!.alertConditions).toHaveLength(2);
    });

    it('round-trips P95 aggregation', () => {
      const original = makeValues({
        stats: [{ id: '1', label: 'p95_latency', aggregation: Aggregation.P95, field: 'duration' }],
        alertConditions: [
          { id: '1', metric: 'p95_latency', comparator: Comparator.GT, threshold: [1000] },
        ],
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.stats[0].aggregation).toBe(Aggregation.P95);
      expect(parsed!.stats[0].field).toBe('duration');
    });

    it('round-trips CARDINALITY aggregation', () => {
      const original = makeValues({
        stats: [
          {
            id: '1',
            label: 'unique_users',
            aggregation: Aggregation.CARDINALITY,
            field: 'user.id',
          },
        ],
        alertConditions: [
          { id: '1', metric: 'unique_users', comparator: Comparator.LT, threshold: [5] },
        ],
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.stats[0].aggregation).toBe(Aggregation.CARDINALITY);
    });

    it('round-trips with inline WHERE filter on stat', () => {
      const original = makeValues({
        stats: [
          {
            id: '1',
            label: 'errors',
            aggregation: Aggregation.COUNT,
            filter: 'status >= 500',
          },
        ],
        alertConditions: [
          { id: '1', metric: 'errors', comparator: Comparator.GT, threshold: [10] },
        ],
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.stats[0].filter).toBe('status >= 500');
    });

    it('round-trips multiple EVALs', () => {
      const original = makeValues({
        stats: [
          { id: '1', label: 'errors', aggregation: Aggregation.COUNT, filter: 'status >= 500' },
          { id: '2', label: 'total', aggregation: Aggregation.COUNT },
        ],
        evaluations: [
          { id: '1', label: 'ratio', expression: 'errors / total' },
          { id: '2', label: 'pct', expression: 'ratio * 100' },
        ],
        alertConditions: [{ id: '1', metric: 'pct', comparator: Comparator.GT, threshold: [5] }],
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.evaluations).toHaveLength(2);
      expect(parsed!.evaluations[0].label).toBe('ratio');
      expect(parsed!.evaluations[1].label).toBe('pct');
    });

    it('round-trips with multiple group by fields', () => {
      const original = makeValues({
        groupByFields: ['host.name', 'service.name'],
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.groupByFields).toEqual(['host.name', 'service.name']);
    });

    it('round-trips with all comparator types', () => {
      for (const comparator of [Comparator.GT, Comparator.GTE, Comparator.LT, Comparator.LTE]) {
        const original = makeValues({
          alertConditions: [{ id: '1', metric: 'count', comparator, threshold: [42] }],
        });
        const { parsed } = roundTrip(original);
        expect(parsed).not.toBeNull();
        expect(parsed!.alertConditions[0].comparator).toBe(comparator);
        expect(parsed!.alertConditions[0].threshold).toEqual([42]);
      }
    });

    it('round-trips a complex real-world query', () => {
      const original = makeValues({
        indexPattern: 'metrics-apm.*',
        filterQuery: 'service.name == "checkout-service"',
        stats: [
          {
            id: '1',
            label: 'errors',
            aggregation: Aggregation.COUNT,
            filter: 'event.outcome == "failure"',
          },
          { id: '2', label: 'total', aggregation: Aggregation.COUNT },
          {
            id: '3',
            label: 'p95_latency',
            aggregation: Aggregation.P95,
            field: 'transaction.duration.us',
          },
        ],
        evaluations: [{ id: '1', label: 'error_rate', expression: 'errors / total * 100' }],
        alertConditions: [
          { id: '1', metric: 'error_rate', comparator: Comparator.GT, threshold: [5] },
          { id: '2', metric: 'p95_latency', comparator: Comparator.GT, threshold: [3000000] },
        ],
        conditionOperator: 'OR',
        groupByFields: ['service.environment'],
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.indexPattern).toBe('metrics-apm.*');
      expect(parsed!.filterQuery).toContain('checkout-service');
      expect(parsed!.stats).toHaveLength(3);
      expect(parsed!.evaluations).toHaveLength(1);
      expect(parsed!.alertConditions).toHaveLength(2);
      expect(parsed!.conditionOperator).toBe('OR');
      expect(parsed!.groupByFields).toEqual(['service.environment']);
    });

    it('round-trips with three AND conditions', () => {
      const original = makeValues({
        stats: [
          { id: '1', label: 'a', aggregation: Aggregation.COUNT },
          { id: '2', label: 'b', aggregation: Aggregation.AVG, field: 'x' },
          { id: '3', label: 'c', aggregation: Aggregation.MAX, field: 'y' },
        ],
        alertConditions: [
          { id: '1', metric: 'a', comparator: Comparator.GT, threshold: [10] },
          { id: '2', metric: 'b', comparator: Comparator.GTE, threshold: [20] },
          { id: '3', metric: 'c', comparator: Comparator.LT, threshold: [30] },
        ],
        conditionOperator: 'AND',
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.alertConditions).toHaveLength(3);
      expect(parsed!.conditionOperator).toBe('AND');
    });

    it('round-trips P99 with filter and group by', () => {
      const original = makeValues({
        stats: [
          {
            id: '1',
            label: 'p99_lat',
            aggregation: Aggregation.P99,
            field: 'duration',
            filter: 'env == "prod"',
          },
        ],
        alertConditions: [
          { id: '1', metric: 'p99_lat', comparator: Comparator.GT, threshold: [5000] },
        ],
        groupByFields: ['region'],
      });
      const { parsed } = roundTrip(original);
      expect(parsed).not.toBeNull();
      expect(parsed!.stats[0].aggregation).toBe(Aggregation.P99);
      expect(parsed!.stats[0].filter).toContain('env');
      expect(parsed!.groupByFields).toEqual(['region']);
    });

    it('round-trips stat labels containing spaces', () => {
      const original = makeValues({
        stats: [{ id: '1', label: 'error count', aggregation: Aggregation.COUNT }],
        alertConditions: [
          { id: '1', metric: 'error count', comparator: Comparator.GT, threshold: [100] },
        ],
      });
      const { esql, parsed } = roundTrip(original);
      expect(esql).toContain('`error count` = COUNT(*)');
      expect(parsed).not.toBeNull();
      expect(parsed!.stats[0].label).toBe('error count');
      expect(parsed!.alertConditions[0].metric).toBe('error count');
    });

    it('round-trips with no alert conditions (STATS only)', () => {
      const original = makeValues({
        alertConditions: [],
      });
      const { esql, parsed } = roundTrip(original);
      expect(esql).not.toContain('WHERE');
      expect(parsed).not.toBeNull();
      expect(parsed!.alertConditions[0].metric).toBe('');
    });
  });
});

describe('parseRecoveryBlock', () => {
  it('returns null for empty string', () => {
    expect(parseRecoveryBlock('')).toBeNull();
  });

  it('parses simple recovery condition', () => {
    const result = parseRecoveryBlock('| WHERE count <= 100');
    expect(result).not.toBeNull();
    expect(result!.conditions).toHaveLength(1);
    expect(result!.conditions[0].metric).toBe('count');
    expect(result!.conditions[0].comparator).toBe(Comparator.LTE);
    expect(result!.conditions[0].threshold).toEqual([100]);
  });

  it('parses multiple conditions with AND', () => {
    const result = parseRecoveryBlock('| WHERE count <= 100 AND errors < 5');
    expect(result).not.toBeNull();
    expect(result!.conditions).toHaveLength(2);
    expect(result!.conditionOperator).toBe('AND');
  });

  it('parses multiple conditions with OR', () => {
    const result = parseRecoveryBlock('| WHERE a < 10 OR b > 20');
    expect(result).not.toBeNull();
    expect(result!.conditions).toHaveLength(2);
    expect(result!.conditionOperator).toBe('OR');
  });

  it('returns null for invalid ES|QL', () => {
    expect(parseRecoveryBlock('| WHERE (((')).toBeNull();
  });
});

describe('recovery round-trip', () => {
  it('round-trips threshold recovery conditions through build and parse', () => {
    const original = makeValues({
      recovery: {
        conditions: [{ id: '1', metric: 'count', comparator: Comparator.LTE, threshold: [100] }],
        conditionOperator: 'AND',
      },
    });

    const block = buildRecoveryBlock(original);
    expect(block).toBeDefined();

    const parsed = parseRecoveryBlock(block!);
    expect(parsed).not.toBeNull();
    expect(parsed!.conditions).toHaveLength(1);
    expect(parsed!.conditions[0].metric).toBe('count');
    expect(parsed!.conditions[0].comparator).toBe(Comparator.LTE);
    expect(parsed!.conditions[0].threshold).toEqual([100]);
  });

  it('round-trips multi-condition recovery through build and parse', () => {
    const original = makeValues({
      recovery: {
        conditions: [
          { id: '1', metric: 'count', comparator: Comparator.LTE, threshold: [100] },
          { id: '2', metric: 'errors', comparator: Comparator.LT, threshold: [5] },
        ],
        conditionOperator: 'AND',
      },
    });

    const block = buildRecoveryBlock(original);
    expect(block).toBeDefined();

    const parsed = parseRecoveryBlock(block!);
    expect(parsed).not.toBeNull();
    expect(parsed!.conditions).toHaveLength(2);
    expect(parsed!.conditionOperator).toBe('AND');
  });

  it('parseThresholdEsql includes recovery from full recovery query', () => {
    const alertQuery = 'FROM logs-*\n  | STATS count = COUNT(*)\n  | WHERE count > 100';
    const recoveryQuery = 'FROM logs-*\n  | STATS count = COUNT(*)\n  | WHERE count <= 50';

    const result = parseThresholdEsql(alertQuery, recoveryQuery);
    expect(result).not.toBeNull();
    expect(result!.recovery).toBeDefined();
    expect(result!.recovery!.conditions).toHaveLength(1);
    expect(result!.recovery!.conditions[0].metric).toBe('count');
    expect(result!.recovery!.conditions[0].comparator).toBe(Comparator.LTE);
    expect(result!.recovery!.conditions[0].threshold).toEqual([50]);
  });

  it('parseThresholdEsql ignores unparseable recovery query', () => {
    const alertQuery = 'FROM logs-*\n  | STATS count = COUNT(*)\n  | WHERE count > 100';
    const recoveryQuery = 'FROM logs-*\n  | STATS count = COUNT(*)\n  | EVAL x = 1';

    const result = parseThresholdEsql(alertQuery, recoveryQuery);
    expect(result).not.toBeNull();
    expect(result!.recovery).toBeUndefined();
  });

  it('parseThresholdEsql has no recovery when no recovery query is provided', () => {
    const alertQuery = 'FROM logs-*\n  | STATS count = COUNT(*)\n  | WHERE count > 100';

    const result = parseThresholdEsql(alertQuery);
    expect(result).not.toBeNull();
    expect(result!.recovery).toBeUndefined();
  });
});

describe('severity round-trip', () => {
  const cpuStat = { id: 's1', label: 'cpu_avg', aggregation: Aggregation.AVG, field: 'system.cpu' };
  const cpuCondition = { id: 'c1', metric: 'cpu_avg', comparator: Comparator.GT, threshold: [0.8] };

  const stripLevelIds = (severity: NonNullable<ThresholdFormValues['severity']>) => ({
    ...severity,
    levels: severity.levels.map(({ id, ...rest }) => rest),
  });

  it('round-trips single severity through build and parse', () => {
    const original = makeValues({
      stats: [cpuStat],
      alertConditions: [cpuCondition],
      severity: { mode: 'single', singleLevelSeverity: 'high', levels: [] },
    });

    const query = buildThresholdEsql(original);
    const parsed = parseThresholdEsql(query);

    expect(parsed).not.toBeNull();
    expect(parsed!.severity).toEqual({ mode: 'single', singleLevelSeverity: 'high', levels: [] });
  });

  it('round-trips multi severity through build and parse (ascending >)', () => {
    const original = makeValues({
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
    });

    const query = buildThresholdEsql(original);
    const parsed = parseThresholdEsql(query);

    expect(parsed).not.toBeNull();
    expect(stripLevelIds(parsed!.severity!)).toEqual({
      mode: 'multi',
      singleLevelSeverity: 'high',
      levels: [
        { severity: 'low', threshold: 0.8 },
        { severity: 'medium', threshold: 0.9 },
        { severity: 'high', threshold: 0.95 },
      ],
    });
    expect(parsed!.alertConditions[0].threshold).toEqual([0.8]);
  });

  it('round-trips multi severity through build and parse (descending <)', () => {
    const original = makeValues({
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
    });

    const query = buildThresholdEsql(original);
    const parsed = parseThresholdEsql(query);

    expect(parsed).not.toBeNull();
    expect(stripLevelIds(parsed!.severity!).levels).toEqual([
      { severity: 'low', threshold: 500 },
      { severity: 'medium', threshold: 300 },
      { severity: 'high', threshold: 100 },
    ]);
  });

  it('has no severity when the query has no severity EVAL', () => {
    const query = buildThresholdEsql(
      makeValues({ stats: [cpuStat], alertConditions: [cpuCondition] })
    );
    const parsed = parseThresholdEsql(query);

    expect(parsed).not.toBeNull();
    expect(parsed!.severity).toBeUndefined();
  });

  it('does not treat a user evaluation named severity-like as severity', () => {
    // A regular EVAL before the WHERE stays an evaluation, not severity config.
    const original = makeValues({
      evaluations: [{ id: 'e1', label: 'error_rate', expression: 'count / 2' }],
      alertConditions: [
        { id: 'c1', metric: 'error_rate', comparator: Comparator.GT, threshold: [5] },
      ],
      severity: { mode: 'single', singleLevelSeverity: 'critical', levels: [] },
    });

    const query = buildThresholdEsql(original);
    const parsed = parseThresholdEsql(query);

    expect(parsed).not.toBeNull();
    expect(parsed!.evaluations).toHaveLength(1);
    expect(parsed!.evaluations[0].label).toBe('error_rate');
    expect(parsed!.severity).toEqual({
      mode: 'single',
      singleLevelSeverity: 'critical',
      levels: [],
    });
  });
});

describe('parseDiscoverQueryForBuilder', () => {
  describe('returns null for unparseable queries', () => {
    it('returns null for empty string', () => {
      expect(parseDiscoverQueryForBuilder('')).toBeNull();
    });

    it('returns null for whitespace', () => {
      expect(parseDiscoverQueryForBuilder('   ')).toBeNull();
    });

    it('returns null for invalid ES|QL', () => {
      expect(parseDiscoverQueryForBuilder('NOT VALID ESQL AT ALL')).toBeNull();
    });

    it('returns null for query not starting with FROM', () => {
      expect(parseDiscoverQueryForBuilder('ROW x = 1')).toBeNull();
    });
  });

  describe('delegates to parseThresholdEsql for complete threshold queries', () => {
    it('returns full builder state for FROM + STATS + WHERE', () => {
      const result = parseDiscoverQueryForBuilder(
        'FROM logs-* | STATS count = COUNT(*) | WHERE count > 100'
      );
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('logs-*');
      expect(result!.stats[0].aggregation).toBe(Aggregation.COUNT);
      expect(result!.alertConditions[0].metric).toBe('count');
      expect(result!.alertConditions[0].comparator).toBe(Comparator.GT);
      expect(result!.alertConditions[0].threshold).toEqual([100]);
    });

    it('returns full builder state with filter and STATS', () => {
      const result = parseDiscoverQueryForBuilder(
        'FROM logs-* | WHERE service.name == "api" | STATS errors = COUNT(*) WHERE status >= 500'
      );
      expect(result).not.toBeNull();
      expect(result!.filterQuery).toBe('service.name == "api"');
      expect(result!.stats[0].label).toBe('errors');
      expect(result!.stats[0].filter).toBe('status >= 500');
    });

    it('reconciles empty alert condition metric to the first stat label for STATS-only queries', () => {
      const result = parseDiscoverQueryForBuilder(
        'FROM logs-* | STATS request_rate = COUNT(*) BY container.id'
      );
      expect(result).not.toBeNull();
      expect(result!.stats[0].label).toBe('request_rate');
      expect(result!.alertConditions[0].metric).toBe('request_rate');
      expect(result!.alertConditions[0].comparator).toBe(Comparator.GT);
      expect(result!.alertConditions[0].threshold).toEqual([100]);
      expect(result!.groupByFields).toEqual(['container.id']);
    });

    it('reconciles across multiple stats — maps empty metric to first stat label', () => {
      const result = parseDiscoverQueryForBuilder(
        'FROM logs-* | STATS errors = COUNT(*) WHERE status >= 500, total = COUNT(*)'
      );
      expect(result).not.toBeNull();
      expect(result!.alertConditions[0].metric).toBe('errors');
    });
  });

  describe('extracts index pattern and filter from Discover queries', () => {
    it('extracts index pattern and filter from FROM + WHERE', () => {
      const result = parseDiscoverQueryForBuilder('FROM logs-* | WHERE status >= 500');
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('logs-*');
      expect(result!.filterQuery).toBe('status >= 500');
      expect(result!.stats).toHaveLength(1);
      expect(result!.stats[0].aggregation).toBe(Aggregation.COUNT);
      expect(result!.alertConditions).toHaveLength(1);
    });

    it('extracts index pattern from FROM-only query', () => {
      const result = parseDiscoverQueryForBuilder('FROM logs-*');
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('logs-*');
      expect(result!.filterQuery).toBeUndefined();
    });

    it('extracts compound WHERE filter', () => {
      const result = parseDiscoverQueryForBuilder(
        'FROM logs-* | WHERE service.name == "api" AND status >= 400'
      );
      expect(result).not.toBeNull();
      expect(result!.filterQuery).toContain('service.name == "api"');
      expect(result!.filterQuery).toContain('status >= 400');
    });

    it('extracts index pattern with wildcard', () => {
      const result = parseDiscoverQueryForBuilder('FROM metrics-apm.* | WHERE env == "prod"');
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('metrics-apm.*');
      expect(result!.filterQuery).toBe('env == "prod"');
    });

    it('extracts index pattern for remote cluster', () => {
      const result = parseDiscoverQueryForBuilder('FROM remote:logs-* | WHERE status >= 500');
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('remote:logs-*');
    });
  });

  describe('handles queries with extra commands after FROM/WHERE', () => {
    it('extracts index and filter when LIMIT follows', () => {
      const result = parseDiscoverQueryForBuilder('FROM logs-* | WHERE status >= 500 | LIMIT 10');
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('logs-*');
      expect(result!.filterQuery).toBe('status >= 500');
    });

    it('extracts index and filter when SORT follows', () => {
      const result = parseDiscoverQueryForBuilder(
        'FROM logs-* | WHERE status >= 500 | SORT @timestamp DESC'
      );
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('logs-*');
      expect(result!.filterQuery).toBe('status >= 500');
    });

    it('extracts index when KEEP follows FROM', () => {
      const result = parseDiscoverQueryForBuilder('FROM logs-* | KEEP status, message');
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('logs-*');
      expect(result!.filterQuery).toBeUndefined();
    });

    it('only extracts first WHERE as filter, ignoring non-WHERE commands', () => {
      const result = parseDiscoverQueryForBuilder(
        'FROM logs-* | WHERE status >= 500 | EVAL doubled = status * 2 | WHERE doubled > 1000'
      );
      expect(result).not.toBeNull();
      expect(result!.indexPattern).toBe('logs-*');
      expect(result!.filterQuery).toBe('status >= 500');
    });
  });

  describe('provides default builder values for non-extracted fields', () => {
    it('provides default stats with COUNT aggregation', () => {
      const result = parseDiscoverQueryForBuilder('FROM logs-* | WHERE status >= 500');
      expect(result).not.toBeNull();
      expect(result!.stats).toHaveLength(1);
      expect(result!.stats[0].aggregation).toBe(Aggregation.COUNT);
      expect(result!.stats[0].label).toBe('count');
    });

    it('provides default alert condition', () => {
      const result = parseDiscoverQueryForBuilder('FROM logs-* | WHERE status >= 500');
      expect(result).not.toBeNull();
      expect(result!.alertConditions).toHaveLength(1);
      expect(result!.alertConditions[0].metric).toBe('count');
      expect(result!.alertConditions[0].comparator).toBe(Comparator.GT);
      expect(result!.alertConditions[0].threshold).toEqual([100]);
    });

    it('defaults timeField to @timestamp', () => {
      const result = parseDiscoverQueryForBuilder('FROM logs-*');
      expect(result).not.toBeNull();
      expect(result!.timeField).toBe('@timestamp');
    });

    it('defaults conditionOperator to AND', () => {
      const result = parseDiscoverQueryForBuilder('FROM logs-*');
      expect(result).not.toBeNull();
      expect(result!.conditionOperator).toBe('AND');
    });

    it('defaults groupByFields to empty array', () => {
      const result = parseDiscoverQueryForBuilder('FROM logs-*');
      expect(result).not.toBeNull();
      expect(result!.groupByFields).toEqual([]);
    });

    it('defaults evaluations to empty array', () => {
      const result = parseDiscoverQueryForBuilder('FROM logs-*');
      expect(result).not.toBeNull();
      expect(result!.evaluations).toEqual([]);
    });
  });

  describe('generates unique IDs', () => {
    it('generates unique IDs for stats and conditions', () => {
      const result = parseDiscoverQueryForBuilder('FROM logs-*');
      expect(result).not.toBeNull();
      expect(result!.stats[0].id).toBeDefined();
      expect(result!.alertConditions[0].id).toBeDefined();
      expect(result!.stats[0].id).not.toBe(result!.alertConditions[0].id);
    });
  });
});
