/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import {
  hasChangePointCommand,
  getChangePointOutputColumnNames,
  getChangePointSeriesColumns,
  getChangePointEntityColumns,
  buildChangePointLineDataQuery,
  appendEntityFiltersToChangePointLineEsql,
  formatEsqlIdentifier,
  formatEsqlLiteral,
} from './change_point_helpers';

describe('hasChangePointCommand', () => {
  it('should return false for undefined or empty esql', () => {
    expect(hasChangePointCommand(undefined)).toBe(false);
    expect(hasChangePointCommand('')).toBe(false);
  });

  it('should return false when query has no CHANGE_POINT command', () => {
    expect(hasChangePointCommand('FROM index | STATS count = COUNT(*)')).toBe(false);
    expect(hasChangePointCommand('FROM index | WHERE field > 0')).toBe(false);
  });

  it('should return true when query contains CHANGE_POINT command', () => {
    expect(hasChangePointCommand('FROM a | CHANGE_POINT value')).toBe(true);
    expect(hasChangePointCommand('FROM a | CHANGE_POINT value ON key')).toBe(true);
    expect(
      hasChangePointCommand(
        'FROM a | STATS count = COUNT(*) BY bucket | CHANGE_POINT count ON bucket'
      )
    ).toBe(true);
  });

  it('should return false when CHANGE_POINT only appears inside FORK branches', () => {
    const forkQuery = `FROM gallery-*
| FORK
  ( WHERE referer == "http://domainsigma.com" | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day) | SORT bucket | CHANGE_POINT avg_bytes ON bucket )
  ( WHERE referer == "https://www.google.com/" | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day) | SORT bucket | CHANGE_POINT avg_bytes ON bucket )
| WHERE type IS NOT NULL
| KEEP provider, bucket, avg_bytes, type, pvalue`;
    expect(hasChangePointCommand(forkQuery)).toBe(false);
  });

  it('should return true when CHANGE_POINT is a top-level command after FORK', () => {
    const mixedQuery = `FROM gallery-*
| FORK
  ( WHERE referer == "http://domainsigma.com" | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day) | SORT bucket )
| CHANGE_POINT avg_bytes ON bucket`;
    expect(hasChangePointCommand(mixedQuery)).toBe(true);
  });
});

describe('getChangePointOutputColumnNames', () => {
  it('should return undefined for undefined or when no CHANGE_POINT command', () => {
    expect(getChangePointOutputColumnNames(undefined)).toBeUndefined();
    expect(getChangePointOutputColumnNames('FROM index')).toBeUndefined();
  });

  it('should return default type and pvalue column names when AS is not used', () => {
    const result = getChangePointOutputColumnNames('FROM a | CHANGE_POINT value');
    expect(result).toEqual({ typeColumn: 'type', pvalueColumn: 'pvalue' });
  });

  it('should return custom column names when AS type_name, pvalue_name is used', () => {
    const result = getChangePointOutputColumnNames(
      'FROM a | CHANGE_POINT value AS change_type, p_value'
    );
    expect(result?.typeColumn).toBe('change_type');
    expect(result?.pvalueColumn).toBe('p_value');
  });
});

describe('getChangePointSeriesColumns', () => {
  it('returns value and time columns for a simple pipeline', () => {
    expect(
      getChangePointSeriesColumns('FROM a | STATS c = COUNT(*) BY b | CHANGE_POINT c ON b AS t, pv')
    ).toEqual({ valueColumn: 'c', timeColumn: 'b' });
  });

  it('defaults time column to @timestamp when ON is omitted', () => {
    expect(getChangePointSeriesColumns('FROM a | CHANGE_POINT value')).toEqual({
      valueColumn: 'value',
      timeColumn: '@timestamp',
    });
  });

  it('returns undefined when CHANGE_POINT only appears inside FORK branches', () => {
    const forkQuery = `FROM gallery-*
| FORK
  ( WHERE referer == "http://a.com" | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day) | CHANGE_POINT avg_bytes ON bucket )
| WHERE type IS NOT NULL`;
    expect(getChangePointSeriesColumns(forkQuery)).toBeUndefined();
  });
});

describe('getChangePointEntityColumns', () => {
  it('returns empty array when esql is undefined or empty', () => {
    expect(getChangePointEntityColumns(undefined)).toEqual([]);
    expect(getChangePointEntityColumns('')).toEqual([]);
  });

  it('returns empty array when there is no CHANGE_POINT command', () => {
    expect(getChangePointEntityColumns('FROM index | STATS count = COUNT(*)')).toEqual([]);
  });

  it('returns empty array when CHANGE_POINT has no BY clause', () => {
    expect(getChangePointEntityColumns('FROM a | CHANGE_POINT value ON time')).toEqual([]);
  });

  it('returns single BY column', () => {
    expect(getChangePointEntityColumns('FROM a | CHANGE_POINT value ON time BY host')).toEqual([
      'host',
    ]);
  });

  it('returns multiple BY columns', () => {
    expect(
      getChangePointEntityColumns('FROM a | CHANGE_POINT value ON time BY host, service')
    ).toEqual(['host', 'service']);
  });

  it('returns empty array for an unparseable query', () => {
    expect(getChangePointEntityColumns('NOT VALID ESQL !!!')).toEqual([]);
  });
});

