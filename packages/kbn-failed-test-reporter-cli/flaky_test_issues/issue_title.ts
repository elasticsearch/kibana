/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Words the title of a flaky suite issue contains, e.g. `Flaky Scout test suite: <file>`. Together
 * with the `failed-test` label they are how the check finds the issues, so they must stay stable.
 */
export const FLAKY_TEST_SUITE_TITLE_TERMS = ['Flaky', 'test suite'] as const;

/** `Flaky <anything> test suite: <file>`, e.g. the framework in between is optional. */
const TITLE_PATTERN = new RegExp(
  `^${FLAKY_TEST_SUITE_TITLE_TERMS[0]}\\b.*\\b${FLAKY_TEST_SUITE_TITLE_TERMS[1]}:\\s*(\\S+)\\s*$`
);

/** Suite file path named by an issue title, if the title follows the flaky suite format. */
export const readSuiteFilePath = (title: string): string | undefined =>
  title.trim().match(TITLE_PATTERN)?.[1];
