/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

module.exports = {
  preset: '@kbn/test',
  rootDir: '../../../../..',
  roots: [
    '<rootDir>/x-pack/platform/plugins/shared/notification_center/public',
    '<rootDir>/x-pack/platform/plugins/shared/notification_center/server',
    '<rootDir>/x-pack/platform/plugins/shared/notification_center/common',
  ],
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/x-pack/platform/plugins/shared/notification_center/{public,server,common}/**/*.{js,ts,tsx}',
  ],
  coverageReporters: ['html'],
};
