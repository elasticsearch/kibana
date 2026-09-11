/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InferenceTokenMapEntry } from '../workflow_anonymization_capabilities';

export type InferenceTokenMap = Readonly<Record<string, InferenceTokenMapEntry>>;

const orderedTokens = (tokenMap: InferenceTokenMap): string[] =>
  Object.keys(tokenMap)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const replaceStringValues = (
  text: string,
  replacements: Readonly<Record<string, string>>
): string => {
  const keys = Object.keys(replacements)
    .filter((key) => key.length > 0)
    .sort((left, right) => right.length - left.length);

  if (keys.length === 0) {
    return text;
  }

  const pattern = new RegExp(keys.map(escapeRegExp).join('|'), 'g');
  return text.replace(pattern, (matched) => replacements[matched]);
};

export const restoreTokenizedString = (value: string, tokenMap: InferenceTokenMap): string =>
  replaceStringValues(
    value,
    Object.fromEntries(Object.entries(tokenMap).map(([token, entry]) => [token, entry.original]))
  );

export const restoreTokenizedValue = (value: unknown, tokenMap: InferenceTokenMap): unknown => {
  if (typeof value === 'string') {
    return restoreTokenizedString(value, tokenMap);
  }
  if (Array.isArray(value)) {
    return value.map((item) => restoreTokenizedValue(item, tokenMap));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, restoreTokenizedValue(item, tokenMap)])
  );
};

const createProperTokenPrefixes = (
  tokens: readonly string[]
): { prefixes: ReadonlySet<string>; maximumLength: number } => {
  const prefixes = new Set<string>();
  let maximumLength = 0;
  tokens.forEach((token) => {
    for (let length = 1; length < token.length; length += 1) {
      prefixes.add(token.slice(0, length));
      maximumLength = Math.max(maximumLength, length);
    }
  });
  return { prefixes, maximumLength };
};

// Minimum tail length before we consider it a potential split token. Single-character
// matches (e.g. 'E' for EMAIL_, 'I' for IP_) are too common in English text and cause
// visible streaming gaps by suppressing relay events for those chunks.
const MIN_PREFIX_HOLDBACK = 2;

const longestPossibleTokenPrefix = (
  value: string,
  prefixes: ReadonlySet<string>,
  maximumLength: number
): number => {
  for (
    let length = Math.min(value.length, maximumLength);
    length >= MIN_PREFIX_HOLDBACK;
    length -= 1
  ) {
    if (prefixes.has(value.slice(-length))) {
      return length;
    }
  }
  return 0;
};

export interface StreamingContentRestorer {
  push(content: string): string;
  flush(): string;
}

export const createStreamingContentRestorer = (
  tokenMap: InferenceTokenMap
): StreamingContentRestorer => {
  const tokens = orderedTokens(tokenMap);
  const { prefixes, maximumLength } = createProperTokenPrefixes(tokens);
  let heldContent = '';

  return {
    push: (content) => {
      const buffered = `${heldContent}${content}`;
      const heldLength = longestPossibleTokenPrefix(buffered, prefixes, maximumLength);
      const safeLength = buffered.length - heldLength;
      heldContent = buffered.slice(safeLength);
      return restoreTokenizedString(buffered.slice(0, safeLength), tokenMap);
    },
    flush: () => {
      const restored = restoreTokenizedString(heldContent, tokenMap);
      heldContent = '';
      return restored;
    },
  };
};
