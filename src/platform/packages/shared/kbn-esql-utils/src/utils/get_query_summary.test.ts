/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Parser, Walker, isParens, isSubQuery } from '@elastic/esql';
import {
  getQuerySummary,
  getQuerySummaryPerCommandType,
  getSummaryPerCommand,
  isComputedColumn,
} from './get_query_summary';

const countExpressionParens = (node: unknown): number => {
  let count = 0;
  Walker.walk(node as Parameters<typeof Walker.walk>[0], {
    visitAny: (visited) => {
      if (isParens(visited) && !isSubQuery(visited)) {
        count++;
      }
    },
  });
  return count;
};

describe('getQuerySummary', () => {
  it('returns new columns from ROW command', () => {
    const query = 'ROW a = 1, b = 2';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['a', 'b']));
  });

  it('returns new columns from STATS command', () => {
    const query = 'FROM index | STATS avg_price = AVG(price), max_price = MAX(price)';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['avg_price', 'max_price']));
  });

  it('returns renamed columns from RENAME command', () => {
    const query = 'FROM index | RENAME old_name AS new_name';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['new_name']));
    expect(result.renamedColumnsPairs).toEqual(new Set([['new_name', 'old_name']]));
  });

  it('returns columns from multiple commands in a pipeline', () => {
    const query = 'FROM index | EVAL computed = price * 2 | RENAME computed AS total';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['computed', 'total']));
    expect(result.renamedColumnsPairs).toEqual(new Set([['total', 'computed']]));
  });

  it('handles STATS with BY clause correctly', () => {
    const query = 'FROM index | STATS avg = AVG(price) BY category';
    const result = getQuerySummary(query);

    // Only 'avg' is new, 'category' is just a reference
    expect(result.newColumns).toEqual(new Set(['avg']));
  });

  it('handles STATS with assigned BY clause', () => {
    const query = 'FROM index | STATS avg = AVG(price) BY bucket = BUCKET(timestamp, 1h)';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['avg', 'bucket']));
  });

  it('handles STATS with unnamed expression in BY clause', () => {
    const query = 'FROM index | STATS avg = AVG(price) BY BUCKET(timestamp, 1h)';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['avg', 'BUCKET(timestamp, 1h)']));
  });

  it('handles complex query with multiple operations', () => {
    const query = `
      FROM index
      | EVAL price_doubled = price * 2
      | STATS total = SUM(price_doubled) BY category
      | RENAME total AS sum_total
    `;
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['price_doubled', 'total', 'sum_total']));
    expect(result.renamedColumnsPairs).toEqual(new Set([['sum_total', 'total']]));
  });

  it('handles RENAME with = syntax', () => {
    const query = 'FROM index | RENAME new_name = old_name';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['new_name']));
    expect(result.renamedColumnsPairs).toEqual(new Set([['new_name', 'old_name']]));
  });

  it('handles multiple RENAME operations', () => {
    const query = 'FROM index | RENAME col1 AS new1, col2 AS new2';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['new1', 'new2']));
    expect(result.renamedColumnsPairs).toEqual(
      new Set([
        ['new1', 'col1'],
        ['new2', 'col2'],
      ])
    );
  });

  it('returns empty sets for commands without summary', () => {
    const query = 'FROM index | LIMIT 10';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set());
    expect(result.renamedColumnsPairs).toEqual(new Set());
  });

  it('handles STATS with unnamed aggregation', () => {
    const query = 'FROM index | STATS AVG(price)';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['AVG(price)']));
  });

  it('handles EVAL command with assignment', () => {
    const query = 'FROM logs* | EVAL col = ABS(x)';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['col']));
  });

  it('handles EVAL command without assignment', () => {
    const query = 'FROM logs* | EVAL ABS(x)';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['ABS(x)']));
  });

  it('handles parenthesized EVAL expressions without assignment', () => {
    const query = 'FROM logs* | EVAL (ABS(x))';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['ABS(x)']));
  });

  it('handles multiple EVAL commands', () => {
    const query = 'FROM logs* | EVAL col1 = ABS(x), col2 = SQRT(y)';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['col1', 'col2']));
  });

  it('handles DISSECT command creating columns', () => {
    const query = 'FROM logs* | DISSECT agent "%{firstWord}"';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['firstWord']));
  });

  it('handles multiple STATS aggregations', () => {
    const query =
      'FROM logs* | STATS count = count(), avg_price = avg(price), max_date = max(@timestamp) BY category';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['count', 'avg_price', 'max_date']));
  });

  it('handles multiple unnamed STATS aggregations', () => {
    const query = 'FROM logs* | STATS count(), avg(price), max(@timestamp) BY category';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['count()', 'avg(price)', 'max(@timestamp)']));
  });

  it('handles parenthesized STATS aggregations and grouping expressions', () => {
    const query = 'FROM logs* | STATS (avg(price)) BY (category)';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set(['avg(price)']));
    expect(result.aggregates).toEqual(
      new Set([
        expect.objectContaining({
          field: 'avg(price)',
        }),
      ])
    );
    expect(result.grouping).toEqual(
      new Set([
        expect.objectContaining({
          field: 'category',
        }),
      ])
    );
  });

  it('handles WHERE command (no user-defined columns)', () => {
    const query = 'FROM logs* | WHERE x > 0';
    const result = getQuerySummary(query);

    expect(result.newColumns).toEqual(new Set());
  });
});

