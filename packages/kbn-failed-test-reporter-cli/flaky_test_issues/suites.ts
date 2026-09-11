/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { compareByFailedBuilds, rankTests, type FlakyTestEntry } from '@kbn/scout-reporting';

/**
 * All flaky tests of one test file. Issues are tracked per suite rather than per test: the tests
 * of a file usually share a fixture, a page object or a setup hook, and that is what gets fixed.
 */
export interface FlakySuite {
  filePath: string;
  /** Ranked by failed builds, worst first. */
  tests: FlakyTestEntry[];
}

/** Groups entries by file and ranks suites by their worst test. */
export const groupIntoSuites = (entries: readonly FlakyTestEntry[]): FlakySuite[] => {
  const byFile = new Map<string, FlakyTestEntry[]>();
  for (const entry of entries) {
    byFile.set(entry.filePath, [...(byFile.get(entry.filePath) ?? []), entry]);
  }

  const suites = [...byFile.entries()].map(
    ([filePath, tests]): FlakySuite => ({ filePath, tests: rankTests(tests) })
  );

  return suites.sort((a, b) => compareByFailedBuilds(a.tests[0], b.tests[0]));
};
