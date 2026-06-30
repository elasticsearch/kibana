/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SingleTurnStrategy } from '../types';

const applyRot13 = (prompt: string): string =>
  prompt
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        // Uppercase A-Z
        return String.fromCharCode(((code - 65 + 13) % 26) + 65);
      } else if (code >= 97 && code <= 122) {
        // Lowercase a-z
        return String.fromCharCode(((code - 97 + 13) % 26) + 97);
      }
      return char;
    })
    .join('');

export const createRot13Strategy = (): SingleTurnStrategy => ({
  name: 'rot13',
  description:
    'Encodes the prompt using ROT13 character substitution to bypass pattern-matching safety filters',
  kind: 'single-turn',
  transform: applyRot13,
});
