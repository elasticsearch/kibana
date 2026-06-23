/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

const { USES_STYLED_COMPONENTS } = require('@kbn/babel-preset/styled_components_files');

/**
 * Files that already import js-yaml. New js-yaml imports must not be added here;
 * this list is expected to shrink as consumers migrate to the `yaml` package.
 * Each entry is an anchored regex tested against the kibana-root-relative file path.
 * The `module_migration` rule evaluates each mapping independently, so this list
 * does not interact with other allowlists (e.g. AXIOS_LEGACY_CONSUMERS in .eslintrc.js).
 */
const JS_YAML_LEGACY_CONSUMERS = [
  /^\.buildkite[\/\\]/,
  /^oas_docs[\/\\]scripts[\/\\]/,
  /^packages[\/\\]kbn-api-contracts[\/\\]/,
  /^packages[\/\\]kbn-docs-utils[\/\\]/,
  /^packages[\/\\]kbn-moon[\/\\]/,
  /^packages[\/\\]kbn-optimizer[\/\\]/,
  /^packages[\/\\]kbn-rspack-optimizer[\/\\]/,
  /^scripts[\/\\]/,
  /^src[\/\\]cli[\/\\]/,
  /^src[\/\\]dev[\/\\]/,
  /^src[\/\\]platform[\/\\]kbn-ui[\/\\]_tooling[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]private[\/\\]kbn-apm-config-loader[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]private[\/\\]kbn-gen-ai-functional-testing[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]private[\/\\]kbn-validate-oas[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-config[\/\\]src[\/\\]raw[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-connector-cli[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-edot-collector[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-es[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-openapi-bundler[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-otel-demo[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-otel-semantic-conventions[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-scout[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-synthtrace[\/\\]src[\/\\]cli[\/\\]/,
  /^src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-test[\/\\]src[\/\\]functional_test_runner[\/\\]/,
  /^src[\/\\]platform[\/\\]plugins[\/\\]private[\/\\]interactive_setup[\/\\]server[\/\\]/,
  /^src[\/\\]platform[\/\\]plugins[\/\\]shared[\/\\]telemetry[\/\\]server[\/\\]collectors[\/\\]/,
  /^x-pack[\/\\]packages[\/\\]kbn-synthetics-private-location[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-data-forge[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-evals[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-inference-cli[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]response-ops[\/\\]alerting-v2-rule-form[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]plugins[\/\\]shared[\/\\]agent_builder[\/\\]server[\/\\]services[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]plugins[\/\\]shared[\/\\]automatic_import[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]plugins[\/\\]shared[\/\\]automatic_import_v2[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]plugins[\/\\]shared[\/\\]cases[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]plugins[\/\\]shared[\/\\]fleet[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]plugins[\/\\]shared[\/\\]inference[\/\\]scripts[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]plugins[\/\\]shared[\/\\]osquery[\/\\]cypress[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]plugins[\/\\]shared[\/\\]rule_registry[\/\\]scripts[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]plugins[\/\\]shared[\/\\]streams[\/\\]scripts[\/\\]/,
  /^x-pack[\/\\]platform[\/\\]test[\/\\]cases_api_integration[\/\\]/,
  /^x-pack[\/\\]solutions[\/\\]observability[\/\\]packages[\/\\]synthetics-test-data[\/\\]/,
  /^x-pack[\/\\]solutions[\/\\]observability[\/\\]plugins[\/\\]apm[\/\\]scripts[\/\\]/,
  /^x-pack[\/\\]solutions[\/\\]observability[\/\\]plugins[\/\\]apm[\/\\]server[\/\\]routes[\/\\]fleet[\/\\]/,
  /^x-pack[\/\\]solutions[\/\\]observability[\/\\]plugins[\/\\]observability_ai_assistant_app[\/\\]scripts[\/\\]/,
  /^x-pack[\/\\]solutions[\/\\]observability[\/\\]plugins[\/\\]observability_onboarding[\/\\]server[\/\\]routes[\/\\]flow[\/\\]/,
  /^x-pack[\/\\]solutions[\/\\]observability[\/\\]plugins[\/\\]synthetics[\/\\]public[\/\\]/,
  /^x-pack[\/\\]solutions[\/\\]security[\/\\]packages[\/\\]test-api-clients[\/\\]/,
  /^x-pack[\/\\]solutions[\/\\]security[\/\\]plugins[\/\\]cloud_defend[\/\\]/,
  /^x-pack[\/\\]solutions[\/\\]security[\/\\]plugins[\/\\]elastic_assistant[\/\\]/,
  /^x-pack[\/\\]solutions[\/\\]security[\/\\]plugins[\/\\]security_solution[\/\\]scripts[\/\\]/,
  /^x-pack[\/\\]solutions[\/\\]security[\/\\]plugins[\/\\]security_solution[\/\\]server[\/\\]assistant[\/\\]/,
  /^x-pack[\/\\]solutions[\/\\]security[\/\\]test[\/\\]security_solution_cypress[\/\\]cypress[\/\\]support[\/\\]/,
];

const USES_ELASTIC_APM_AGENT = [
  // Core platform APM integration & agent infrastructure
  /src[\/\\]core[\/\\]/,
  /kbn-apm-config-loader[\/\\]/,
  /kbn-apm-utils[\/\\]/,

  // Test & dev tooling
  /kbn-test[\/\\]src[\/\\]/,
  /kbn-journeys[\/\\]/,
  /kbn-cli-dev-mode[\/\\]/,
  /kbn-docs-utils[\/\\]/,
  /src[\/\\]platform[\/\\]test[\/\\]/,
  /x-pack[\/\\]platform[\/\\]test[\/\\]/,

  // Shared packages with APM tracing
  /kbn-langchain[\/\\]server[\/\\]tracers[\/\\]/,
  /kbn-reporting[\/\\]export_types[\/\\]/,

  // Plugins with legacy APM custom spans (pending OTel migration)
  /workflows_execution_engine[\/\\]server[\/\\]/,
  /task_manager[\/\\]server[\/\\]/,
  /fleet[\/\\]server[\/\\]/,
  /alerting[\/\\]server[\/\\]/,
  /screenshotting[\/\\]server[\/\\]/,
  /reporting[\/\\]server[\/\\]/,
  /intercepts[\/\\]server[\/\\]/,
  /data_usage[\/\\]server[\/\\]/,
  /encrypted_saved_objects[\/\\]server[\/\\]/,
  /plugins[\/\\]shared[\/\\]data[\/\\]server[\/\\]search[\/\\]/,
  /telemetry[\/\\]server[\/\\]/,
  /telemetry_collection_manager[\/\\]server[\/\\]/,
  /security_solution[\/\\]server[\/\\]/,
  /lists[\/\\]server[\/\\]/,
  /elastic_assistant[\/\\]server[\/\\]/,
  /plugins[\/\\]apm[\/\\]/,
  /synthetics[\/\\]server[\/\\]/,
  /feature-flags[\/\\]server-internal[\/\\]/,
  /plugins[\/\\]slo[\/\\]server[\/\\]/,
];

module.exports = {
  extends: [
    './javascript.js',
    './typescript.js',
    './jest.js',
    './react.js',
    'plugin:@elastic/eui/recommended',
  ],

  plugins: [
    '@kbn/eslint-plugin-disable',
    '@kbn/eslint-plugin-eslint',
    '@kbn/eslint-plugin-imports',
    '@kbn/eslint-plugin-telemetry',
    '@kbn/eslint-plugin-i18n',
    '@kbn/eslint-plugin-alerting-v2',
    '@elastic/eui',
    'eslint-plugin-depend',
    'prettier',
  ],

  parserOptions: {
    ecmaVersion: 2018,
  },

  env: {
    es6: true,
  },

  rules: {
    // Suggests better replacements for packages: https://github.com/es-tooling/module-replacements/tree/main/docs/modules
    'depend/ban-dependencies': [
      'error',
      {
        allowed: [
          '^@kbn/*', // internal packages
          'lodash', // https://github.com/es-tooling/module-replacements/blob/main/docs/modules/lodash-underscore.md
          'moment', // https://github.com/es-tooling/module-replacements/blob/main/docs/modules/momentjs.md
          'jquery', // https://github.com/es-tooling/module-replacements/blob/main/docs/modules/jquery.md
        ],
      },
    ],

    'prettier/prettier': [
      'error',
      {
        endOfLine: 'auto',
      },
    ],

    '@kbn/eslint/module_migration': [
      'error',
      [
        {
          from: 'expect.js',
          to: '@kbn/expect',
        },
        {
          from: 'mkdirp',
          to: false,
          disallowedMessage: `Don't use 'mkdirp', use the new { recursive: true } option of Fs.mkdir instead`,
        },
        {
          from: 'numeral',
          to: '@elastic/numeral',
        },
        {
          from: '@kbn/elastic-idx',
          to: false,
          disallowedMessage: `Don't use idx(), use optional chaining syntax instead https://ela.st/optchain`,
        },
        {
          from: 'x-pack',
          toRelative: 'x-pack',
        },
        {
          from: 'react-router',
          to: 'react-router-dom',
        },
        {
          from: '@kbn/ui-shared-deps/monaco',
          to: '@kbn/monaco',
        },
        {
          from: 'monaco-editor',
          to: false,
          disallowedMessage: `Don't import monaco directly, use or add exports to @kbn/monaco`,
        },
        {
          from: 'tinymath',
          to: '@kbn/tinymath',
          disallowedMessage: `Don't use 'tinymath', use '@kbn/tinymath'`,
        },
        {
          from: '@kbn/test/types/ftr',
          to: '@kbn/test',
          disallowedMessage: `import from the root of @kbn/test instead`,
        },
        {
          from: 'react-intl',
          to: '@kbn/i18n-react',
          disallowedMessage: `import from @kbn/i18n-react instead`,
          exclude: [/src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-i18n-react/],
        },
        {
          from: 'zod',
          to: '@kbn/zod',
          disallowedMessage: `import from @kbn/zod instead`,
          exclude: [/src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-zod[\/\\]/],
        },
        {
          from: 'styled-components',
          to: false,
          exclude: USES_STYLED_COMPONENTS,
          disallowedMessage: `Prefer using @emotion/react instead. To use styled-components, ensure you plugin is enabled in packages/kbn-babel-preset/styled_components_files.js.`,
        },
        {
          from: '@kbn/test/jest',
          to: '@kbn/test-jest-helpers',
          disallowedMessage: `import from @kbn/test-jest-helpers instead`,
        },
        {
          from: '@kbn/utility-types/jest',
          to: '@kbn/utility-types-jest',
          disallowedMessage: `import from @kbn/utility-types-jest instead`,
        },
        {
          from: '@kbn/inspector-plugin',
          to: '@kbn/inspector-plugin/common',
          exact: true,
        },
        {
          from: '@kbn/expressions-plugin',
          to: '@kbn/expressions-plugin/common',
          exact: true,
        },
        {
          from: '@kbn/kibana-utils-plugin',
          to: '@kbn/kibana-utils-plugin/common',
          exact: true,
        },
        {
          from: '@elastic/safer-lodash-set',
          to: '@kbn/safer-lodash-set',
        },
        {
          from: '@elastic/apm-synthtrace',
          to: '@kbn/synthtrace',
        },
        {
          from: 'rison-node',
          to: '@kbn/rison',
        },
        {
          from: '@tanstack/react-query',
          to: '@kbn/react-query',
          exact: true,
          disallowedMessage:
            'Use `@kbn/react-query` instead of `@tanstack/react-query`, as it defaults to networkMode="always"',
        },
        {
          from: 'elastic-apm-node',
          to: false,
          exclude: USES_ELASTIC_APM_AGENT,
          disallowedMessage: `Do not use 'elastic-apm-node' for new instrumentation. Use withActiveSpan from @kbn/tracing-utils instead.`,
        },
        {
          from: 'js-yaml',
          to: false,
          exclude: JS_YAML_LEGACY_CONSUMERS,
          disallowedMessage:
            "Do not introduce new js-yaml usage. Use the `yaml` package instead (e.g. `import yaml from 'yaml'`). " +
            'Existing consumers are being migrated incrementally; the allowlist in JS_YAML_LEGACY_CONSUMERS will shrink over time.',
        },
      ],
    ],

    /**
     * ESLint rule to aid with breaking up packages:
     *
     *  `from` the package/request where the exports used to be
     *  `to` the package/request where the exports are now
     *  `exportNames` the list of exports which used to be found in `from` and are now found in `to`
     *
     * TODO(@spalger): once packages have types we should be able to filter this rule based on the package type
     *  of the file being linted so that we could re-route imports from `plugin-client` types to a different package
     *  than `plugin-server` types.
     */
    '@kbn/imports/exports_moved_packages': [
      'error',
      [
        {
          from: '@kbn/dev-utils',
          to: '@kbn/tooling-log',
          exportNames: [
            'DEFAULT_LOG_LEVEL',
            'getLogLevelFlagsHelp',
            'LOG_LEVEL_FLAGS',
            'LogLevel',
            'Message',
            'ParsedLogLevel',
            'parseLogLevel',
            'pickLevelFromFlags',
            'ToolingLog',
            'ToolingLogCollectingWriter',
            'ToolingLogOptions',
            'ToolingLogTextWriter',
            'ToolingLogTextWriterConfig',
            'Writer',
          ],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/ci-stats-reporter',
          exportNames: [
            'CiStatsMetric',
            'CiStatsReporter',
            'CiStatsReportTestsOptions',
            'CiStatsTestGroupInfo',
            'CiStatsTestResult',
            'CiStatsTestRun',
            'CiStatsTestType',
            'CiStatsTiming',
            'getTimeReporter',
            'MetricsOptions',
            'TimingsOptions',
          ],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/ci-stats-core',
          exportNames: ['Config'],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/jest-serializers',
          exportNames: [
            'createAbsolutePathSerializer',
            'createStripAnsiSerializer',
            'createRecursiveSerializer',
            'createAnyInstanceSerializer',
            'createReplaceSerializer',
          ],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/stdio-dev-helpers',
          exportNames: ['observeReadable', 'observeLines'],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/sort-package-json',
          exportNames: ['sortPackageJson'],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/dev-cli-runner',
          exportNames: [
            'run',
            'Command',
            'RunWithCommands',
            'CleanupTask',
            'Command',
            'CommandRunFn',
            'FlagOptions',
            'Flags',
            'RunContext',
            'RunFn',
            'RunOptions',
            'RunWithCommands',
            'RunWithCommandsOptions',
            'getFlags',
            'mergeFlagOptions',
          ],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/dev-cli-errors',
          exportNames: ['createFailError', 'createFlagError', 'isFailError'],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/dev-proc-runner',
          exportNames: ['withProcRunner', 'ProcRunner'],
        },
        {
          from: '@kbn/utils',
          to: '@kbn/repo-info',
          exportNames: [
            'REPO_ROOT',
            'UPSTREAM_BRANCH',
            'kibanaPackageJson',
            'isKibanaDistributable',
            'fromRoot',
          ],
        },
        {
          from: '@kbn/presentation-util-plugin/common',
          to: '@kbn/presentation-util-plugin/test_helpers',
          exportNames: ['functionWrapper', 'fontStyle'],
        },
        {
          from: '@kbn/fleet-plugin/common',
          to: '@kbn/fleet-plugin/common/mocks',
          exportNames: ['createFleetAuthzMock'],
        },
      ],
    ],

    '@kbn/disable/no_protected_eslint_disable': 'error',
    '@kbn/disable/no_naked_eslint_disable': 'error',
    '@kbn/eslint/no_async_promise_body': 'error',
    '@kbn/eslint/no_async_foreach': 'error',
    '@kbn/eslint/require_kibana_feature_privileges_naming': 'warn',
    '@kbn/eslint/no_trailing_import_slash': 'error',
    '@kbn/eslint/no_constructor_args_in_property_initializers': 'error',
    '@kbn/eslint/no_this_in_property_initializers': 'error',
    '@kbn/eslint/no_conditional_saved_object_type_registration': 'error',
    '@kbn/eslint/no_unsafe_console': 'error',
    '@kbn/eslint/no_unsafe_hash': 'error',
    '@kbn/imports/no_unresolvable_imports': 'error',
    '@kbn/imports/uniform_imports': 'error',
    '@kbn/imports/no_unused_imports': 'error',
    '@kbn/imports/no_boundary_crossing': 'error',
    '@kbn/imports/no_group_crossing_manifests': 'error',
    '@kbn/imports/no_group_crossing_imports': 'error',
    '@kbn/imports/no_direct_handlebars_import': 'error',
    '@kbn/imports/no_direct_monaco_import': 'warn',
    '@kbn/imports/no_undeclared_plugin_target': 'error',
    'no-new-func': 'error',
    'no-implied-eval': 'error',
    'no-prototype-builtins': 'error',

    /**
     * EUI Team rules
     */

    '@elastic/eui/no-restricted-eui-imports': [
      'warn',
      {
        patterns: ['@kbn/ui-theme'],
        message: 'For client-side, please use `useEuiTheme` instead.',
      },
    ],

    /**
     * a11y-related rules:
     * all existing violations were fixed; keep this as error to prevent new ones.
     */
    '@elastic/eui/prefer-eui-icon-tip': 'error',
    '@elastic/eui/sr-output-disabled-tooltip': 'error',
    '@elastic/eui/badge-accessibility-rules': 'error',
    '@elastic/eui/consistent-is-invalid-props': 'error',
    '@elastic/eui/tooltip-no-interactive-content': 'error',
  },

  overrides: [
    {
      files: [
        'src/platform/plugins/**/server/index.ts',
        'x-pack/platform/plugins/**/server/index.ts',
        'x-pack/solutions/**/plugins/**/server/index.ts',
        'examples/**/server/index.ts',
        'packages/kbn-mock-idp-plugin/server/index.ts',
      ],
      excludedFiles: ['**/test/**'],
      rules: {
        /**
         * Plugin server entry should not load ./plugin until the plugin is enabled.
         * @see https://github.com/elastic/kibana/pull/170856
         * @see https://github.com/elastic/kibana/issues/171080
         *
         * Enforced in CI; violation count should fall as lazy-load `server/index.ts` migrations land.
         */
        '@kbn/eslint/no_sync_import_from_plugin': 'error',
      },
    },
  ],
};
