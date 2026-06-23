/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

module.exports = {
  bail: true, // only report 1 issue
  // TODO replace the line below with
  // preset: '@kbn/test/jest_integration_node
  // to do so, we must fix all integration tests first
  // see https://github.com/elastic/kibana/pull/130255/
  preset: '@kbn/test/jest_integration',
  rootDir: '../../../../..',
  roots: [
    '<rootDir>/src/core/server/integration_tests/saved_objects/routes',
    '<rootDir>/src/core/server/integration_tests/saved_objects/service',
    '<rootDir>/src/core/server/integration_tests/saved_objects/validation',
  ],
  // must override to match all test given there is no `integration_tests` subfolder
  testMatch: ['**/*.test.{js,mjs,ts,tsx}'],
};
