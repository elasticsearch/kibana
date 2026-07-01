/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const { RuleTester } = require('eslint');
const rule = require('./scout_test_file_naming');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2018,
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run('@kbn/eslint/scout_test_file_naming', rule, {
  valid: [
    // Valid: Scout UI test with .spec.ts extension
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/tests/test1.spec.ts',
    },
    // Valid: Scout UI test in subdirectory
    {
      code: '',
      filename:
        'x-pack/solutions/security/plugins/my_plugin/test/scout/ui/tests/sub-feature/test1.spec.ts',
    },
    // Valid: Scout API test with .spec.ts extension
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/api/tests/test1.spec.ts',
    },
    // Valid: Scout test with custom config (scout_config_x)
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout_config_x/api/tests/test1.spec.ts',
    },
    // Valid: Scout parallel tests
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/parallel_tests/test1.spec.ts',
    },
    // Valid: Scout parallel tests in subdirectory
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/parallel_tests/sub-folder/test1.spec.ts',
    },
    // Valid: Non-scout test file (should be ignored)
    {
      code: '',
      filename: 'x-pack/solutions/observability/plugins/my_plugin/test/unit/test1.test.ts',
    },
    // Valid: Scout helper/utility file (not a test file)
    {
      code: '',
      filename: 'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/helpers/utils.ts',
    },
    // Valid: Scout common utilities
    {
      code: '',
      filename: 'x-pack/solutions/observability/plugins/my_plugin/test/scout/common/constants.ts',
    },
    // Valid: Scout fixture file with 'test' in the name (not a test file)
    {
      code: '',
      filename:
        'x-pack/platform/packages/shared/kbn-streamlang-tests/test/scout/api/fixtures/test_bed_fixture.ts',
    },
    // Valid: Scout page object whose name contains 'spec' as a substring (not a test file)
    {
      code: '',
      filename:
        'src/platform/plugins/shared/discover/test/scout/ui/fixtures/metrics_experience/page_objects/inspector.ts',
    },
    // Valid: Scout config file
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/playwright.config.ts',
    },
    // Valid: Scout parallel config file
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/parallel.playwright.config.ts',
    },
    // Valid: global.setup.ts in tests directory
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/tests/global.setup.ts',
    },
    // Valid: global.setup.ts in parallel_tests directory
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/parallel_tests/global.setup.ts',
    },
    // Valid: global.setup.ts in API tests
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/api/tests/global.setup.ts',
    },
    // Valid: global.teardown.ts in tests directory
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/tests/global.teardown.ts',
    },
    // Valid: global.teardown.ts in parallel_tests directory
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/parallel_tests/global.teardown.ts',
    },
    // Valid: global.teardown.ts in API tests
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/api/tests/global.teardown.ts',
    },
  ],

  invalid: [
    // Invalid: Scout UI test with .ts extension instead of .spec.ts
    {
      code: '',
      filename: 'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/tests/test1.ts',
      errors: [
        {
          messageId: 'invalidExtension',
          data: {
            actual: 'test1.ts',
            expected: 'test1.spec.ts',
          },
        },
      ],
    },
    // Invalid: Scout test with .test.ts extension instead of .spec.ts
    {
      code: '',
      filename:
        'x-pack/solutions/security/plugins/my_plugin/test/scout/ui/tests/sub-feature/spec1.test.ts',
      errors: [
        {
          messageId: 'invalidExtension',
          data: {
            actual: 'spec1.test.ts',
            expected: 'spec1.spec.ts',
          },
        },
      ],
    },
    // Invalid: Scout API test without .spec.ts extension
    {
      code: '',
      filename: 'x-pack/solutions/observability/plugins/my_plugin/test/scout/api/tests/test1.ts',
      errors: [
        {
          messageId: 'invalidExtension',
        },
      ],
    },
    // Invalid: Scout custom config test without .spec.ts extension
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout_config_x/api/tests/test1.ts',
      errors: [
        {
          messageId: 'invalidExtension',
        },
      ],
    },
    // Invalid: Scout parallel test without .spec.ts extension
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/parallel_tests/test1.ts',
      errors: [
        {
          messageId: 'invalidExtension',
        },
      ],
    },
    // Invalid: Test file in wrong scout directory structure
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/wrong_dir/test1.spec.ts',
      errors: [
        {
          messageId: 'invalidPath',
        },
      ],
    },
    // Invalid: Test file directly in scout/ui without tests subdirectory
    {
      code: '',
      filename: 'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/test1.spec.ts',
      errors: [
        {
          messageId: 'invalidPath',
        },
      ],
    },
    // Invalid: Test file in scout root without proper structure
    {
      code: '',
      filename: 'x-pack/solutions/observability/plugins/my_plugin/test/scout/my_test.spec.ts',
      errors: [
        {
          messageId: 'invalidPath',
        },
      ],
    },
    // Invalid: Non-global setup file (only global.setup.ts is allowed)
    {
      code: '',
      filename: 'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/tests/my.setup.ts',
      errors: [
        {
          messageId: 'invalidExtension',
        },
      ],
    },
    // Invalid: Custom setup file in parallel_tests (only global.setup.ts is allowed)
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/parallel_tests/custom.setup.ts',
      errors: [
        {
          messageId: 'invalidExtension',
        },
      ],
    },
    // Invalid: Non-standard Playwright config file with dot separator
    {
      code: '',
      filename:
        'src/platform/plugins/shared/discover/test/scout/ui/metrics_experience_parallel.playwright.config.ts',
      errors: [
        {
          messageId: 'invalidPlaywrightConfigName',
          data: {
            actual: 'metrics_experience_parallel.playwright.config.ts',
          },
        },
      ],
    },
    // Invalid: Non-standard Playwright config file without dot separator
    {
      code: '',
      filename:
        'x-pack/solutions/observability/plugins/my_plugin/test/scout/ui/randomplaywright.config.ts',
      errors: [
        {
          messageId: 'invalidPlaywrightConfigName',
          data: {
            actual: 'randomplaywright.config.ts',
          },
        },
      ],
    },
  ],
});
