/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Datatable, DatatableRow, ExpressionsStart } from '@kbn/expressions-plugin/public';
import { lastValueFrom, map } from 'rxjs';
import type { ExpressionAstExpression } from '@kbn/expressions-plugin/common';
import { aggregateQueryToAst } from '@kbn/data-plugin/common';

export interface ExecuteEsqlQueryOptions<Input> {
  expressions: ExpressionsStart;
  query: string;
  abortSignal?: AbortSignal;
  input: Input;
  /** When true, passes `allowCache: false` to `expressions.execute` to bypass expression-layer caching. */
  noCache?: boolean;
  /**
   * Field the `esql` function applies `input.timeRange` to as a filter on the
   * source documents, before the query runs. Leave it out when the query
   * handles the range itself with `?_tstart` / `?_tend`, which the function
   * fills in from `input.timeRange` either way.
   */
  timeField?: string;
}

/**
 * Executes an ES|QL query through the expressions plugin, using Discover's `esql` function,
 * which also transforms the tabular result into a datatable-ready data structure.
 *
 * Pass a row type parameter to get typed rows instead of `DatatableRow`.
 */
export const executeEsqlQuery = <TRow extends object = DatatableRow, Input = unknown>({
  expressions,
  query,
  input,
  abortSignal,
  noCache,
  timeField,
}: ExecuteEsqlQueryOptions<Input>): Promise<TRow[]> => {
  // Built as an AST rather than as an expression string, so the query text
  // needs no escaping for the expression parser.
  const esqlFunction = aggregateQueryToAst({ query: { esql: query }, timeField });
  if (!esqlFunction) {
    throw new Error('Could not build the esql expression');
  }
  const expression: ExpressionAstExpression = { type: 'expression', chain: [esqlFunction] };
  const options = noCache ? { allowCache: false } : undefined;
  const executionContract = expressions.execute<Input, Datatable>(expression, input, options);
  abortSignal?.addEventListener('abort', (e) => {
    executionContract.cancel((e.target as AbortSignal)?.reason);
  });
  return lastValueFrom(
    executionContract.getData().pipe(
      map(({ result }) => {
        if (result.type === 'error') {
          throw result.error;
        }
        return result.rows as TRow[];
      })
    )
  );
};
