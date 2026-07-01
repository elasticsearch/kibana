/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { get, identity } from 'lodash';
import type { ScriptedRangeFilter, RangeFilter, Filter } from '@kbn/es-query';
import { isScriptedRangeFilter, isRangeFilter, FILTERS } from '@kbn/es-query';
import type { FieldFormat } from '@kbn/field-formats-plugin/common';

export function getRangeDisplayValue(
  { meta: { params } }: RangeFilter | ScriptedRangeFilter,
  formatter?: FieldFormat
) {
  const convert = formatter ? (v: unknown) => formatter.convertToText(v) : identity;
  const { gte, gt, lte, lt } = params || {};

  const left = gte ?? gt;
  const right = lte ?? lt;

  if (left !== undefined && right !== undefined) {
    return `${convert(left)} to ${convert(right)}`;
  }
  if (gte !== undefined) {
    return `≥ ${convert(gte)}`;
  }
  if (gt !== undefined) {
    return `> ${convert(gt)}`;
  }
  if (lte !== undefined) {
    return `≤ ${convert(lte)}`;
  }
  if (lt !== undefined) {
    return `< ${convert(lt)}`;
  }
  return '-';
}

const getFirstRangeKey = (filter: RangeFilter) =>
  filter.query.range && Object.keys(filter.query.range)[0];
const getRangeByKey = (filter: RangeFilter, key: string) => get(filter.query, ['range', key]);

function getParams(filter: RangeFilter) {
  const isScriptedRange = isScriptedRangeFilter(filter);
  const key: string = (isScriptedRange ? filter.meta.field : getFirstRangeKey(filter)) || '';
  const params: any = isScriptedRange
    ? get(filter.query, 'script.script.params')
    : getRangeByKey(filter, key);

  return { type: FILTERS.RANGE, key, value: params, params };
}

export const isMapRangeFilter = (filter: Filter): filter is RangeFilter =>
  isRangeFilter(filter) || isScriptedRangeFilter(filter);

export const mapRange = (filter: Filter) => {
  if (!isMapRangeFilter(filter)) {
    throw filter;
  }

  return getParams(filter);
};
