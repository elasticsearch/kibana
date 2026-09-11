/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AggregateQuery } from '@kbn/es-query';
import type { ESQLControlVariable } from '@kbn/esql-types';
import { BehaviorSubject } from 'rxjs';

import { panelIsRelatedByEsqlVariable } from './panel_is_related_by_esql_variable';

const esqlVariable = (key: string): ESQLControlVariable =>
  ({
    key,
  } as ESQLControlVariable);

const getSiblingApi = (esql: string) => ({
  esql$: new BehaviorSubject<AggregateQuery[]>([{ esql }]),
  approximationApplied$: new BehaviorSubject<boolean | undefined>(undefined),
});

describe('panelIsRelatedByEsqlVariable', () => {
  test('returns true when a sibling ES|QL query consumes the control variable', () => {
    const esqlVariable$ = new BehaviorSubject(esqlVariable('myVar'));
    const { isRelated } = panelIsRelatedByEsqlVariable({ esqlVariable$ });
    const sibling = getSiblingApi('FROM logs | WHERE level == ?myVar');

    expect(
      isRelated(sibling, [esqlVariable('myVar')], [[{ esql: 'FROM logs | WHERE level == ?myVar' }]])
    ).toBe(true);
  });

  test('returns false when a sibling ES|QL query uses a different variable', () => {
    const esqlVariable$ = new BehaviorSubject(esqlVariable('myVar'));
    const { isRelated } = panelIsRelatedByEsqlVariable({ esqlVariable$ });
    const sibling = getSiblingApi('FROM logs | WHERE level == ?other');

    expect(
      isRelated(sibling, [esqlVariable('myVar')], [[{ esql: 'FROM logs | WHERE level == ?other' }]])
    ).toBe(false);
  });

  test('returns false when sibling does not publish an ES|QL query', () => {
    const esqlVariable$ = new BehaviorSubject(esqlVariable('myVar'));
    const { isRelated } = panelIsRelatedByEsqlVariable({ esqlVariable$ });

    expect(isRelated({}, [esqlVariable('myVar')], [[]])).toBe(false);
  });

  test('returns false when sibling query is passed but sibling does not publish ES|QL', () => {
    const esqlVariable$ = new BehaviorSubject(esqlVariable('myVar'));
    const { isRelated } = panelIsRelatedByEsqlVariable({ esqlVariable$ });

    expect(
      isRelated({}, [esqlVariable('myVar')], [[{ esql: 'FROM logs | WHERE level == ?myVar' }]])
    ).toBe(false);
  });

  test('reacts to self variable key changes', () => {
    const esqlVariable$ = new BehaviorSubject(esqlVariable('myVar'));
    const { isRelated } = panelIsRelatedByEsqlVariable({ esqlVariable$ });
    const sibling = getSiblingApi('FROM logs | WHERE level == ?myVar');

    expect(
      isRelated(sibling, [esqlVariable('myVar')], [[{ esql: 'FROM logs | WHERE level == ?myVar' }]])
    ).toBe(true);

    esqlVariable$.next(esqlVariable('renamedVar'));
    expect(
      isRelated(
        getSiblingApi('FROM logs | WHERE level == ?renamedVar'),
        [esqlVariable('renamedVar')],
        [[{ esql: 'FROM logs | WHERE level == ?renamedVar' }]]
      )
    ).toBe(true);
  });

  test('reacts to sibling query changes', () => {
    const esqlVariable$ = new BehaviorSubject(esqlVariable('myVar'));
    const { isRelated } = panelIsRelatedByEsqlVariable({ esqlVariable$ });
    const siblingEsql$ = new BehaviorSubject<AggregateQuery[]>([
      {
        esql: 'FROM logs | WHERE level == ?other',
      },
    ]);
    const approximationApplied$ = new BehaviorSubject<boolean | undefined>(undefined);
    const sibling = { esql$: siblingEsql$, approximationApplied$ };

    expect(isRelated(sibling, [esqlVariable('myVar')], [siblingEsql$.value])).toBe(false);

    siblingEsql$.next([{ esql: 'FROM logs | WHERE level == ?myVar' }]);
    expect(isRelated(sibling, [esqlVariable('myVar')], [siblingEsql$.value])).toBe(true);
  });
});
