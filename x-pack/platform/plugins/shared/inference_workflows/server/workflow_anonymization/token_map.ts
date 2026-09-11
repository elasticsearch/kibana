/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TokenMap } from '../../common/workflow_anonymization';

const replaceStringValues = (text: string, replacements: Record<string, string>): string => {
  const keys = Object.keys(replacements).filter((k) => k.length > 0);
  if (keys.length === 0) return text;
  const sorted = [...keys].sort((a, b) => b.length - a.length);
  let result = text;
  for (const key of sorted) {
    result = result.split(key).join(replacements[key]);
  }
  return result;
};

export const restoreTokens = (value: string, tokenMap: TokenMap): string =>
  replaceStringValues(
    value,
    Object.fromEntries(Object.entries(tokenMap).map(([token, entry]) => [token, entry.original]))
  );
