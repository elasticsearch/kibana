/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readSuiteFilePath } from './issue_title';

describe('readSuiteFilePath', () => {
  it('reads the file path of a flaky suite title, with or without a framework', () => {
    expect(readSuiteFilePath('Flaky Scout test suite: a/b/c.spec.ts')).toBe('a/b/c.spec.ts');
    expect(readSuiteFilePath('Flaky test suite: a/b/c.spec.ts')).toBe('a/b/c.spec.ts');
    expect(readSuiteFilePath('  Flaky FTR test suite:  x-pack/test/d.ts ')).toBe(
      'x-pack/test/d.ts'
    );
  });

  it('ignores titles of other failed-test issues', () => {
    expect(readSuiteFilePath('Failing test: Discover - should load')).toBeUndefined();
    expect(readSuiteFilePath('Flaky test: a/b/c.spec.ts')).toBeUndefined();
    expect(readSuiteFilePath('Flaky test suite: two words')).toBeUndefined();
    expect(readSuiteFilePath('Flaky test suite:')).toBeUndefined();
  });
});
