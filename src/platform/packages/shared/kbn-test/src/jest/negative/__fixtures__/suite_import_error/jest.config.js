/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Negative-testing canary config. It lives under __fixtures__ so normal discovery
// (CI run order, orphan check, package runs) never picks it up; it is only run
// explicitly by scripts/jest_negative, which expects it to fail. Kept minimal and
// standalone (no shared preset) so the canary fails for its own reason and is not
// affected by the preset's __fixtures__ ignore or its jsdom/enzyme setup files.
module.exports = {
  rootDir: '../../../../../../../../../..',
  roots: [
    '<rootDir>/src/platform/packages/shared/kbn-test/src/jest/negative/__fixtures__/suite_import_error',
  ],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.(js|mjs|tsx?)$':
      '<rootDir>/src/platform/packages/shared/kbn-test/src/jest/transforms/swc/index.js',
  },
  transformIgnorePatterns: ['[/\\\\]node_modules[/\\\\]'],
};