describe('buildChangePointLineDataQuery', () => {
  it('returns pipeline before top-level CHANGE_POINT', () => {
    const q =
      'FROM gallery-* | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day) | CHANGE_POINT avg_bytes ON bucket';
    expect(buildChangePointLineDataQuery(q)).toBe(
      'FROM gallery-* | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day)'
    );
  });

  it('strips trailing SORT before CHANGE_POINT', () => {
    const q = 'FROM i | STATS m = AVG(x) BY t | SORT t | CHANGE_POINT m ON t';
    expect(buildChangePointLineDataQuery(q)).toBe('FROM i | STATS m = AVG(x) BY t');
  });

  it('returns undefined when CHANGE_POINT only appears inside FORK branches', () => {
    const forkQuery = `FROM gallery-*
| FORK
  ( WHERE referer == "http://a.com" | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day) | SORT bucket | CHANGE_POINT avg_bytes ON bucket )
  ( WHERE referer == "http://b.com" | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day) | CHANGE_POINT avg_bytes ON bucket )
| WHERE type IS NOT NULL`;
    expect(buildChangePointLineDataQuery(forkQuery)).toBeUndefined();
  });

  it('returns undefined for top-level CHANGE_POINT after FORK', () => {
    const forkQuery = `FROM gallery-*
| FORK
  ( WHERE referer == "http://a.com" | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day) )
| CHANGE_POINT avg_bytes ON bucket`;
    expect(buildChangePointLineDataQuery(forkQuery)).toBeUndefined();
  });
});

describe('formatEsqlIdentifier', () => {
  it('leaves simple identifiers unquoted', () => {
    expect(formatEsqlIdentifier('host')).toBe('host');
  });

  it('backticks identifiers with dots', () => {
    expect(formatEsqlIdentifier('k8s.pod.name')).toBe('`k8s.pod.name`');
  });

  it('escapes backticks in identifiers', () => {
    expect(formatEsqlIdentifier('weird`id')).toBe('`weird``id`');
  });
});

describe('formatEsqlLiteral', () => {
  it('formats empty string as an empty ES|QL string literal', () => {
    expect(formatEsqlLiteral('')).toBe('""');
  });

  it('quotes strings', () => {
    expect(formatEsqlLiteral('a"b')).toBe('"a\\"b"');
  });

  it('escapes control characters in strings', () => {
    expect(formatEsqlLiteral('a\nb\rc\td')).toBe('"a\\nb\\rc\\td"');
  });

  it('formats finite numbers', () => {
    expect(formatEsqlLiteral(3.5)).toBe('3.5');
  });

  it('formats booleans', () => {
    expect(formatEsqlLiteral(false)).toBe('false');
  });

  it('formats Date as ISO string literal', () => {
    const d = new Date('2023-11-14T22:13:20.000Z');
    expect(formatEsqlLiteral(d)).toBe('"2023-11-14T22:13:20.000Z"');
  });

  it('returns undefined for null and undefined', () => {
    expect(formatEsqlLiteral(null)).toBeUndefined();
    expect(formatEsqlLiteral(undefined)).toBeUndefined();
  });

  it('formats bigint as unquoted literal', () => {
    expect(formatEsqlLiteral(BigInt(42))).toBe('42');
  });

  it('formats non-finite numbers as quoted strings', () => {
    expect(formatEsqlLiteral(NaN)).toBe('"NaN"');
    expect(formatEsqlLiteral(Infinity)).toBe('"Infinity"');
  });
});

describe('appendEntityFiltersToChangePointLineEsql', () => {
  it('returns the query unchanged when there are no entity columns', () => {
    const q = 'FROM idx | STATS m = AVG(x) BY t';
    expect(appendEntityFiltersToChangePointLineEsql(q, { host: 'a' }, [])).toBe(q);
  });

  it('appends WHERE for entity columns', () => {
    const q = 'FROM idx | STATS m = AVG(x) BY host, t';
    expect(appendEntityFiltersToChangePointLineEsql(q, { host: 'pod-a' }, ['host'])).toBe(
      'FROM idx | STATS m = AVG(x) BY host, t | WHERE host == "pod-a"'
    );
  });

  it('combines multiple predicates with AND', () => {
    const q = 'FROM idx | STATS m = AVG(x) BY a, b, t';
    expect(appendEntityFiltersToChangePointLineEsql(q, { a: 1, b: 'x' }, ['a', 'b'])).toBe(
      'FROM idx | STATS m = AVG(x) BY a, b, t | WHERE a == 1 AND b == "x"'
    );
  });

  it('skips columns with no literal (null / undefined)', () => {
    const q = 'FROM idx | STATS m = AVG(x) BY host, t';
    expect(
      appendEntityFiltersToChangePointLineEsql(q, { host: null, other: 'ok' }, ['host', 'other'])
    ).toBe('FROM idx | STATS m = AVG(x) BY host, t | WHERE other == "ok"');
  });

  it('appends WHERE for entity columns with empty string values', () => {
    // Regression: formatEsqlLiteral("") previously returned undefined, silently dropping the
    // filter. Empty strings are valid ES|QL literals and must produce host == "".
    const q = 'FROM idx | STATS m = AVG(x) BY host, t';
    expect(
      appendEntityFiltersToChangePointLineEsql(q, { host: '', other: 'ok' }, ['host', 'other'])
    ).toBe('FROM idx | STATS m = AVG(x) BY host, t | WHERE host == "" AND other == "ok"');
  });

  it('always appends WHERE for all entity columns regardless of existing pipeline constraints', () => {
    const line =
      'FROM gallery-* | WHERE clientip == "5.255.253.75" | STATS avg_bytes = AVG(bytes) BY clientip, bucket = BUCKET(@timestamp, 1 day)';
    expect(
      appendEntityFiltersToChangePointLineEsql(line, { clientip: '5.255.253.75' }, ['clientip'])
    ).toBe(`${line} | WHERE clientip == "5.255.253.75"`);
  });
});
