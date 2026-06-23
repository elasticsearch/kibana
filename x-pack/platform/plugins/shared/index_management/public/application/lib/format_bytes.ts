/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import numeral from '@elastic/numeral';

export const formatBytes = (bytes?: number): string => numeral(bytes || 0).format('0.00 b');

export const formatByteSizeString = (value?: string | number): string | undefined => {
  if (typeof value === 'number') {
    return formatBytes(value);
  }

  return value?.replace(/(\d(?:[\d.,]*\s*)?)([kmgtp]?b)\b/gi, (_, size: string, unit: string) => {
    return `${size}${unit.toUpperCase()}`;
  });
};
