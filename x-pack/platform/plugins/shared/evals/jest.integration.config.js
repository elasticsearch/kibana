/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

module.exports = {
  bail: true,
  forceExit: true,
  preset: '@kbn/test/jest_integration_node',
  rootDir: '../../../../..',
  roots: ['<rootDir>/x-pack/platform/plugins/shared/evals'],
  testMatch: ['/**/integration_tests/**/*.test.{js,mjs,ts,tsx}'],
};
