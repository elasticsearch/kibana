/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql, BasicPrettyPrinter } from '@elastic/esql';
import type { LatestSourceWhereCondition } from '../../significant_events/latest_source_query';
export const andWhere = (
  current: LatestSourceWhereCondition | undefined,
  next: LatestSourceWhereCondition
): LatestSourceWhereCondition => {
  return current ? esql.exp`${current} AND ${next}` : next;
};

export const combineWhere = (
  ...conditions: Array<LatestSourceWhereCondition | undefined>
): LatestSourceWhereCondition | undefined => {
  const defined = conditions.filter((c): c is LatestSourceWhereCondition => c !== undefined);
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];
  // Each condition is wrapped in parens before joining so that top-level OR
  // inside a sub-expression doesn't break AND precedence after composition.
  const text = defined.map((c) => `(${BasicPrettyPrinter.expression(c)})`).join(' AND ');
  return esql.exp(text);
};

export const inPredicate = <T extends string>(
  column: string,
  values: T[]
): LatestSourceWhereCondition | undefined => {
  if (values.length === 0) return undefined;
  const literals = values.map((v) => esql.str(v));
  return esql.exp`${esql.col(column)} IN (${literals})`;
};

export const IS_NOT_DELETED: LatestSourceWhereCondition = esql.exp`deleted IS NULL OR deleted == false`;

export const IS_NOT_EXCLUDED: LatestSourceWhereCondition = esql.exp`excluded IS NULL OR excluded == false`;

export const IS_NOT_EXPIRED: LatestSourceWhereCondition = esql.exp`expires_at IS NULL OR expires_at >= NOW()`;
