/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Parser, PromQLParser, Walker } from '@elastic/esql';
import type { ESQLAstItem, ESQLAstQueryExpression } from '@elastic/esql/types';
import { EDITOR_MARKER } from '../constants';
import {
  correctPromqlQuerySyntax,
  correctQuerySyntax,
  getBracketsToClose,
  isMarkerNode,
  removeAutocompleteMarkers,
} from './ast';

describe('getBracketsToClose', () => {
  it('returns the number of brackets to close', () => {
    expect(getBracketsToClose('foo(bar(baz')).toEqual([')', ')']);
    expect(getBracketsToClose('foo(bar[baz')).toEqual([']', ')']);
    expect(getBracketsToClose('foo(bar[baz"bap')).toEqual(['"', ']', ')']);
    expect(
      getBracketsToClose(
        'from a | eval case(integerField < 0, "negative", integerField > 0, "positive", '
      )
    ).toEqual([')']);
    expect(getBracketsToClose('FROM a | WHERE ("""field: *""")')).toEqual([]);
    expect(getBracketsToClose('FROM a | WHERE ("""field: *')).toEqual(['"""', ')']);
  });

  it('ignores any bracket found within string or triple quotes', () => {
    expect(getBracketsToClose('FROM a | WHERE KQL("""field: "something"""")')).toEqual([]);
    expect(getBracketsToClose('FROM a | WHERE FUNCTION("field: (something)")')).toEqual([]);
    expect(getBracketsToClose('FROM a | WHERE FUNCTION("field: (som")')).toEqual([]);
    expect(getBracketsToClose('FROM a | WHERE FUNCTION(""" "field" : (som""")')).toEqual([]);
    expect(getBracketsToClose('FROM a | WHERE FUNCTION(""" "field : (som""")')).toEqual([]);
  });

  it('ignores /* and */ inside string literals but handles real comments', () => {
    expect(getBracketsToClose('KQL("path: */internal/*")')).toEqual([]);
    expect(getBracketsToClose('WHERE field /* comment')).toEqual(['*/']);
  });
});

describe('correctQuerySyntax', () => {
  it('appends marker after operator', () => {
    const query = 'FROM foo | EVAL field > ';
    const result = correctQuerySyntax(query);
    expect(result.endsWith(EDITOR_MARKER)).toBe(true);
  });

  it('appends marker after comma', () => {
    const query = 'FROM foo | STATS field1, ';
    const result = correctQuerySyntax(query);
    expect(result.endsWith(EDITOR_MARKER)).toBe(true);
  });

  it('appends marker if all brackets are closed and ends with operator', () => {
    const query = 'FROM index | STATS AVG(field1) != ';
    const result = correctQuerySyntax(query);
    expect(result.endsWith(EDITOR_MARKER)).toBe(true);
  });

  it('does not append marker for inline cast type names ending with operator-like suffixes', () => {
    const query = 'FROM index | EVAL vec = [0.1, 0.2]::dense_vector ';
    const result = correctQuerySyntax(query);
    expect(result).toEqual(query);
  });

  it('closes unclosed brackets', () => {
    const query = 'FROM foo | EVAL foo(bar[baz';
    const result = correctQuerySyntax(query);
    expect(result.endsWith('])')).toBe(true);
    expect(result).not.toContain(EDITOR_MARKER);
  });

  it('does not change complete query', () => {
    const query = 'FROM index | STATS AVG(field1) != 10';
    // This query is complete, so it should not be modified
    const result = correctQuerySyntax(query);
    expect(result).toEqual(query);
  });

  it('handles incomplete function signature', () => {
    const query = 'FROM foo | EVAL foo(bar, ';
    const result = correctQuerySyntax(query);
    expect(result.endsWith(`${EDITOR_MARKER})`)).toBe(true);
  });
});

describe('correctPromqlQuerySyntax', () => {
  it('appends marker after trailing comma', () => {
    const query = 'rate(http_requests_total, ';
    const result = correctPromqlQuerySyntax(query);
    expect(result.endsWith(`${EDITOR_MARKER})`)).toBe(true);
  });

  it('appends marker after trailing colon', () => {
    const query = 'metric[5m:';
    const result = correctPromqlQuerySyntax(query);
    expect(result.endsWith(`${EDITOR_MARKER}]`)).toBe(true);
  });

  it('closes braces and brackets for incomplete selector/function', () => {
    const query = 'sum(rate(http_requests_total{job="api"';
    const result = correctPromqlQuerySyntax(query);
    expect(result.endsWith('}))')).toBe(true);
  });

  it('does not inject marker for trailing operator', () => {
    const query = 'up + ';
    const result = correctPromqlQuerySyntax(query);
    expect(result).toBe(query);
  });

  it('does not add duplicate marker', () => {
    const query = `rate(http_requests_total, ${EDITOR_MARKER}`;
    const result = correctPromqlQuerySyntax(query);
    const markerMatches = result.match(new RegExp(EDITOR_MARKER, 'g')) ?? [];
    expect(markerMatches).toHaveLength(1);
  });

  it('normalizes marker nodes from parsed PromQL autocomplete ASTs', () => {
    const query = correctPromqlQuerySyntax('rate(http_requests_total, ');
    const { root } = PromQLParser.parse(query);
    const normalizedRoot = removeAutocompleteMarkers(root);

    expect(JSON.stringify(normalizedRoot)).not.toContain(EDITOR_MARKER);
  });
});

describe('removeAutocompleteMarkers', () => {
  const parseAutocomplete = (innerText: string): ESQLAstQueryExpression => {
    const corrected = correctQuerySyntax(innerText);
    return Parser.parse(corrected, { withFormatting: true }).root;
  };

  const countMarkers = (node: ESQLAstQueryExpression): number => {
    let count = 0;
    Walker.walk(node, {
      visitAny: (current) => {
        if (isMarkerNode(current as ESQLAstItem)) {
          count++;
        }
      },
    });
    return count;
  };

  it('drops marker-only nodes nested in args arrays', () => {
    const root = parseAutocomplete('FROM index | EVAL result = ROUND(doubleField, ');

    expect(countMarkers(root)).toBeGreaterThan(0);
    expect(countMarkers(removeAutocompleteMarkers(root))).toBe(0);
  });

  it('strips the marker from the inline cast type, not only from text', () => {
    const root = parseAutocomplete('FROM index | EVAL casted = keywordField::');

    // Before cleaning, the marker leaks into inlineCast.castType (a plain string property).
    expect(JSON.stringify(root)).toContain(EDITOR_MARKER);
    expect(JSON.stringify(removeAutocompleteMarkers(root))).not.toContain(EDITOR_MARKER);
  });
});
