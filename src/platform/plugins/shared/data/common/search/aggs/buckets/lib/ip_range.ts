/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface CidrMaskIpRangeAggKey {
  type: 'mask';
  mask: string;
}

export interface RangeIpRangeAggKey {
  type: 'range';
  from: string;
  to: string;
}

export type IpRangeKey = CidrMaskIpRangeAggKey | RangeIpRangeAggKey;

export const convertIPRangeToString = (range: IpRangeKey, format: (val: string) => string) => {
  if (range.type === 'mask') {
    return format(range.mask);
  }
  const from = range.from ? format(range.from) : '-Infinity';
  const to = range.to ? format(range.to) : 'Infinity';

  return `${from} to ${to}`;
};
