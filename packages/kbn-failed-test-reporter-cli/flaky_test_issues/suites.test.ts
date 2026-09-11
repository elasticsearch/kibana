/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { groupIntoSuites } from './suites';
import { flakyTest } from './test_fixtures';

describe('groupIntoSuites', () => {
  it('groups tests by file, ranks tests within a suite and suites by their worst test', () => {
    const suites = groupIntoSuites([
      flakyTest({ testId: 'a1', filePath: 'a.spec.ts', failedBuilds: 2 }),
      flakyTest({ testId: 'b1', filePath: 'b.spec.ts', failedBuilds: 5 }),
      flakyTest({ testId: 'a2', filePath: 'a.spec.ts', failedBuilds: 9 }),
    ]);

    expect(suites.map((suite) => suite.filePath)).toEqual(['a.spec.ts', 'b.spec.ts']);
    expect(suites[0].tests.map((test) => test.testId)).toEqual(['a2', 'a1']);
  });

  it('returns no suites for an empty report', () => {
    expect(groupIntoSuites([])).toEqual([]);
  });
});
