/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Parser, BasicPrettyPrinter } from '@elastic/esql';
import { queryHasStatsCommand } from './trendline_query';
import { flattenForkCommands } from './fork';

const flatten = (esqlQuery: string, metricFields?: string[]): string => {
  const { root } = Parser.parse(esqlQuery);
  flattenForkCommands(root.commands, metricFields);
  return BasicPrettyPrinter.print(root);
};

// FORK rewrite shapes are covered by the shared case matrix from
// @kbn/lens-test-helpers (see trendline_query_cases.test.ts); this file keeps
// FORK-aware detection behaviors the matrix does not exercise.
describe('queryHasStatsCommand', () => {
  it('returns true for a top-level STATS command', () => {
    expect(queryHasStatsCommand('FROM index | STATS COUNT(*)')).toBe(true);
  });

  it('returns false when the query has no STATS', () => {
    expect(queryHasStatsCommand('FROM index | KEEP bytes')).toBe(false);
  });

  it('returns true for STATS nested inside a FORK branch', () => {
    expect(
      queryHasStatsCommand('FROM index | FORK (WHERE bytes > 0) (STATS total = SUM(bytes))')
    ).toBe(true);
  });

  it('returns false for FORK without any STATS branch', () => {
    expect(queryHasStatsCommand('FROM index | FORK (WHERE bytes > 0) (LIMIT 5)')).toBe(false);
  });

  it('returns true for STATS nested inside a FORK within a FORK branch', () => {
    expect(
      queryHasStatsCommand(
        'FROM index | FORK (FORK (STATS total = COUNT(*)) (WHERE bytes > 0)) (LIMIT 5)'
      )
    ).toBe(true);
  });
});

describe('flattenForkCommands', () => {
  it('flattens a FORK nested inside a FORK branch', () => {
    expect(
      flatten('FROM index | FORK (FORK (STATS total = COUNT(*)) (WHERE bytes > 0)) (LIMIT 5)', [
        'total',
      ])
    ).toBe('FROM index | STATS total = COUNT(*)');
  });

  describe('_fork discriminator cleanup', () => {
    it('removes a RENAME pair involving _fork and drops the emptied RENAME', () => {
      expect(
        flatten(
          'FROM index | FORK (STATS a = COUNT(*)) (STATS b = COUNT(*)) | RENAME _fork AS branch',
          ['a']
        )
      ).toBe('FROM index | STATS a = COUNT(*)');
    });

    it('keeps unrelated RENAME pairs when removing a _fork pair', () => {
      expect(
        flatten(
          'FROM index | FORK (STATS a = COUNT(*)) (STATS b = COUNT(*)) | RENAME _fork AS branch, a AS total',
          ['a']
        )
      ).toBe('FROM index | STATS a = COUNT(*) | RENAME a AS total');
    });

    it('removes a _fork entry from DROP', () => {
      expect(
        flatten('FROM index | FORK (STATS a = COUNT(*)) (STATS b = COUNT(*)) | DROP _fork, a', [
          'a',
        ])
      ).toBe('FROM index | STATS a = COUNT(*) | DROP a');
    });

    it('keeps the non-_fork conjunct of a compound WHERE', () => {
      expect(
        flatten(
          'FROM index | FORK (STATS a = COUNT(*)) (STATS b = COUNT(*)) | WHERE _fork == "fork1" AND a > 100',
          ['a']
        )
      ).toBe('FROM index | STATS a = COUNT(*) | WHERE a > 100');
    });

    it('keeps all non-_fork conjuncts of a nested AND WHERE', () => {
      expect(
        flatten(
          'FROM index | FORK (STATS a = COUNT(*)) (STATS b = COUNT(*)) | WHERE a > 100 AND _fork == "fork1" AND a < 500',
          ['a']
        )
      ).toBe('FROM index | STATS a = COUNT(*) | WHERE a > 100 AND a < 500');
    });

    it('drops the whole WHERE when _fork appears under OR', () => {
      expect(
        flatten(
          'FROM index | FORK (STATS a = COUNT(*)) (STATS b = COUNT(*)) | WHERE _fork == "fork1" OR a > 100',
          ['a']
        )
      ).toBe('FROM index | STATS a = COUNT(*)');
    });

    it('leaves unknown commands referencing _fork untouched', () => {
      expect(
        flatten('FROM index | FORK (STATS a = COUNT(*)) (STATS b = COUNT(*)) | EVAL x = _fork', [
          'a',
        ])
      ).toBe('FROM index | STATS a = COUNT(*) | EVAL x = _fork');
    });
  });
});