describe('isComputedColumn', () => {
  it('returns false for original index fields', () => {
    const query = 'FROM index | WHERE price > 100';
    expect(isComputedColumn('price', getQuerySummary(query))).toBe(false);
  });

  it('returns true for fields created with EVAL', () => {
    const query = 'FROM index | EVAL computed = price * 2';
    expect(isComputedColumn('computed', getQuerySummary(query))).toBe(true);
  });

  it('returns true for fields created with STATS', () => {
    const query = 'FROM index | STATS avg_price = AVG(price)';
    expect(isComputedColumn('avg_price', getQuerySummary(query))).toBe(true);
  });

  it('returns true for fields created with RENAME', () => {
    const query = 'FROM index | RENAME old_name AS new_name';
    expect(isComputedColumn('new_name', getQuerySummary(query))).toBe(true);
  });

  it('returns false for fields used in BY clause', () => {
    const query = 'FROM index | STATS avg = AVG(price) BY category';
    expect(isComputedColumn('category', getQuerySummary(query))).toBe(false);
  });

  it('returns true for metadata fields', () => {
    const query = 'FROM index METADATA _id | KEEP _id';
    expect(isComputedColumn('_id', getQuerySummary(query))).toBe(true);
  });
});

describe('getQuerySummaryPerCommandType', () => {
  it('returns array with one summary for a query with one STATS command', () => {
    const query = 'FROM index | STATS avg_price = AVG(price)';
    const result = getQuerySummaryPerCommandType(query, 'stats');

    expect(result).toHaveLength(1);
    expect(result[0].newColumns).toEqual(new Set(['avg_price']));
  });

  it('returns array with multiple summaries for a query with multiple STATS commands', () => {
    const query = `
      FROM index
      | STATS avg_price = AVG(price) BY category
      | STATS total = SUM(avg_price)
    `;
    const result = getQuerySummaryPerCommandType(query, 'stats');

    expect(result).toHaveLength(2);
    expect(result[0].newColumns).toEqual(new Set(['avg_price']));
    expect(result[1].newColumns).toEqual(new Set(['total']));
  });

  it('returns empty array when no commands of the specified type exist', () => {
    const query = 'FROM index | WHERE price > 100 | LIMIT 10';
    const result = getQuerySummaryPerCommandType(query, 'stats');

    expect(result).toHaveLength(0);
  });

  it('returns summaries only for the specified command type', () => {
    const query = 'FROM index | EVAL computed = price * 2 | STATS avg = AVG(computed)';
    const result = getQuerySummaryPerCommandType(query, 'eval');

    expect(result).toHaveLength(1);
    expect(result[0].newColumns).toEqual(new Set(['computed']));
  });

  it('handles parenthesized expressions in the returned command summaries', () => {
    const query = 'FROM logs* | STATS (avg(price)) BY (category)';
    const result = getQuerySummaryPerCommandType(query, 'stats');

    expect(result).toHaveLength(1);
    expect(result[0].newColumns).toEqual(new Set(['avg(price)']));
    expect(result[0].grouping).toEqual(
      new Set([
        expect.objectContaining({
          field: 'category',
        }),
      ])
    );
  });
});

describe('getSummaryPerCommand', () => {
  it('summarizes a single STATS command', () => {
    const query = 'FROM logs* | STATS avg_price = AVG(price) BY category';
    const { root } = Parser.parseQuery(query);
    const statsCommand = root.commands.find((c) => c.name === 'stats')!;

    const result = getSummaryPerCommand(query, statsCommand);

    expect(result.newColumns).toEqual(new Set(['avg_price']));
    expect(result.grouping).toEqual(new Set([expect.objectContaining({ field: 'category' })]));
  });

  it('unwraps grouping parentheses before summarizing', () => {
    const query = 'FROM logs* | STATS (avg(price)) BY (category)';
    const { root } = Parser.parseQuery(query);
    const statsCommand = root.commands.find((c) => c.name === 'stats')!;

    const result = getSummaryPerCommand(query, statsCommand);

    expect(result.newColumns).toEqual(new Set(['avg(price)']));
    expect(result.aggregates).toEqual(new Set([expect.objectContaining({ field: 'avg(price)' })]));
    expect(result.grouping).toEqual(new Set([expect.objectContaining({ field: 'category' })]));
  });

  it('does not mutate the command passed in by the caller', () => {
    const query = 'FROM logs* | STATS (avg(price)) BY (category)';
    const { root } = Parser.parseQuery(query);
    const statsCommand = root.commands.find((c) => c.name === 'stats')!;

    const parensBefore = countExpressionParens(statsCommand);
    expect(parensBefore).toBeGreaterThan(0);

    getSummaryPerCommand(query, statsCommand);

    // The unwrap must happen on an internal clone, leaving the caller's AST intact.
    expect(countExpressionParens(statsCommand)).toBe(parensBefore);
  });
});
