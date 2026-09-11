/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SingleTurnStrategy } from '../types';

const LEET_MAP: Record<string, string> = {
  a: '@',
  e: '3',
  i: '1',
  o: '0',
  s: '5',
  t: '7',
  l: '|',
};

const applyLeetspeak = (prompt: string): string =>
  prompt
    .split('')
    .map((char) => {
      const lower = char.toLowerCase();
      return LEET_MAP[lower] ?? char;
    })
    .join('');

export const createLeetspeakStrategy = (): SingleTurnStrategy => ({
  name: 'leetspeak',
  description: 'Applies character substitutions to bypass pattern-matching filters',
  kind: 'single-turn',
  transform: applyLeetspeak,
});
