/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RE2JS } from 're2js';

/**
 * Asserts that `pattern` is valid RE2 syntax.
 *
 * Throws a descriptive Error when the pattern contains constructs RE2 does not
 * support — most commonly lookahead (`(?=…)`), lookbehind (`(?<=…)`), or
 * backreferences (`\1`). Call this at workflow-definition-save time so a bad
 * pattern is caught before it reaches the regex worker at inference time.
 */
export const assertRe2Compilable = (pattern: string): void => {
  try {
    RE2JS.compile(pattern);
  } catch (err) {
    throw new Error(
      `Pattern is not valid RE2 syntax (lookahead, lookbehind and backreferences are ` +
        `not supported): ${pattern}\nCause: ${err instanceof Error ? err.message : String(err)}`
    );
  }
};
