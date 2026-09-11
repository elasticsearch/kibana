/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// file names which indicate that the file is a testing file
export const RANDOM_TEST_FILE_NAMES = new Set([
  'jest_setup',
  'test_data',
  'test_helper',
  'test_helpers',
  'stubs',
  'test_utils',
  'test_utilities',
  'rtl_helpers',
  'enzyme_helpers',
  'fixtures',
  'testbed',
  'jest.config',
]);

// tags are found in filenames after a `.`, like `name.tag.ts`
export const TEST_TAG = new Set([
  'test',
  'mock',
  'mocks',
  'stories',
  'story',
  'stub',
  'fixture',
  'story_decorators',
  'storybook_decorator',
  'test_helpers',
]);

// directories where test specific files are assumed to live, any file in a directory with these names is assumed to be test related
export const TEST_DIR = new Set([
  'cypress',
  'test',
  'tests',
  'testing',
  'mock',
  'mocks',
  '__jest__',
  '__mock__',
  '__test__',
  '__mocks__',
  '__stories__',
  '__fixtures__',
  '__snapshots__',
  '__storybook_mocks__',
  'stub',
  'e2e',
  'ftr_e2e',
  'journeys_e2e',
  'storybook',
  '.storybook',
  'integration_tests',
  ...RANDOM_TEST_FILE_NAMES,
]);
