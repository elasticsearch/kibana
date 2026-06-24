/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

require('@kbn/babel-register').install();

const { getPackages } = require('@kbn/repo-packages');
const { REPO_ROOT } = require('@kbn/repo-info');

const APACHE_2_0_LICENSE_HEADER = `
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
`;

const DUAL_ELV1_SSPL1_LICENSE_HEADER = `
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * and the Server Side Public License, v 1; you may not use this file except in
 * compliance with, at your election, the Elastic License or the Server Side
 * Public License, v 1.
 */
`;

const DUAL_ELV2_SSPL1_LICENSE_HEADER = `
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
`;

const TRIPLE_ELV2_SSPL1_AGPL3_LICENSE_HEADER = `
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
`;

const OLD_ELASTIC_LICENSE_HEADER = `
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */
`;

const ELV2_LICENSE_HEADER = `
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
`;

const SAFER_LODASH_SET_HEADER = `
/*
 * Elasticsearch B.V licenses this file to you under the MIT License.
 * See \`src/platform/packages/shared/kbn-safer-lodash-set/LICENSE\` for more information.
 */
`;

const SAFER_LODASH_SET_LODASH_HEADER = `
/*
 * This file is forked from the lodash project (https://lodash.com/),
 * and may include modifications made by Elasticsearch B.V.
 * Elasticsearch B.V. licenses this file to you under the MIT License.
 * See \`src/platform/packages/shared/kbn-safer-lodash-set/LICENSE\` for more information.
 */
`;

const SAFER_LODASH_SET_DEFINITELYTYPED_HEADER = `
/*
 * This file is forked from the DefinitelyTyped project (https://github.com/DefinitelyTyped/DefinitelyTyped),
 * and may include modifications made by Elasticsearch B.V.
 * Elasticsearch B.V. licenses this file to you under the MIT License.
 * See \`src/platform/packages/shared/kbn-safer-lodash-set/LICENSE\` for more information.
 */
`;

const KBN_HANDLEBARS_HEADER = `
/*
 * Elasticsearch B.V licenses this file to you under the MIT License.
 * See \`src/platform/packages/private/kbn-handlebars/LICENSE\` for more information.
 */
`;

const KBN_HANDLEBARS_HANDLEBARS_HEADER = `
/*
  * This file is forked from the handlebars project (https://github.com/handlebars-lang/handlebars.js),
  * and may include modifications made by Elasticsearch B.V.
  * Elasticsearch B.V. licenses this file to you under the MIT License.
  * See \`src/platform/packages/private/kbn-handlebars/LICENSE\` for more information.
  */
`;

const VENN_DIAGRAM_HEADER = `
/*
  * This file is forked from the venn.js project (https://github.com/benfred/venn.js/),
  * and may include modifications made by Elasticsearch B.V.
  * Elasticsearch B.V. licenses this file to you under the MIT License.
  * See \`x-pack/platform/plugins/private/graph/public/components/venn_diagram/vennjs/LICENSE\` for more information.
  */
`;

/** Packages which should not be included within production code. */
const DEV_PACKAGE_DIRS = getPackages(REPO_ROOT).flatMap((pkg) =>
  pkg.isDevOnly() ? pkg.normalizedRepoRelativeDir : []
);

/** Directories (at any depth) which include dev-only code. */
const DEV_DIRECTORIES = [
  '.storybook',
  '__tests__',
  '__test__',
  '__jest__',
  '__fixtures__',
  '__mocks__',
  '__stories__',
  'e2e',
  'cypress',
  'fixtures',
  'ftr_e2e',
  'integration_tests',
  'manual_tests',
  'mock',
  'mocks',
  'storybook',
  'scripts',
  'test',
  'test-d',
  'test_utils',
  'test_utilities',
  'test_helpers',
  'tests_client_integration',
  'tsd_tests',
];

/** File patterns for dev-only code. */
const DEV_FILE_PATTERNS = [
  '*.mock.{js,ts,tsx}',
  '*.test.{js,ts,tsx}',
  '*.test.helpers.{js,ts,tsx}',
  '*.stories.{js,ts,tsx}',
  '*.story.{js,ts,tsx}',
  '*.stub.{js,ts,tsx}',
  'mock.{js,ts,tsx}',
  '_stubs.{js,ts,tsx}',
  '{testHelpers,test_helper,test_utils}.{js,ts,tsx}',
  '{postcss,webpack,cypress}.config.{js,ts}',
];

/** Glob patterns which describe dev-only code. */
const DEV_PATTERNS = [
  ...DEV_PACKAGE_DIRS.map((pkg) => `${pkg}/**/*`),
  ...DEV_DIRECTORIES.map((dir) => `{packages,src,x-pack}/**/${dir}/**/*`),
  ...DEV_FILE_PATTERNS.map((file) => `{packages,src,x-pack}/**/${file}`),
  'src/platform/packages/shared/kbn-interpreter/tasks/**/*',
  'src/dev/**/*',
  'x-pack/{dev-tools,tasks,test,build_chromium}/**/*',
  'x-pack/performance/**/*',
  'src/setup_node_env/index.js',
  'src/cli/dev.js',
  'src/platform/packages/shared/kbn-esql-language/scripts/**/*',
  'src/platform/kbn-ui/_tooling/**/*',
];

/** Restricted imports with suggested alternatives */
const RESTRICTED_IMPORTS = [
  {
    name: 'lodash',
    importNames: ['set', 'setWith', 'template'],
    message:
      'lodash.set/setWith: Please use @kbn/safer-lodash-set instead.\n' +
      'lodash.template: Function is unsafe, and not compatible with our content security policy.',
  },
  {
    name: 'lodash.set',
    message: 'Please use @kbn/safer-lodash-set/set instead',
  },
  {
    name: 'lodash.setwith',
    message: 'Please use @kbn/safer-lodash-set/setWith instead',
  },
  {
    name: 'lodash/set',
    message: 'Please use @kbn/safer-lodash-set/set instead',
  },
  {
    name: 'lodash/setWith',
    message: 'Please use @kbn/safer-lodash-set/setWith instead',
  },
  {
    name: 'lodash/fp',
    importNames: ['set', 'setWith', 'assoc', 'assocPath', 'template'],
    message:
      'lodash.set/setWith/assoc/assocPath: Please use @kbn/safer-lodash-set/fp instead\n' +
      'lodash.template: Function is unsafe, and not compatible with our content security policy.',
  },
  {
    name: 'lodash/fp/set',
    message: 'Please use @kbn/safer-lodash-set/fp/set instead',
  },
  {
    name: 'lodash/fp/setWith',
    message: 'Please use @kbn/safer-lodash-set/fp/setWith instead',
  },
  {
    name: 'lodash/fp/assoc',
    message: 'Please use @kbn/safer-lodash-set/fp/assoc instead',
  },
  {
    name: 'lodash/fp/assocPath',
    message: 'Please use @kbn/safer-lodash-set/fp/assocPath instead',
  },
  {
    name: 'lodash.template',
    message: 'lodash.template is unsafe, and not compatible with our content security policy.',
  },
  {
    name: 'lodash/template',
    message: 'lodash.template is unsafe, and not compatible with our content security policy.',
  },
  {
    name: 'lodash/fp/template',
    message: 'lodash.template is unsafe, and not compatible with our content security policy.',
  },
  {
    name: 'react-use',
    message: 'Please use react-use/lib/{method} instead.',
  },
  {
    name: 'react-use/lib',
    message: 'Please use react-use/lib/{method} instead.',
  },
  {
    name: 'react-router-dom',
    importNames: ['Router', 'Switch', 'Route'],
    message: 'Please use @kbn/shared-ux-router instead',
  },
  {
    name: '@kbn/kibana-react-plugin/public',
    importNames: ['Route'],
    message: 'Please use @kbn/shared-ux-router instead',
  },
  {
    name: 'rxjs/operators',
    message:
      'Please, use rxjs instead: rxjs/operators is just a subset, unnecessarily duplicating the package import.',
  },
  {
    name: '@testing-library/react-hooks',
    message: 'Please use @testing-library/react instead',
  },
  {
    name: '@elastic/ecs',
    importNames: ['EcsFlat'],
    message:
      'Do not import fields metadata directly in Kibana, as they can bloat the bundle size. Instead, consume metadata fields from @kbn/fields-metadata-plugin, which handles scoped field metadata retrieval (ECS, OTel, etc.).',
  },
  ...[
    'Alt',
    'Alternative',
    'Applicative',
    'Apply',
    'Array',
    'Bifunctor',
    'boolean',
    'BooleanAlgebra',
    'Bounded',
    'BoundedDistributiveLattice',
    'BoundedJoinSemilattice',
    'BoundedLattice',
    'BoundedMeetSemilattice',
    'Category',
    'Chain',
    'ChainRec',
    'Choice',
    'Comonad',
    'Compactable',
    'Console',
    'Const',
    'Contravariant',
    'Date',
    'DistributiveLattice',
    'Either',
    'EitherT',
    'Eq',
    'Extend',
    'Field',
    'Filterable',
    'FilterableWithIndex',
    'Foldable',
    'FoldableWithIndex',
    'function',
    'Functor',
    'FunctorWithIndex',
    'Group',
    'HeytingAlgebra',
    'Identity',
    'Invariant',
    'IO',
    'IOEither',
    'IORef',
    'JoinSemilattice',
    'Lattice',
    'Magma',
    'Map',
    'MeetSemilattice',
    'Monad',
    'MonadIO',
    'MonadTask',
    'MonadThrow',
    'Monoid',
    'NonEmptyArray',
    'Option',
    'OptionT',
    'Ord',
    'Ordering',
    'pipeable',
    'Profunctor',
    'Random',
    'Reader',
    'ReaderEither',
    'ReaderT',
    'ReaderTask',
    'ReaderTaskEither',
    'ReadonlyArray',
    'ReadonlyMap',
    'ReadonlyNonEmptyArray',
    'ReadonlyRecord',
    'ReadonlySet',
    'ReadonlyTuple',
    'Record',
    'Ring',
    'Semigroup',
    'Semigroupoid',
    'Semiring',
    'Set',
    'Show',
    'State',
    'StateReaderTaskEither',
    'StateT',
    'Store',
    'Strong',
    'Task',
    'TaskEither',
    'TaskThese',
    'These',
    'TheseT',
    'Traced',
    'Traversable',
    'TraversableWithIndex',
    'Tree',
    'Tuple',
    'Unfoldable',
    'ValidationT',
    'Witherable',
    'Writer',
    'WriterT',
  ].map((subset) => {
    return {
      name: `fp-ts/lib/${subset}`,
      message: `Please, use fp-ts/${subset} to avoid duplicating the package import`,
    };
  }),
  {
    name: `fp-ts/lib`,
    message: `Please, use fp-ts to avoid duplicating the package import`,
  },
  {
    name: 'axios',
    message:
      'Do not introduce new axios usage. Use the native `fetch` API instead (available in Node.js 22 and modern browsers). Existing consumers are being migrated incrementally; the allowlist in AXIOS_LEGACY_CONSUMERS will shrink over time.',
  },
];

/**
 * Files that already import axios. New axios imports must not be added here;
 * this list is expected to shrink as consumers migrate to the native `fetch` API.
 * Globs are scoped to existing feature boundaries to keep the leak surface small.
 */
const AXIOS_LEGACY_CONSUMERS = [
  '.buildkite/**/*.{js,mjs,ts,tsx,jsx}',
  'packages/kbn-ci-stats-performance-metrics/**/*.{js,mjs,ts,tsx}',
  'packages/kbn-generate/**/*.{js,mjs,ts,tsx}',
  'src/dev/build/lib/**/*.{js,mjs,ts,tsx}',
  'src/dev/build/tasks/**/*.{js,mjs,ts,tsx}',
  'src/dev/prs/**/*.{js,mjs,ts,tsx}',
  'src/platform/packages/private/kbn-ci-stats-reporter/**/*.{js,mjs,ts,tsx}',
  'src/platform/packages/shared/kbn-connector-specs/**/*.{js,mjs,ts,tsx}',
  'src/platform/packages/shared/kbn-cypress-test-helper/**/*.{js,mjs,ts,tsx}',
  'src/platform/packages/shared/kbn-dev-utils/src/axios/**/*.{js,mjs,ts,tsx}',
  'src/platform/packages/shared/kbn-mcp-dev-server/**/*.{js,mjs,ts,tsx}',
  'x-pack/examples/alerting_example/server/rule_types/**/*.{js,mjs,ts,tsx}',
  'x-pack/packages/kbn-synthetics-private-location/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/packages/shared/kbn-data-forge/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/packages/shared/kbn-evals/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/private/canvas/common/lib/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/private/data_usage/server/services/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/private/indices_metadata/server/lib/services/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/actions/server/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/cloud_connect/server/routes/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/cloud_connect/server/services/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/dataset_quality/server/test_helpers/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/fleet/server/services/agents/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/fleet/server/telemetry/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/inference/scripts/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/observability_ai_assistant/server/functions/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/observability_ai_assistant/server/service/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/osquery/cypress/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/screenshotting/server/browsers/chromium/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/screenshotting/server/browsers/download/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/plugins/shared/stack_connectors/server/connector_types/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/test/alerting_api_integration/common/plugins/alerts/server/sub_action_connector.ts',
  'x-pack/platform/test/alerting_api_integration/security_and_spaces/group4/tests/alerting/mustache_templates.ts',
  'x-pack/platform/test/alerting_api_integration/spaces_only/tests/alerting/group4/mustache_templates.ts',
  'x-pack/platform/test/fleet_api_integration/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/test/fleet_cypress/agent.ts',
  'x-pack/platform/test/fleet_cypress/artifact_manager.ts',
  'x-pack/platform/test/fleet_cypress/fleet_server.ts',
  'x-pack/platform/test/fleet_multi_cluster/**/*.{js,mjs,ts,tsx}',
  'x-pack/platform/test/ui_capabilities/common/services/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/observability/packages/alerting-test-data/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/observability/packages/kbn-evals-suite-obs-ai-assistant/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/observability/packages/kbn-synthetics-forge/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/observability/plugins/apm/scripts/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/observability/plugins/apm/server/test_helpers/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/observability/plugins/observability_ai_assistant_app/scripts/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/observability/plugins/observability_onboarding/server/test_helpers/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/observability/plugins/synthetics/scripts/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/observability/plugins/synthetics/server/synthetics_service/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/observability/plugins/synthetics/server/telemetry/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/observability/test/api_integration/profiling/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/security/packages/kbn-securitysolution-utils/src/axios/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/security/plugins/security_solution/common/endpoint/data_loaders/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/security/plugins/security_solution/common/endpoint/format_axios_error.ts',
  'x-pack/solutions/security/plugins/security_solution/common/endpoint/utils/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/security/plugins/security_solution/scripts/endpoint/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/security/plugins/security_solution/server/integration_tests/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/security/plugins/security_solution/server/lib/telemetry/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/security/test/security_solution_api_integration/config/services/**/*.{js,mjs,ts,tsx}',
  'x-pack/solutions/security/test/security_solution_cypress/cypress/support/**/*.{js,mjs,ts,tsx}',
];

/**
 * Imports that are deprecated and should be phased out
 * They are not restricted until fully removed,
 * but will log a warning
 **/
const DEPRECATED_IMPORTS = [
  {
    name: 'enzyme',
    message:
      'Enzyme is deprecated and no longer maintained. Please use @testing-library/react instead.',
  },
  {
    name: '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib',
    message:
      '`hook_form_lib` is deprecated and will no longer be supported. Consider using `react-hook-form` for new and existing forms.',
  },
];

module.exports = {
  root: true,

  extends: ['@kbn/eslint-config'],

  overrides: [
    /**
     * Temporarily disable some react rules for specific plugins, remove in separate PRs
     */
    {
      files: ['src/platform/plugins/shared/kibana_react/**/*.{js,mjs,ts,tsx}'],
      rules: {
        'react-hooks/rules-of-hooks': 'off',
        'react-hooks/exhaustive-deps': 'off',
      },
    },
    {
      files: ['src/platform/plugins/shared/kibana_utils/**/*.{js,mjs,ts,tsx}'],
      rules: {
        'react-hooks/exhaustive-deps': 'off',
      },
    },
    {
      files: ['x-pack/platform/plugins/private/canvas/**/*.{js,mjs,ts,tsx}'],
      rules: {
        'jsx-a11y/click-events-have-key-events': 'off',
      },
    },
    {
      files: ['x-pack/platform/plugins/private/cross_cluster_replication/**/*.{js,mjs,ts,tsx}'],
      rules: {
        'jsx-a11y/click-events-have-key-events': 'off',
      },
    },
    /**
     * FormatJS linter for i18n code.
     * https://formatjs.io/docs/tooling/linter
     */
    {
      files: [
        'src/**/*.{js,mjs,ts,tsx}',
        'x-pack/**/*.{js,mjs,ts,tsx}',
        'packages/**/*.{js,mjs,ts,tsx}',
        'src/platform/packages/**/*.{js,mjs,ts,tsx}',
        'src/core/packages/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/packages/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/*/packages/**/*.{js,mjs,ts,tsx}',
      ],
      plugins: ['formatjs'],
      rules: {
        'formatjs/enforce-default-message': ['error', 'anything'],
        'formatjs/enforce-description': 'off',
      },
    },
    /**
     * Files that require triple-license headers, settings
     * are overridden below for files that require Elastic
     * Licence headers
     */
    {
      files: ['**/*.{js,mjs,ts,tsx}'],
      rules: {
        '@kbn/eslint/require-license-header': [
          'error',
          {
            license: TRIPLE_ELV2_SSPL1_AGPL3_LICENSE_HEADER,
          },
        ],
        '@kbn/eslint/disallow-license-headers': [
          'error',
          {
            licenses: [
              APACHE_2_0_LICENSE_HEADER,
              DUAL_ELV2_SSPL1_LICENSE_HEADER,
              DUAL_ELV1_SSPL1_LICENSE_HEADER,
              ELV2_LICENSE_HEADER,
              OLD_ELASTIC_LICENSE_HEADER,
              SAFER_LODASH_SET_HEADER,
              SAFER_LODASH_SET_LODASH_HEADER,
              SAFER_LODASH_SET_DEFINITELYTYPED_HEADER,
              KBN_HANDLEBARS_HEADER,
              KBN_HANDLEBARS_HANDLEBARS_HEADER,
              VENN_DIAGRAM_HEADER,
            ],
          },
        ],
      },
    },

    /**
     * Files that require Apache headers
     */
    {
      files: [
        'packages/kbn-eslint-config/**/*.{js,mjs,ts,tsx}',
        'src/platform/packages/shared/kbn-datemath/**/*.{js,mjs,ts,tsx}',
      ],
      rules: {
        '@kbn/eslint/require-license-header': [
          'error',
          {
            license: APACHE_2_0_LICENSE_HEADER,
          },
        ],
        '@kbn/eslint/disallow-license-headers': [
          'error',
          {
            licenses: [
              TRIPLE_ELV2_SSPL1_AGPL3_LICENSE_HEADER,
              DUAL_ELV2_SSPL1_LICENSE_HEADER,
              DUAL_ELV1_SSPL1_LICENSE_HEADER,
              ELV2_LICENSE_HEADER,
              OLD_ELASTIC_LICENSE_HEADER,
              SAFER_LODASH_SET_HEADER,
              SAFER_LODASH_SET_LODASH_HEADER,
              SAFER_LODASH_SET_DEFINITELYTYPED_HEADER,
              KBN_HANDLEBARS_HEADER,
              KBN_HANDLEBARS_HANDLEBARS_HEADER,
              VENN_DIAGRAM_HEADER,
            ],
          },
        ],
      },
    },

    /**
     * New Platform client-side
     */
    {
      files: ['{src,x-pack}/plugins/*/public/**/*.{js,mjs,ts,tsx}'],
      rules: {
        'import/no-commonjs': 'error',
      },
    },

    /**
     * Files that require Elastic license headers instead of dual-license header
     */
    {
      files: ['x-pack/**/*.{js,mjs,ts,tsx}'],
      rules: {
        '@kbn/eslint/require-license-header': [
          'error',
          {
            license: ELV2_LICENSE_HEADER,
          },
        ],
        '@kbn/eslint/disallow-license-headers': [
          'error',
          {
            licenses: [
              APACHE_2_0_LICENSE_HEADER,
              TRIPLE_ELV2_SSPL1_AGPL3_LICENSE_HEADER,
              DUAL_ELV2_SSPL1_LICENSE_HEADER,
              DUAL_ELV1_SSPL1_LICENSE_HEADER,
              OLD_ELASTIC_LICENSE_HEADER,
              SAFER_LODASH_SET_HEADER,
              SAFER_LODASH_SET_LODASH_HEADER,
              SAFER_LODASH_SET_DEFINITELYTYPED_HEADER,
              KBN_HANDLEBARS_HEADER,
              KBN_HANDLEBARS_HANDLEBARS_HEADER,
              VENN_DIAGRAM_HEADER,
            ],
          },
        ],
      },
    },

    /**
     * safer-lodash-set package requires special license headers
     */
    {
      files: ['src/platform/packages/shared/kbn-safer-lodash-set/**/*.{js,mjs,ts,tsx}'],
      rules: {
        '@kbn/eslint/require-license-header': [
          'error',
          {
            license: SAFER_LODASH_SET_LODASH_HEADER,
          },
        ],
        '@kbn/eslint/disallow-license-headers': [
          'error',
          {
            licenses: [
              APACHE_2_0_LICENSE_HEADER,
              TRIPLE_ELV2_SSPL1_AGPL3_LICENSE_HEADER,
              DUAL_ELV2_SSPL1_LICENSE_HEADER,
              DUAL_ELV1_SSPL1_LICENSE_HEADER,
              ELV2_LICENSE_HEADER,
              OLD_ELASTIC_LICENSE_HEADER,
              SAFER_LODASH_SET_HEADER,
              SAFER_LODASH_SET_DEFINITELYTYPED_HEADER,
              KBN_HANDLEBARS_HEADER,
              KBN_HANDLEBARS_HANDLEBARS_HEADER,
              VENN_DIAGRAM_HEADER,
            ],
          },
        ],
      },
    },

    {
      files: ['src/platform/packages/shared/kbn-safer-lodash-set/test/*.{js,mjs,ts,tsx}'],
      rules: {
        '@kbn/eslint/require-license-header': [
          'error',
          {
            license: SAFER_LODASH_SET_HEADER,
          },
        ],
        '@kbn/eslint/disallow-license-headers': [
          'error',
          {
            licenses: [
              APACHE_2_0_LICENSE_HEADER,
              TRIPLE_ELV2_SSPL1_AGPL3_LICENSE_HEADER,
              DUAL_ELV2_SSPL1_LICENSE_HEADER,
              DUAL_ELV1_SSPL1_LICENSE_HEADER,
              ELV2_LICENSE_HEADER,
              OLD_ELASTIC_LICENSE_HEADER,
              SAFER_LODASH_SET_LODASH_HEADER,
              SAFER_LODASH_SET_DEFINITELYTYPED_HEADER,
              KBN_HANDLEBARS_HEADER,
              KBN_HANDLEBARS_HANDLEBARS_HEADER,
              VENN_DIAGRAM_HEADER,
            ],
          },
        ],
      },
    },
    {
      files: ['src/platform/packages/shared/kbn-safer-lodash-set/**/*.d.ts'],
      rules: {
        '@kbn/eslint/require-license-header': [
          'error',
          {
            license: SAFER_LODASH_SET_DEFINITELYTYPED_HEADER,
          },
        ],
        '@kbn/eslint/disallow-license-headers': [
          'error',
          {
            licenses: [
              APACHE_2_0_LICENSE_HEADER,
              TRIPLE_ELV2_SSPL1_AGPL3_LICENSE_HEADER,
              DUAL_ELV2_SSPL1_LICENSE_HEADER,
              DUAL_ELV1_SSPL1_LICENSE_HEADER,
              ELV2_LICENSE_HEADER,
              OLD_ELASTIC_LICENSE_HEADER,
              SAFER_LODASH_SET_HEADER,
              SAFER_LODASH_SET_LODASH_HEADER,
              KBN_HANDLEBARS_HEADER,
              KBN_HANDLEBARS_HANDLEBARS_HEADER,
              VENN_DIAGRAM_HEADER,
            ],
          },
        ],
      },
    },

    /**
     * @kbn/handlebars package requires special license headers
     */
    {
      files: ['src/platform/packages/private/kbn-handlebars/**/*.{js,mjs,ts,tsx}'],
      rules: {
        '@kbn/eslint/require-license-header': [
          'error',
          {
            license: KBN_HANDLEBARS_HEADER,
          },
        ],
        '@kbn/eslint/disallow-license-headers': [
          'error',
          {
            licenses: [
              APACHE_2_0_LICENSE_HEADER,
              TRIPLE_ELV2_SSPL1_AGPL3_LICENSE_HEADER,
              DUAL_ELV2_SSPL1_LICENSE_HEADER,
              DUAL_ELV1_SSPL1_LICENSE_HEADER,
              ELV2_LICENSE_HEADER,
              OLD_ELASTIC_LICENSE_HEADER,
              SAFER_LODASH_SET_HEADER,
              SAFER_LODASH_SET_LODASH_HEADER,
              SAFER_LODASH_SET_DEFINITELYTYPED_HEADER,
              KBN_HANDLEBARS_HANDLEBARS_HEADER,
              VENN_DIAGRAM_HEADER,
            ],
          },
        ],
      },
    },
    {
      files: ['src/platform/packages/private/kbn-handlebars/src/spec/**/*.{js,mjs,ts,tsx}'],
      rules: {
        '@kbn/eslint/require-license-header': [
          'error',
          {
            license: KBN_HANDLEBARS_HANDLEBARS_HEADER,
          },
        ],
        '@kbn/eslint/disallow-license-headers': [
          'error',
          {
            licenses: [
              APACHE_2_0_LICENSE_HEADER,
              TRIPLE_ELV2_SSPL1_AGPL3_LICENSE_HEADER,
              DUAL_ELV2_SSPL1_LICENSE_HEADER,
              DUAL_ELV1_SSPL1_LICENSE_HEADER,
              ELV2_LICENSE_HEADER,
              OLD_ELASTIC_LICENSE_HEADER,
              SAFER_LODASH_SET_HEADER,
              SAFER_LODASH_SET_LODASH_HEADER,
              SAFER_LODASH_SET_DEFINITELYTYPED_HEADER,
              KBN_HANDLEBARS_HEADER,
              VENN_DIAGRAM_HEADER,
            ],
          },
        ],
      },
    },

    /**
     * venn.js fork requires special license headers
     */
    {
      files: [
        'x-pack/platform/plugins/private/graph/public/components/venn_diagram/vennjs/**/*.{js,mjs,ts,tsx}',
      ],
      rules: {
        '@kbn/eslint/require-license-header': [
          'error',
          {
            license: VENN_DIAGRAM_HEADER,
          },
        ],
        '@kbn/eslint/disallow-license-headers': [
          'error',
          {
            licenses: [
              APACHE_2_0_LICENSE_HEADER,
              TRIPLE_ELV2_SSPL1_AGPL3_LICENSE_HEADER,
              DUAL_ELV2_SSPL1_LICENSE_HEADER,
              DUAL_ELV1_SSPL1_LICENSE_HEADER,
              ELV2_LICENSE_HEADER,
              OLD_ELASTIC_LICENSE_HEADER,
              SAFER_LODASH_SET_HEADER,
              SAFER_LODASH_SET_LODASH_HEADER,
              SAFER_LODASH_SET_DEFINITELYTYPED_HEADER,
              KBN_HANDLEBARS_HEADER,
              KBN_HANDLEBARS_HANDLEBARS_HEADER,
            ],
          },
        ],
      },
    },

    /**
     * Allow default exports
     */
    {
      files: [
        '**/*.stories.tsx',
        '**/*.test.js',
        'src/platform/test/*/config.ts',
        'src/platform/test/*/config_open.ts',
        'src/platform/test/*/*.config.ts',
        'src/platform/test/*/{tests,test_suites,apis,apps}/**/*',
        'src/platform/test/server_integration/**/*.ts',
        'x-pack/solutions/observability/plugins/apm/**/*.js',
        'x-pack/platform/test/*/{tests,test_suites,apis,apps}/**/*',
        'x-pack/platform/test/*api_integration*/**/*',
        'x-pack/platform/test/*/*config.*ts',
        'x-pack/solutions/*/test/**/{tests,test_suites,apis,apps,fixtures,index.ts}/**/*',
        'x-pack/solutions/*/test/**/*config*.ts',
        'x-pack/solutions/*/test/**/tests/**/*',
        'x-pack/solutions/*/test/api_integration_deployment_agnostic/*configs/**/*',
        'x-pack/solutions/*/test/alerting_api_integration/**/*',
        'x-pack/solutions/*/test/serverless/*/configs/**/*',
        'x-pack/platform/test/saved_object_api_integration/*/apis/**/*',
        'x-pack/platform/test/ui_capabilities/*/tests/**/*',
        'x-pack/platform/test/upgrade_assistant_integration/**/*',
        '**/cypress.config.{js,ts}',
        'x-pack/platform/test/serverless/shared/config*.ts',
        'x-pack/platform/test/serverless/*/test_suites/**/*',
        'x-pack/platform/test/serverless/functional/config*.ts',
        'x-pack/platform/test/serverless/*/configs/**/*',
        'x-pack/solutions/security/test/security_solution_api_integration/*/test_suites/**/*',
        'x-pack/solutions/security/test/security_solution_api_integration/**/config*.ts',
        '**/playwright.config.ts',
        '**/playwright.v2.config.ts',
        '**/*.playwright.config.ts',
        '**/parallel.playwright.config.ts',
      ],
      rules: {
        'import/no-default-export': 'off',
        'import/no-named-as-default-member': 'off',
        'import/no-named-as-default': 'off',
      },
    },

    /**
     * Single package.json rules, it tells eslint to ignore the child package.json files
     * and look for dependencies declarations in the single and root level package.json
     */
    {
      files: ['{src,x-pack,packages}/**/*.{js,mjs,ts,tsx}'],
      rules: {
        'import/no-extraneous-dependencies': [
          'error',
          {
            /* Files that ARE allowed to use devDependencies */
            devDependencies: [...DEV_PATTERNS],
            peerDependencies: true,
            packageDir: __dirname,
          },
        ],
      },
    },

    /**
     * Files that run BEFORE node version check
     */
    {
      files: ['scripts/**/*.js', 'src/setup_node_env/**/*.js'],
      rules: {
        'import/no-commonjs': 'off',
        'prefer-object-spread': 'off',
        'no-var': 'off',
        'prefer-const': 'off',
        'prefer-destructuring': 'off',
        'no-restricted-syntax': [
          'error',
          'ImportDeclaration',
          'ExportNamedDeclaration',
          'ExportDefaultDeclaration',
          'ExportAllDeclaration',
          'ArrowFunctionExpression',
          'AwaitExpression',
          'ClassDeclaration',
          'RestElement',
          'SpreadElement',
          'YieldExpression',
          'VariableDeclaration[kind="const"]',
          'VariableDeclaration[kind="let"]',
          'VariableDeclarator[id.type="ArrayPattern"]',
          'VariableDeclarator[id.type="ObjectPattern"]',
        ],
      },
    },

    /**
     * Files that run in the browser with only node-level transpilation
     */
    {
      files: [
        'src/platform/packages/shared/kbn-ftr-common-functional-ui-services/services/web_element_wrapper/scroll_into_view_if_necessary.js',
        '**/browser_exec_scripts/**/*.js',
      ],
      rules: {
        'prefer-object-spread': 'off',
        'no-var': 'off',
        'prefer-const': 'off',
        'prefer-destructuring': 'off',
        'no-restricted-syntax': [
          'error',
          'ArrowFunctionExpression',
          'AwaitExpression',
          'ClassDeclaration',
          'ImportDeclaration',
          'RestElement',
          'SpreadElement',
          'YieldExpression',
          'VariableDeclaration[kind="const"]',
          'VariableDeclaration[kind="let"]',
          'VariableDeclarator[id.type="ArrayPattern"]',
          'VariableDeclarator[id.type="ObjectPattern"]',
        ],
      },
    },

    /**
     * Files that run AFTER node version check
     * and are not also transpiled with babel
     */
    {
      files: [
        '.eslintrc.js',
        'packages/kbn-eslint-plugin-eslint/**/*',
        'x-pack/gulpfile.js',
        'x-pack/scripts/*.js',
        '**/jest.config.js',
      ],
      excludedFiles: ['**/integration_tests/**/*'],
      rules: {
        'import/no-commonjs': 'off',
        'prefer-object-spread': 'off',
        'no-restricted-syntax': [
          'error',
          'ImportDeclaration',
          'ExportNamedDeclaration',
          'ExportDefaultDeclaration',
          'ExportAllDeclaration',
        ],
      },
    },
    /**
     * Jest specific rules
     */
    {
      files: ['**/*.test.{js,mjs,ts,tsx}'],
      rules: {
        'jest/valid-describe-callback': 'error',
      },
    },

    /**
     * Harden specific rules
     */
    {
      files: [
        'src/platform/test/harden/*.js',
        'src/platform/packages/shared/kbn-safer-lodash-set/test/*.js',
      ],
      rules: {
        'mocha/handle-done-callback': 'off',
      },
    },
    {
      files: ['**/*.{js,mjs,ts,tsx}'],
      rules: {
        '@kbn/eslint/no_unsafe_dynamic_http_path': 'warn',
        '@kbn/eslint/no_wrapped_error_in_logger': 'error',
        '@kbn/eslint/no_npx_playwright': 'error',
        'no-restricted-imports': ['error', ...RESTRICTED_IMPORTS],
        '@kbn/eslint/no_deprecated_imports': [
          'warn',
          {
            paths: DEPRECATED_IMPORTS,
            patterns: [
              {
                group: ['@kbn/es-ui-shared-plugin/static/forms/hook_form_lib/**'],
                message:
                  '`hook_form_lib` is deprecated and will no longer be supported. Consider using `react-hook-form` for new and existing forms.',
              },
            ],
          },
        ],
        'no-restricted-modules': [
          'error',
          {
            name: 'lodash.set',
            message: 'Please use @kbn/safer-lodash-set instead',
          },
          {
            name: 'lodash.setwith',
            message: 'Please use @kbn/safer-lodash-set instead',
          },
          {
            name: 'lodash.template',
            message:
              'lodash.template is unsafe, and not compatible with our content security policy.',
          },
          {
            name: 'lodash/set',
            message: 'Please use @kbn/safer-lodash-set/set instead',
          },
          {
            name: 'lodash/setWith',
            message: 'Please use @kbn/safer-lodash-set/setWith instead',
          },
          {
            name: 'lodash/fp/set',
            message: 'Please use @kbn/safer-lodash-set/fp/set instead',
          },
          {
            name: 'lodash/fp/setWith',
            message: 'Please use @kbn/safer-lodash-set/fp/setWith instead',
          },
          {
            name: 'lodash/fp/assoc',
            message: 'Please use @kbn/safer-lodash-set/fp/assoc instead',
          },
          {
            name: 'lodash/fp/assocPath',
            message: 'Please use @kbn/safer-lodash-set/fp/assocPath instead',
          },
          {
            name: 'lodash/fp/template',
            message:
              'lodash.template is unsafe, and not compatible with our content security policy.',
          },
          {
            name: 'lodash/template',
            message:
              'lodash.template is unsafe, and not compatible with our content security policy.',
          },
        ],
        'no-restricted-properties': [
          'error',
          {
            object: 'lodash',
            property: 'set',
            message: 'Please use @kbn/safer-lodash-set instead',
          },
          {
            object: '_',
            property: 'set',
            message: 'Please use @kbn/safer-lodash-set instead',
          },
          {
            object: 'lodash',
            property: 'setWith',
            message: 'Please use @kbn/safer-lodash-set instead',
          },
          {
            object: '_',
            property: 'setWith',
            message: 'Please use @kbn/safer-lodash-set instead',
          },
          {
            object: 'lodash',
            property: 'assoc',
            message: 'Please use @kbn/safer-lodash-set instead',
          },
          {
            object: '_',
            property: 'assoc',
            message: 'Please use @kbn/safer-lodash-set instead',
          },
          {
            object: 'lodash',
            property: 'assocPath',
            message: 'Please use @kbn/safer-lodash-set instead',
          },
          {
            object: '_',
            property: 'assocPath',
            message: 'Please use @kbn/safer-lodash-set instead',
          },
          {
            object: 'lodash',
            property: 'template',
            message:
              'lodash.template is unsafe, and not compatible with our content security policy.',
          },
          {
            object: '_',
            property: 'template',
            message:
              'lodash.template is unsafe, and not compatible with our content security policy.',
          },
        ],
      },
    },
    {
      files: ['**/common/**/*.{js,mjs,ts,tsx}', '**/public/**/*.{js,mjs,ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          ...RESTRICTED_IMPORTS,
          {
            name: 'semver',
            message: 'Please use "semver/*/{function}" instead',
          },
        ],
      },
    },
    {
      files: ['x-pack/platform/plugins/shared/fields_metadata/**/*.{js,mjs,ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          // Exclude @elastic/ecs from restricted imports for the fields metadata plugin.
          ...RESTRICTED_IMPORTS.filter(({ name }) => name !== '@elastic/ecs'),
        ],
      },
    },

    /**
     * APM, UX and Observability overrides
     */
    {
      files: [
        'x-pack/solutions/observability/plugins/apm/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/observability/plugins/observability/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/observability/plugins/exploratory_view/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/observability/plugins/ux/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/observability/plugins/slo/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/observability/packages/**/*.{js,mjs,ts,tsx}',
      ],
      rules: {
        'no-console': ['warn', { allow: ['error'] }],
        'react/function-component-definition': [
          'warn',
          {
            namedComponents: 'function-declaration',
            unnamedComponents: 'arrow-function',
          },
        ],
        'react-hooks/rules-of-hooks': 'error', // Checks rules of Hooks
      },
    },
    {
      files: [
        'x-pack/solutions/observability/plugins/apm/**/*.stories.*',
        'x-pack/solutions/observability/plugins/observability/**/*.stories.*',
        'x-pack/solutions/observability/plugins/exploratory_view/**/*.stories.*',
        'x-pack/solutions/observability/plugins/slo/**/*.stories.*',
        'x-pack/solutions/observability/packages/**/*.{js,mjs,ts,tsx}',
      ],
      rules: {
        'react/function-component-definition': [
          'off',
          {
            namedComponents: 'function-declaration',
            unnamedComponents: 'arrow-function',
          },
        ],
      },
    },
    {
      files: [
        'x-pack/platform/plugins/shared/observability_solution/**/*.{ts,tsx}',
        'x-pack/solutions/observability/plugins/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/{streams,streams_app}/**/*.{ts,tsx}',
        'x-pack/solutions/observability/packages/**/*.{ts,tsx}',
      ],
      rules: {
        'react-hooks/exhaustive-deps': [
          'error',
          {
            additionalHooks:
              '^(useUrl|useAbortableAsync|useMemoWithAbortSignal|useFetcher|useProgressiveFetcher|useBreadcrumb|useAsync|useTimeRangeAsync|useAutoAbortedHttpClient|use.*Fetch)$',
          },
        ],
      },
    },
    {
      files: [
        'x-pack/platform/plugins/shared/aiops/**/*.tsx',
        'x-pack/platform/plugins/shared/observability_solution/**/*.{ts,tsx}',
        'x-pack/solutions/observability/plugins/**/*.{ts,tsx}',
        'src/platform/plugins/shared/ai_assistant_management/**/*.tsx',
        'x-pack/solutions/observability/packages/**/*.{ts,tsx}',
      ],
      rules: {
        '@kbn/telemetry/event_generating_elements_should_be_instrumented': 'error',
      },
    },
    {
      files: [
        'x-pack/solutions/search/**/*.tsx',
        'x-pack/platform/plugins/shared/content_connectors/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/search_inference_endpoints/**/*.{ts,tsx}',
      ],
      rules: {
        '@kbn/telemetry/event_generating_elements_should_be_instrumented': 'warn',
      },
    },
    {
      files: [
        'x-pack/solutions/observability/plugins/**/!(*.stories.tsx|*.test.tsx|*.storybook_decorator.tsx|*.mock.tsx)',
        'x-pack/solutions/observability/packages/**/!(*.stories.tsx|*.test.tsx|*.storybook_decorator.tsx|*.mock.tsx)',
        'src/platform/plugins/shared/ai_assistant_management/**/!(*.stories.tsx|*.test.tsx|*.storybook_decorator.tsx|*.mock.tsx)',
        'x-pack/platform/plugins/shared/streams_app/**/!(*.stories.tsx|*.test.tsx|*.storybook_decorator.tsx|*.mock.tsx)',
        'src/platform/packages/shared/kbn-unified-chart-section-viewer/**/!(*.stories.tsx|*.test.tsx|*.storybook_decorator.tsx|*.mock.tsx)',
      ],
      rules: {
        '@kbn/i18n/strings_should_be_translated_with_i18n': 'warn',
        '@kbn/i18n/i18n_translate_should_start_with_the_right_id': 'warn',
        '@kbn/i18n/formatted_message_should_start_with_the_right_id': 'warn',
      },
    },
    {
      // require explicit return types in route handlers for performance reasons
      files: ['x-pack/solutions/observability/plugins/apm/server/**/route.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': [
          'error',
          {
            allowTypedFunctionExpressions: false,
          },
        ],
      },
    },
    {
      files: [
        'x-pack/solutions/observability/plugins/apm/**/*.{ts,tsx}',
        'x-pack/solutions/observability/plugins/apm_data_access/**/*.{ts,tsx}',
        'x-pack/solutions/observability/plugins/infra/**/*.{ts,tsx}',
        'x-pack/solutions/observability/plugins/inventory/**/*.{ts,tsx}',
        'x-pack/solutions/observability/plugins/metrics_data_access/**/*.{ts,tsx}',
        'x-pack/solutions/observability/plugins/profiling/**/*.{ts,tsx}',
        'x-pack/solutions/observability/plugins/profiling_data_access/**/*.{ts,tsx}',
      ],
    },

    /**
     * Fleet overrides
     */
    {
      files: ['x-pack/platform/plugins/shared/fleet/**/*.{js,mjs,ts,tsx}'],
      plugins: ['testing-library'],
      rules: {
        'testing-library/await-async-utils': 'error',
        'import/order': [
          'warn',
          {
            groups: ['builtin', 'external', 'internal', 'parent'],
            'newlines-between': 'always-and-inside-groups',
          },
        ],
      },
    },

    /**
     * Automatic Import overrides
     */
    {
      // front end and common typescript and javascript files only
      files: [
        'x-pack/platform/plugins/shared/automatic_import/public/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/plugins/shared/automatic_import/common/**/*.{js,mjs,ts,tsx}',
      ],
      rules: {
        'import/no-nodejs-modules': 'error',
        'no-duplicate-imports': 'off',
        'import/no-duplicates': 'error',
        'no-restricted-imports': [
          'error',
          {
            // prevents UI code from importing server side code and then webpack including it when doing builds
            patterns: ['**/server/*'],
            paths: RESTRICTED_IMPORTS,
          },
        ],
      },
    },
    {
      files: [
        'x-pack/platform/plugins/shared/automatic_import/public/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/automatic_import/common/**/*.{ts,tsx}',
      ],
    },

    /**
     * ML overrides
     */
    {
      files: [
        'x-pack/platform/plugins/shared/aiops/**/*.{ts,tsx}',
        'x-pack/platform/plugins/private/data_visualizer/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/ml/**/*.{ts,tsx}',
        'x-pack/platform/plugins/private/transform/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/ml/**/*.{ts,tsx}',
        'x-pack/platform/packages/private/ml/**/*.{ts,tsx}',
        'x-pack/platform/plugins/private/file_upload/**/*.{ts,tsx}',
      ],
    },

    /**
     * Security Solution overrides. These rules below are maintained and owned by
     * the people within the security-detection-engine team. Please see ping them
     * or check with them if you are encountering issues, have suggestions, or would
     * like to add, change, or remove any particular rule. Linters, Typescript, and rules
     * evolve and change over time just like coding styles, so please do not hesitate to
     * reach out.
     */
    {
      // front end and common typescript and javascript files only
      files: [
        'x-pack/solutions/security/plugins/ecs_data_quality_dashboard/common/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/elastic_assistant/common/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/packages/shared/kbn-elastic-assistant/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/packages/shared/kbn-elastic-assistant-common/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/packages/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution/public/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution_ess/public/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution_serverless/public/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution/common/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution_ess/common/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution_serverless/common/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/timelines/public/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/timelines/common/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/plugins/shared/cases/public/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/plugins/shared/cases/common/**/*.{js,mjs,ts,tsx}',
        'src/platform/packages/shared/kbn-cell-actions/**/*.{js,mjs,ts,tsx}',
      ],
      rules: {
        'import/no-nodejs-modules': 'error',
        'no-duplicate-imports': 'off',
        'import/no-duplicates': ['error'],
        'no-restricted-imports': [
          'error',
          {
            // prevents UI code from importing server side code and then webpack including it when doing builds
            patterns: ['**/server/*'],
            paths: RESTRICTED_IMPORTS,
          },
        ],
      },
    },
    // Allow node.js imports for security solution test packages
    {
      files: ['x-pack/solutions/security/packages/test-api-clients/**/*.{js,mjs,ts,tsx}'],
      rules: {
        'import/no-nodejs-modules': 'off',
      },
    },
    {
      // typescript only for front and back end, but excludes the test files.
      // We use this section to add rules in which we do not want to apply to test files.
      // This should be a very small set as most linter rules are useful for tests as well.
      files: [
        'x-pack/solutions/security/plugins/ecs_data_quality_dashboard/**/*.{ts,tsx}',
        'x-pack/solutions/security/plugins/elastic_assistant/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/automatic_import/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-elastic-assistant/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-elastic-assistant-common/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-langchain/**/*.{ts,tsx}',
        'x-pack/solutions/security/packages/**/*.{ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution/**/*.{ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution_ess/**/*.{ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution_serverless/**/*.{ts,tsx}',
        'x-pack/solutions/security/plugins/timelines/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/cases/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-cell-actions/**/*.{js,mjs,ts,tsx}',
      ],
      excludedFiles: [
        'x-pack/solutions/security/plugins/ecs_data_quality_dashboard/**/*.{test,mock,test_helper}.{ts,tsx}',
        'x-pack/solutions/security/plugins/elastic_assistant/**/*.{test,mock,test_helper}.{ts,tsx}',
        'x-pack/platform/plugins/shared/automatic_import/**/*.{test,mock,test_helper}.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-elastic-assistant/**/*.{test,mock,test_helper}.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-elastic-assistant-common/**/*.{test,mock,test_helper}.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-langchain/**/*.{test,mock,test_helper}.{ts,tsx}',
        'x-pack/solutions/security/packages/**/*.{test,mock,test_helper}.{ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution/**/*.{test,mock,test_helper}.{ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution_ess/**/*.{test,mock,test_helper}.{ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution_serverless/**/*.{test,mock,test_helper}.{ts,tsx}',
        'x-pack/solutions/security/plugins/timelines/**/*.{test,mock,test_helper}.{ts,tsx}',
        'x-pack/platform/plugins/shared/cases/**/*.{test,mock,test_helper}.{ts,tsx}',
        'src/platform/packages/shared/kbn-cell-actions/**/*.{test,mock,test_helper}.{ts,tsx}',
      ],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'error',
      },
    },
    {
      // typescript only for front and back end
      files: [
        'x-pack/solutions/security/plugins/ecs_data_quality_dashboard/**/*.{ts,tsx}',
        'x-pack/solutions/security/plugins/elastic_assistant/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/automatic_import/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-elastic-assistant/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-elastic-assistant-common/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-langchain/**/*.{ts,tsx}',
        'x-pack/solutions/security/packages/**/*.{ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution/**/*.{ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution_ess/**/*.{ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution_serverless/**/*.{ts,tsx}',
        'x-pack/solutions/security/plugins/timelines/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/cases/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-cell-actions/**/*.{ts,tsx}',
      ],
      rules: {
        '@typescript-eslint/no-this-alias': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-useless-constructor': 'error',
        '@typescript-eslint/unified-signatures': 'error',
        'no-restricted-imports': [
          'error',
          {
            // prevents code from importing files that contain the name "legacy" within their name. This is a mechanism
            // to help deprecation and prevent accidental re-use/continued use of code we plan on removing. If you are
            // finding yourself turning this off a lot for "new code" consider renaming the file and functions if it is has valid uses.
            patterns: ['*legacy*'],
            paths: RESTRICTED_IMPORTS,
          },
        ],
      },
    },
    {
      // typescript and javascript for front and back end
      files: [
        'x-pack/solutions/security/plugins/ecs_data_quality_dashboard/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/elastic_assistant/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/plugins/shared/automatic_import/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/packages/shared/kbn-elastic-assistant/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/packages/shared/kbn-elastic-assistant-common/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/packages/shared/kbn-langchain/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/packages/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution_ess/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/security_solution_serverless/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/timelines/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/plugins/shared/cases/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/packages/data-stream-adapter/**/*.{js,mjs,ts,tsx}',
        'src/platform/packages/shared/kbn-cell-actions/**/*.{js,mjs,ts,tsx}',
      ],
      plugins: ['eslint-plugin-node', 'react'],
      env: {
        jest: true,
      },
      rules: {
        'accessor-pairs': 'error',
        'array-callback-return': 'error',
        'no-array-constructor': 'error',
        complexity: 'warn',
        'node/no-deprecated-api': 'error',
        'no-bitwise': 'error',
        'no-continue': 'error',
        'no-dupe-keys': 'error',
        'no-duplicate-case': 'error',
        'no-duplicate-imports': 'off',
        'no-empty-character-class': 'error',
        'no-empty-pattern': 'error',
        'no-ex-assign': 'error',
        'no-extend-native': 'error',
        'no-extra-bind': 'error',
        'no-extra-boolean-cast': 'error',
        'no-extra-label': 'error',
        'no-func-assign': 'error',
        'no-implicit-globals': 'error',
        'no-implied-eval': 'error',
        'no-invalid-regexp': 'error',
        'no-inner-declarations': 'error',
        'no-lone-blocks': 'error',
        'no-multi-assign': 'error',
        'no-misleading-character-class': 'error',
        'no-new-symbol': 'error',
        'no-obj-calls': 'error',
        'no-param-reassign': 'error',
        'no-process-exit': 'error',
        'no-prototype-builtins': 'error',
        'no-return-await': 'error',
        'no-self-compare': 'error',
        'no-shadow-restricted-names': 'error',
        'no-sparse-arrays': 'error',
        'no-this-before-super': 'error',
        // rely on typescript
        'no-undef': 'off',
        'no-unreachable': 'error',
        'no-unsafe-finally': 'error',
        'no-useless-call': 'error',
        'no-useless-catch': 'error',
        'no-useless-concat': 'error',
        'no-useless-computed-key': 'error',
        'no-useless-rename': 'error',
        'no-useless-return': 'error',
        'one-var-declaration-per-line': 'error',
        'prefer-object-spread': 'error',
        'prefer-promise-reject-errors': 'error',
        'prefer-rest-params': 'error',
        'prefer-spread': 'error',
        'prefer-template': 'error',
        'react/boolean-prop-naming': 'error',
        'react/button-has-type': 'error',
        'react/display-name': 'error',
        'react/forbid-dom-props': 'error',
        'react/no-access-state-in-setstate': 'error',
        'react/no-children-prop': 'error',
        'react/no-danger-with-children': 'error',
        'react/no-deprecated': 'error',
        'react/no-did-mount-set-state': 'error',
        'react/no-direct-mutation-state': 'error',
        'react/no-find-dom-node': 'error',
        'react/no-redundant-should-component-update': 'error',
        'react/no-render-return-value': 'error',
        'react/no-typos': 'error',
        'react/no-string-refs': 'error',
        'react/no-this-in-sfc': 'error',
        'react/no-unescaped-entities': 'error',
        'react/no-unsafe': 'error',
        'react/no-unused-prop-types': 'error',
        'react/no-unused-state': 'error',
        'react/sort-default-props': 'error',
        'react/void-dom-elements-no-children': 'error',
        'react/jsx-no-comment-textnodes': 'error',
        'react/jsx-no-literals': 'error',
        'react/jsx-no-target-blank': 'error',
        'react/jsx-fragments': 'error',
        'require-atomic-updates': 'error',
        'symbol-description': 'error',
        'vars-on-top': 'error',
        'import/no-duplicates': ['error'],
      },
      overrides: [
        {
          files: [
            'x-pack/platform/plugins/shared/cases/**/*.{ts,tsx}',
            'x-pack/solutions/security/plugins/ecs_data_quality_dashboard/**/*.{ts,tsx}',
            'x-pack/solutions/security/plugins/security_solution/**/*.{ts,tsx}',
            'x-pack/solutions/security/plugins/security_solution_ess/**/*.{ts,tsx}',
            'x-pack/solutions/security/plugins/security_solution_serverless/**/*.{ts,tsx}',
            'x-pack/solutions/security/packages/data-stream-adapter/**/*.{ts,tsx}',
            'x-pack/solutions/security/packages/features/**/*.{ts,tsx}',
            'x-pack/solutions/security/packages/navigation/**/*.{ts,tsx}',
            'src/platform/packages/shared/kbn-cell-actions/**/*.{ts,tsx}',
          ],
        },
      ],
    },
    {
      files: ['x-pack/platform/plugins/shared/cases/public/**/*.{js,mjs,ts,tsx}'],
      excludedFiles: ['x-pack/platform/plugins/shared/cases/**/*.{test,mock,test_helper}.{ts,tsx}'],
      rules: {
        'react/display-name': ['error', { ignoreTranspilerName: true }],
      },
    },
    {
      files: ['x-pack/platform/plugins/shared/cases/**/*.{test,mock,test_helper}.tsx'],
      extends: ['plugin:testing-library/react'],
    },

    /**
     * Lists overrides. These rules below are maintained and owned by
     * the people within the security-detection-engine team. Please see ping them
     * or check with them if you are encountering issues, have suggestions, or would
     * like to add, change, or remove any particular rule. Linters, Typescript, and rules
     * evolve and change over time just like coding styles, so please do not hesitate to
     * reach out.
     */
    {
      // front end and common typescript and javascript files only
      files: [
        'x-pack/solutions/security/plugins/lists/public/**/*.{js,mjs,ts,tsx}',
        'x-pack/solutions/security/plugins/lists/common/**/*.{js,mjs,ts,tsx}',
      ],
      rules: {
        'import/no-nodejs-modules': 'error',
        'no-restricted-imports': [
          'error',
          {
            // prevents UI code from importing server side code and then webpack including it when doing builds
            patterns: ['**/server/*'],
            paths: RESTRICTED_IMPORTS,
          },
        ],
      },
    },
    {
      // typescript for /public and /common
      files: [
        'x-pack/solutions/security/plugins/lists/public/*.{ts,tsx}',
        'x-pack/solutions/security/plugins/lists/common/*.{ts,tsx}',
      ],
      rules: {
        '@typescript-eslint/no-for-in-array': 'error',
      },
    },
    {
      // typescript for /public and /common
      files: [
        'x-pack/solutions/security/plugins/lists/public/*.{ts,tsx}',
        'x-pack/solutions/security/plugins/lists/common/*.{ts,tsx}',
      ],
      plugins: ['react'],
      env: {
        jest: true,
      },
      rules: {
        'react/boolean-prop-naming': 'error',
        'react/button-has-type': 'error',
        'react/display-name': 'error',
        'react/forbid-dom-props': 'error',
        'react/no-access-state-in-setstate': 'error',
        'react/no-children-prop': 'error',
        'react/no-danger-with-children': 'error',
        'react/no-deprecated': 'error',
        'react/no-did-mount-set-state': 'error',
        'react/no-did-update-set-state': 'error',
        'react/no-direct-mutation-state': 'error',
        'react/no-find-dom-node': 'error',
        'react/no-redundant-should-component-update': 'error',
        'react/no-render-return-value': 'error',
        'react/no-typos': 'error',
        'react/no-string-refs': 'error',
        'react/no-this-in-sfc': 'error',
        'react/no-unescaped-entities': 'error',
        'react/no-unsafe': 'error',
        'react/no-unused-prop-types': 'error',
        'react/no-unused-state': 'error',
        'react/sort-comp': 'error',
        'react/sort-default-props': 'error',
        'react/void-dom-elements-no-children': 'error',
        'react/jsx-no-comment-textnodes': 'error',
        'react/jsx-no-literals': 'error',
        'react/jsx-no-target-blank': 'error',
        'react/jsx-fragments': 'error',
      },
    },
    {
      files: [
        'src/platform/test/{accessibility,*functional*}/apps/**/*.{js,ts}',
        'src/platform/test/*api_integration*/**/*.{js,ts}',
        'x-pack/platform/test/{accessibility,*functional*}/apps/**/*.{js,ts}',
        'x-pack/platform/test/*api_integration*/**/*.{js,ts}',
        'x-pack/platform/test/*functional/tests/**/*.{js,ts}',
      ],
      extends: ['plugin:mocha/recommended'],
      plugins: ['mocha'],
      env: {
        mocha: true,
      },
      rules: {
        'mocha/no-mocha-arrows': 'off',
        'mocha/no-exports': 'off',
        'mocha/no-setup-in-describe': 'off',
        'mocha/no-nested-tests': 'off',
        'mocha/no-skipped-tests': 'off',
      },
    },
    {
      files: [
        'src/platform/packages/shared/kbn-scout/src/playwright/**/*.ts',
        'x-pack/solutions/**/packages/kbn-scout-*/src/playwright/**/*.ts',
        'src/platform/{packages,plugins}/**/test/{scout,scout_*}/**/*.ts',
        'x-pack/platform/{packages,plugins}/**/test/{scout,scout_*}/**/*.ts',
        'x-pack/solutions/**/{packages,plugins}/**/test/{scout,scout_*}/**/*.ts',
      ],
      excludedFiles: ['src/platform/packages/shared/kbn-scout/src/playwright/**/*.test.ts'],
      extends: ['plugin:playwright/recommended'],
      plugins: ['playwright'],
      settings: {
        playwright: {
          globalAliases: {
            test: ['test', 'spaceTest', 'apiTest'],
          },
        },
      },
      rules: {
        'playwright/no-commented-out-tests': 'error',
        'playwright/no-conditional-expect': 'error',
        'playwright/no-conditional-in-test': 'warn',
        'playwright/no-duplicate-hooks': 'error',
        'playwright/no-focused-test': 'error',
        'playwright/no-get-by-title': 'error',
        'playwright/no-nth-methods': 'error',
        'playwright/no-page-pause': 'error',
        'playwright/no-restricted-matchers': 'error',
        'playwright/no-slowed-test': 'error',
        'playwright/no-standalone-expect': 'error',
        'playwright/no-unsafe-references': 'error',
        'playwright/no-useless-await': 'error',
        'playwright/no-wait-for-selector': 'error',
        'playwright/max-nested-describe': ['error', { max: 1 }],
        'playwright/missing-playwright-await': 'error',
        'playwright/prefer-comparison-matcher': 'error',
        'playwright/prefer-equality-matcher': 'error',
        'playwright/prefer-hooks-in-order': 'error',
        'playwright/prefer-hooks-on-top': 'error',
        'playwright/prefer-strict-equal': 'error',
        'playwright/prefer-to-be': 'error',
        'playwright/prefer-to-contain': 'error',
        'playwright/prefer-to-have-count': 'error',
        'playwright/prefer-to-have-length': 'error',
        'playwright/prefer-web-first-assertions': 'error',
        'playwright/require-to-throw-message': 'error',
        'playwright/require-top-level-describe': 'error',
        'playwright/valid-describe-callback': 'error',
        'playwright/valid-title': 'error',
        // Scout has a its own runtime validator for test tags
        'playwright/valid-test-tags': 'off',
        // Check all function arguments to catch unused destructured params
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            vars: 'all',
            args: 'all',
            ignoreRestSiblings: true, // Ignore unused vars when destructuring with rest operator
            varsIgnorePattern: '^_', // Allow _ prefix for intentionally unused variables
            argsIgnorePattern: '^_', // Allow _ prefix for intentionally unused args
          },
        ],
      },
    },
    {
      files: ['x-pack/solutions/security/plugins/lists/public/**/!(*.test).{js,mjs,ts,tsx}'],
      plugins: ['react-perf'],
      rules: {
        'react-perf/jsx-no-new-object-as-prop': 'error',
        'react-perf/jsx-no-new-array-as-prop': 'error',
        'react-perf/jsx-no-new-function-as-prop': 'error',
        'react/jsx-no-bind': 'error',
      },
    },
    {
      // typescript and javascript for front and back
      files: ['x-pack/solutions/security/plugins/lists/**/*.{js,mjs,ts,tsx}'],
      plugins: ['eslint-plugin-node'],
      env: {
        jest: true,
      },
      rules: {
        'accessor-pairs': 'error',
        'array-callback-return': 'error',
        'no-array-constructor': 'error',
        complexity: 'error',
        'consistent-return': 'error',
        'func-style': ['error', 'expression'],
        'import/order': [
          'error',
          {
            groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
            'newlines-between': 'always',
          },
        ],
        'sort-imports': [
          'error',
          {
            ignoreDeclarationSort: true,
          },
        ],
        'node/no-deprecated-api': 'error',
        'no-bitwise': 'error',
        'no-continue': 'error',
        'no-dupe-keys': 'error',
        'no-duplicate-case': 'error',
        'no-duplicate-imports': 'off',
        'no-empty-character-class': 'error',
        'no-empty-pattern': 'error',
        'no-ex-assign': 'error',
        'no-extend-native': 'error',
        'no-extra-bind': 'error',
        'no-extra-boolean-cast': 'error',
        'no-extra-label': 'error',
        'no-func-assign': 'error',
        'no-implicit-globals': 'error',
        'no-implied-eval': 'error',
        'no-invalid-regexp': 'error',
        'no-inner-declarations': 'error',
        'no-lone-blocks': 'error',
        'no-multi-assign': 'error',
        'no-misleading-character-class': 'error',
        'no-new-symbol': 'error',
        'no-obj-calls': 'error',
        'no-param-reassign': ['error', { props: true }],
        'no-process-exit': 'error',
        'no-prototype-builtins': 'error',
        'no-return-await': 'error',
        'no-self-compare': 'error',
        'no-shadow-restricted-names': 'error',
        'no-sparse-arrays': 'error',
        'no-this-before-super': 'error',
        // rely on typescript
        'no-undef': 'off',
        'no-unreachable': 'error',
        'no-unsafe-finally': 'error',
        'no-useless-call': 'error',
        'no-useless-catch': 'error',
        'no-useless-concat': 'error',
        'no-useless-computed-key': 'error',
        'no-useless-escape': 'error',
        'no-useless-rename': 'error',
        'no-useless-return': 'error',
        'no-void': 'error',
        'one-var-declaration-per-line': 'error',
        'prefer-object-spread': 'error',
        'prefer-promise-reject-errors': 'error',
        'prefer-rest-params': 'error',
        'prefer-spread': 'error',
        'prefer-template': 'error',
        'require-atomic-updates': 'error',
        'symbol-description': 'error',
        'vars-on-top': 'error',
        '@typescript-eslint/explicit-member-accessibility': 'error',
        '@typescript-eslint/no-this-alias': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-useless-constructor': 'error',
        '@typescript-eslint/unified-signatures': 'error',
        '@typescript-eslint/explicit-function-return-type': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/no-unused-vars': 'error',
        'no-template-curly-in-string': 'error',
        'sort-keys': 'error',
        'prefer-destructuring': 'error',
        'no-restricted-imports': [
          'error',
          {
            // prevents code from importing files that contain the name "legacy" within their name. This is a mechanism
            // to help deprecation and prevent accidental re-use/continued use of code we plan on removing. If you are
            // finding yourself turning this off a lot for "new code" consider renaming the file and functions if it has valid uses.
            patterns: ['*legacy*'],
            paths: RESTRICTED_IMPORTS,
          },
        ],
      },
    },

    /**
     * Alerting Services overrides
     */
    {
      // typescript for front and back end
      files: [
        'x-pack/platform/plugins/shared/actions/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/alerting/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/stack_alerts/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/task_manager/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/event_log/**/*.{ts,tsx}',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },
    {
      // typescript only for back end
      files: [
        'x-pack/platform/plugins/shared/stack_connectors/server/**/*.ts',
        'x-pack/platform/plugins/shared/triggers_actions_ui/server/**/*.ts',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },
    /**
     * ResponseOps overrides
     */
    {
      files: [
        'src/platform/packages/shared/response-ops/**/*.{ts, tsx}',
        'x-pack/platform/plugins/shared/alerting/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/actions/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/stack_alerts/**/*.{ts, tsx}',
        'x-pack/platform/plugins/shared/stack_connectors/**/*.{ts, tsx}',
        'x-pack/platform/plugins/shared/triggers_actions_ui/**/*.{ts, tsx}',
        'x-pack/platform/plugins/shared/event_log/**/*.{ts, tsx}',
        'x-pack/platform/plugins/shared/rule_registry/**/*.{ts, tsx}',
        'x-pack/platform/plugins/shared/task_manager/**/*.{ts, tsx}',
        'x-pack/solutions/observability/packages/kbn-alerts-grouping/**/*.{ts, tsx}',
        'src/platform/packages/shared/kbn-alerts-ui-shared/**/*.{ts, tsx}',
        'src/platform/packages/shared/kbn-alerting-types/**/*.{ts, tsx}',
        'src/platform/packages/shared/kbn-cases-components/**/*.{ts, tsx}',
        'src/platform/packages/shared/kbn-actions-types/**/*.{ts, tsx}',
        'src/platform/packages/shared/kbn-alerts-as-data-utils/**/*.{ts, tsx}',
        'src/platform/packages/shared/kbn-grouping/**/*.{ts, tsx}',
        'src/platform/packages/shared/kbn-rrule/**/*.{ts, tsx}',
        'src/platform/packages/shared/kbn-rule-data-utils/**/*.{ts, tsx}',
        'src/platform/packages/shared/kbn-triggers-actions-ui-types/**/*.{ts, tsx}',
        'x-pack/platform/packages/shared/kbn-alerting-comparators/**/*.{ts, tsx}',
        'x-pack/platform/plugins/shared/embeddable_alerts_table/**/*.{ts,tsx}',
        'x-pack/platform/test/alerting_api_integration/**/*.{ts, tsx}',
        'x-pack/platform/test/cases_api_integration/**/*.{ts, tsx}',
        'x-pack/platform/test/reporting_api_integration/**/*.{ts, tsx}',
        'x-pack/solutions/**/test/cases_api_integration/**/*.{ts, tsx}',
        'x-pack/platform/test/rule_registry/**/*.{ts, tsx}',
        'x-pack/platform/test/api_integration/apis/cases/**/*.{ts, tsx}',
        'x-pack/solutions/**/test/api_integration/apis/cases/**/*.{ts, tsx}',
      ],
    },
    /**
     * Alerting V2 rule form — require compressed prop on EUI form controls
     */
    {
      files: ['x-pack/platform/packages/shared/response-ops/alerting-v2-rule-form/**/*.{ts,tsx}'],
      rules: {
        '@kbn/alerting-v2/require_eui_form_compressed': 'error',
      },
    },
    /**
     * Stack Connectors Specs package
     * This package contains common code for public and server side
     */
    {
      files: ['src/platform/packages/shared/kbn-connector-specs/**/*.{js,mjs,ts,tsx}'],
      rules: {
        'import/no-nodejs-modules': 'error',
        'no-duplicate-imports': 'off',
        'import/no-duplicates': 'error',
        'no-restricted-imports': [
          'error',
          {
            // prevents UI code from importing server side code and then webpack including it when doing builds
            patterns: ['**/*server*'],
            paths: RESTRICTED_IMPORTS,
          },
        ],
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/no-this-alias': 'error',
        '@typescript-eslint/no-unused-vars': 'error',
      },
    },
    {
      files: ['src/platform/packages/shared/kbn-connector-specs/src/specs/**/icon/*.{ts,tsx}'],
      rules: {
        'import/no-default-export': 'off',
      },
    },
    /**
     * Exception for connector specs whose product name contains 'server' (e.g., sharepoint_server).
     * These are connector configuration specs (shared-common code), not server-side runtime code.
     * The **\/*server* pattern in the parent rule is relaxed here to allow intra-package imports.
     */
    {
      files: [
        'src/platform/packages/shared/kbn-connector-specs/src/all_specs.ts',
        'src/platform/packages/shared/kbn-connector-specs/src/specs/sharepoint_server/**/*.{js,mjs,ts,tsx}',
      ],
      rules: {
        'no-restricted-imports': ['error', { paths: RESTRICTED_IMPORTS }],
      },
    },

    /**
     * Lens overrides
     */
    {
      files: ['x-pack/platform/plugins/shared/lens/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },

    /**
     * Onboarding team overrides
     */
    {
      files: [
        'x-pack/platform/plugins/shared/streams/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/streams_app/**/*.{ts,tsx}',
        'x-pack/solutions/observability/plugins/observability_onboarding/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/fields_metadata/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/dataset_quality/**/*.{ts,tsx}',
        'x-pack/platform/plugins/shared/data_quality/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-streams-schema/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-streams-ai/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-streamlang/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-streamlang-yaml-editor/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-streamlang-tests/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-sample-parser/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-grok-heuristics/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-evals-suite-streams/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-dissect-heuristics/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/kbn-content-packs-schema/**/*.{ts,tsx}',
        'x-pack/platform/packages/private/kbn-data-quality/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-xstate-utils/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-use-tracked-promise/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-timerange/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-synthtrace/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-synthtrace-client/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-react-hooks/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-otel-semantic-conventions/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-otel-demo/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-grok-ui/**/*.{ts,tsx}',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },

    /**
     * Discover overrides
     */
    {
      files: [
        'src/platform/plugins/shared/discover/**/*.{js,mjs,ts,tsx}',
        'src/platform/plugins/shared/saved_search/**/*.{js,mjs,ts,tsx}',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-expect-error': false,
          },
        ],
      },
    },
    {
      files: [
        'src/platform/plugins/shared/discover/**/*.{ts,tsx}',
        'src/platform/plugins/shared/saved_search/**/*.{ts,tsx}',
      ],
    },

    /**
     * Search overrides
     */

    {
      files: ['x-pack/solutions/search/**/*.{ts,tsx}'],
      excludedFiles: ['x-pack/solutions/search/**/*.test.tsx'],
      rules: {
        '@kbn/i18n/strings_should_be_translated_with_i18n': 'warn',
        '@kbn/i18n/strings_should_be_translated_with_formatted_message': 'warn',
      },
    },

    /**
     * Visualization team overrides
     */

    {
      files: [
        // src/platform/plugins
        'src/platform/plugins/shared/visualizations',
        'src/platform/plugins/shared/visualization_listing',
        'src/platform/plugins/shared/data',
        'src/platform/plugins/shared/expressions',
        'src/platform/plugins/shared/charts',
        'src/platform/plugins/shared/vis_types/timeseries',
        'src/platform/plugins/shared/chart_expressions',
        'src/platform/plugins/private/vis_types',
        'src/platform/plugins/private/event_annotation',
        'src/platform/plugins/private/event_annotation_listing',
        'src/platform/plugins/private/vis_default_editor',

        // src/platform/packages
        'src/platform/packages/shared/kbn-visualization-listing-components',
        'src/platform/packages/shared/kbn-visualizations-common',
        'src/platform/packages/shared/kbn-visualization-utils',
        'src/platform/packages/shared/kbn-visualization-ui-components',
        'src/platform/packages/shared/kbn-palettes',
        'src/platform/packages/shared/kbn-event-annotation-components',
        'src/platform/packages/shared/kbn-dom-drag-drop',
        'src/platform/packages/shared/kbn-coloring',
        'src/platform/packages/shared/kbn-chart-icons',
        'src/platform/packages/shared/chart-test-jest-helpers',
        'src/platform/packages/private/kbn-test-eui-helpers',

        // x-pack/platform/plugins
        'x-pack/platform/plugins/shared/lens',
        'x-pack/platform/plugins/private/graph',

        // x-pack/platform/packages
        'x-pack/platform/packages/private/kbn-random-sampling',
      ].map(
        (path) => `${path}/**/!(*.stories.tsx|*.test.tsx|*.storybook_decorator.tsx|*.mock.tsx)`
      ),
      rules: {
        '@kbn/i18n/strings_should_be_translated_with_i18n': 'warn',
        '@kbn/i18n/strings_should_be_translated_with_formatted_message': 'warn',
      },
    },

    /**
     * Enterprise Search overrides
     * NOTE: We also have a single rule at the bottom of the file that
     * overrides Prettier's default of not linting unnecessary backticks
     */
    {
      // All files
      files: ['x-pack/solutions/search/plugins/enterprise_search/**/*.{ts,tsx}'],
      rules: {
        'import/order': [
          'error',
          {
            groups: ['unknown', ['builtin', 'external'], 'internal', 'parent', 'sibling', 'index'],
            pathGroups: [
              {
                pattern:
                  '{../../../../../../,../../../../../,../../../../,../../../,../../,../,./}{common/,*}__mocks__{*,/**}',
                group: 'unknown',
              },
              {
                pattern: '{**,.}/*.mock',
                group: 'unknown',
              },
              {
                pattern: 'react*',
                group: 'external',
                position: 'before',
              },
              {
                pattern: '{@elastic/**,@kbn/**,src/**}',
                group: 'internal',
              },
            ],
            pathGroupsExcludedImportTypes: [],
            alphabetize: {
              order: 'asc',
              caseInsensitive: true,
            },
            'newlines-between': 'always-and-inside-groups',
          },
        ],
        'import/newline-after-import': 'error',
        'react-hooks/exhaustive-deps': 'off',
        'react/jsx-boolean-value': ['error', 'never'],
        'sort-keys': 1, // warning
        '@typescript-eslint/member-ordering': [1, { default: { order: 'alphabetically' } }], // warning
        '@typescript-eslint/no-unused-vars': [
          'error',
          { vars: 'all', args: 'after-used', ignoreRestSiblings: true, varsIgnorePattern: '^_' },
        ],
        '@kbn/telemetry/event_generating_elements_should_be_instrumented': 'warn',
      },
    },
    {
      // Source files only - allow `any` in test/mock files
      files: ['x-pack/solutions/search/plugins/enterprise_search/**/*.{ts,tsx}'],
      excludedFiles: [
        'x-pack/solutions/search/plugins/enterprise_search/**/*.{test,mock,test_helper}.{ts,tsx}',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },

    /**
     * Serverless Search overrides
     */
    {
      // All files
      files: [
        'x-pack/solutions/search/plugins/serverless_search/**/*.{ts,tsx}',
        'x-pack/solutions/search/packages/kbn-search-*',
      ],
      rules: {
        '@kbn/telemetry/event_generating_elements_should_be_instrumented': 'error',
      },
    },

    /**
     * Canvas overrides
     */
    {
      files: ['x-pack/platform/plugins/private/canvas/**/*.js'],
      rules: {
        radix: 'error',

        // module importing
        'import/order': [
          'error',
          {
            groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          },
        ],
        'import/extensions': ['error', 'never', { json: 'always', less: 'always', svg: 'always' }],

        // react
        'react/no-did-mount-set-state': 'error',
        'react/no-did-update-set-state': 'error',
        'react/no-multi-comp': ['error', { ignoreStateless: true }],
        'react/self-closing-comp': 'error',
        'react/sort-comp': 'error',
        'react/jsx-boolean-value': 'error',
        'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
        'react/forbid-elements': [
          'error',
          {
            forbid: [
              {
                element: 'EuiConfirmModal',
                message: 'Use <ConfirmModal> instead',
              },
              {
                element: 'EuiPopover',
                message: 'Use <Popover> instead',
              },
              {
                element: 'EuiIconTip',
                message: 'Use <TooltipIcon> instead',
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        'x-pack/platform/plugins/private/canvas/gulpfile.js',
        'x-pack/platform/plugins/private/canvas/scripts/*.js',
        'x-pack/platform/plugins/private/canvas/tasks/*.js',
        'x-pack/platform/plugins/private/canvas/tasks/**/*.js',
        'x-pack/platform/plugins/private/canvas/__tests__/**/*.js',
        'x-pack/platform/plugins/private/canvas/**/{__tests__,__test__,__jest__,__fixtures__,__mocks__}/**/*.js',
      ],
      rules: {
        'import/no-extraneous-dependencies': [
          'error',
          {
            devDependencies: true,
            peerDependencies: true,
            packageDir: __dirname,
          },
        ],
      },
    },
    {
      files: ['x-pack/platform/plugins/private/canvas/canvas_plugin_src/**/*.js'],
      globals: { canvas: true, $: true },
    },
    {
      files: ['x-pack/platform/plugins/private/canvas/public/**/*.js'],
      env: {
        browser: true,
      },
    },
    {
      files: ['src/platform/packages/shared/kbn-flot-charts/lib/**/*.js'],
      env: {
        jquery: true,
      },
    },

    /**
     * TSVB overrides
     */
    {
      files: ['src/platform/plugins/shared/vis_types/timeseries/**/*.{js,mjs,ts,tsx}'],
      rules: {
        'import/no-default-export': 'error',
      },
    },

    /**
     * Osquery overrides
     */
    {
      extends: [
        'eslint:recommended',
        'plugin:react/recommended',
        'plugin:@typescript-eslint/recommended',
      ],
      plugins: ['react', '@typescript-eslint'],
      files: ['x-pack/platform/plugins/shared/osquery/**/*.{js,mjs,ts,tsx}'],
      rules: {
        'padding-line-between-statements': [
          'error',
          {
            blankLine: 'always',
            prev: ['block-like'],
            next: ['*'],
          },
          {
            blankLine: 'always',
            prev: ['*'],
            next: ['return'],
          },
        ],
        'padded-blocks': ['error', 'always'],
        'arrow-body-style': ['error', 'as-needed'],
        'prefer-arrow-callback': 'error',
        'no-unused-vars': 'off',
        'react/prop-types': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-empty-object-type': 'off',
        '@typescript-eslint/no-unsafe-function-type': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
    {
      files: ['x-pack/platform/plugins/shared/osquery/**/*.{ts,tsx}'],
    },
    {
      // typescript and javascript for front end react performance
      files: ['x-pack/platform/plugins/shared/osquery/public/**/!(*.test).{js,mjs,ts,tsx}'],
      plugins: ['react', 'react-perf'],
      rules: {
        'react-perf/jsx-no-new-object-as-prop': 'error',
        'react-perf/jsx-no-new-array-as-prop': 'error',
        'react-perf/jsx-no-new-function-as-prop': 'error',
        'react/jsx-no-bind': 'error',
      },
    },

    /**
     * Platform Security Team overrides
     */
    {
      files: [
        'src/platform/plugins/private/interactive_setup/**/*.{js,mjs,ts,tsx}',
        'src/platform/test/interactive_setup_api_integration/**/*.{js,mjs,ts,tsx}',
        'src/platform/test/interactive_setup_functional/**/*.{js,mjs,ts,tsx}',

        'packages/kbn-mock-idp-plugin/**/*.{js,mjs,ts,tsx}',
        'src/platform/packages/private/kbn-mock-idp-utils/**/*.{js,mjs,ts,tsx}',
        'src/platform/packages/shared/kbn-security-hardening/**/*.{js,mjs,ts,tsx}',
        'src/platform/packages/shared/kbn-user-profile-components/**/*.{js,mjs,ts,tsx}',

        'x-pack/platform/plugins/shared/encrypted_saved_objects/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/test/encrypted_saved_objects_api_integration/**/*.{js,mjs,ts,tsx}',

        'x-pack/platform/plugins/shared/security/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/packages/private/security/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/packages/shared/security/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/test/security_api_integration/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/test/security_functional/**/*.{js,mjs,ts,tsx}',

        'x-pack/platform/plugins/shared/spaces/**/*.{js,mjs,ts,tsx}',
        'x-pack/platform/test/spaces_api_integration/**/*.{js,mjs,ts,tsx}',
      ],
      rules: {
        'import/order': [
          // This rule sorts import declarations
          'error',
          {
            groups: [
              'unknown',
              ['builtin', 'external'],
              'internal',
              ['parent', 'sibling', 'index'],
            ],
            pathGroups: [
              {
                pattern: '{**,.}/*.test.mocks',
                group: 'unknown',
              },
              {
                pattern: '{@kbn/**,src/**,kibana{,/**}}',
                group: 'internal',
              },
            ],
            pathGroupsExcludedImportTypes: [],
            alphabetize: {
              order: 'asc',
              caseInsensitive: true,
            },
            'newlines-between': 'always',
          },
        ],
        'import/no-duplicates': ['error'],
        'sort-imports': [
          // This rule sorts imports of multiple members (destructured imports)
          'error',
          {
            ignoreCase: true,
            ignoreDeclarationSort: true,
          },
        ],
      },
    },
    {
      files: [
        'src/platform/plugins/private/interactive_setup/**/*.{ts,tsx}',
        'src/platform/test/interactive_setup_api_integration/**/*.{ts,tsx}',
        'src/platform/test/interactive_setup_functional/**/*.{ts,tsx}',

        'packages/kbn-mock-idp-plugin/**/*.{ts,tsx}',
        'src/platform/packages/private/kbn-mock-idp-utils/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-security-hardening/**/*.{ts,tsx}',
        'src/platform/packages/shared/kbn-user-profile-components/**/*.{ts,tsx}',

        'x-pack/platform/plugins/shared/encrypted_saved_objects/**/*.{ts,tsx}',
        'x-pack/platform/test/encrypted_saved_objects_api_integration/**/*.{ts,tsx}',

        'x-pack/platform/plugins/shared/security/**/*.{ts,tsx}',
        'x-pack/platform/packages/private/security/**/*.{ts,tsx}',
        'x-pack/platform/packages/shared/security/**/*.{ts,tsx}',
        'x-pack/platform/test/security_api_integration/**/*.{ts,tsx}',
        'x-pack/platform/test/security_functional/**/*.{ts,tsx}',

        'x-pack/platform/plugins/shared/spaces/**/*.{ts,tsx}',
        'x-pack/platform/test/spaces_api_integration/**/*.{ts,tsx}',
      ],
    },

    /**
     * Do not allow `any`
     */
    {
      files: [
        'src/platform/packages/shared/kbn-analytics/**',
        'src/platform/plugins/private/kibana_usage_collection/**',
        'src/platform/plugins/shared/usage_collection/**',
        'src/platform/plugins/shared/telemetry/**',
        'src/platform/plugins/shared/telemetry_collection_manager/**',
        'src/platform/plugins/shared/telemetry_management_section/**',
        'x-pack/platform/plugins/private/telemetry_collection_xpack/**',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },
    {
      files: [
        // core-team owned code
        'src/core/**',
        'x-pack/platform/plugins/shared/features/**',
        'x-pack/platform/plugins/shared/licensing/**',
        'x-pack/platform/plugins/shared/global_search/**',
        'x-pack/platform/plugins/shared/cloud/**',
        'src/platform/packages/shared/kbn-config-schema',
        'src/platform/plugins/shared/saved_objects_management/**',
        'src/platform/packages/shared/kbn-analytics/**',
        'src/platform/packages/private/kbn-telemetry-tools/**',
        'src/platform/plugins/private/kibana_usage_collection/**',
        'src/platform/plugins/shared/usage_collection/**',
        'src/platform/plugins/shared/telemetry/**',
        'src/platform/plugins/shared/telemetry_collection_manager/**',
        'src/platform/plugins/shared/telemetry_management_section/**',
        'x-pack/platform/plugins/private/telemetry_collection_xpack/**',
      ],
      rules: {
        '@typescript-eslint/prefer-ts-expect-error': 'error',
      },
    },

    /**
     * Workflows Team: generic rules
     */
    {
      files: [
        'src/platform/plugins/shared/workflows_management/**/*.{js,mjs,ts,tsx}',
        'src/platform/plugins/shared/workflows_execution_engine/**/*.{js,mjs,ts,tsx}',
        'src/platform/plugins/shared/workflows_extensions/**/*.{js,mjs,ts,tsx}',
        'src/platform/packages/shared/kbn-workflows/**/*.{js,mjs,ts,tsx}',
        'src/platform/packages/shared/kbn-workflows-ui/**/*.{js,mjs,ts,tsx}',
      ],
      plugins: ['eslint-plugin-node', 'react'],
      env: {
        jest: true,
      },
      rules: {
        'accessor-pairs': 'error',
        'array-callback-return': 'error',
        'no-array-constructor': 'error',
        complexity: 'warn',
        'node/no-deprecated-api': 'error',
        'no-bitwise': 'error',
        'no-continue': 'error',
        'no-dupe-keys': 'error',
        'no-duplicate-case': 'error',
        'no-duplicate-imports': 'off',
        'no-empty-character-class': 'error',
        'no-empty-pattern': 'error',
        'no-ex-assign': 'error',
        'no-extend-native': 'error',
        'no-extra-bind': 'error',
        'no-extra-boolean-cast': 'error',
        'no-extra-label': 'error',
        'no-func-assign': 'error',
        'no-implicit-globals': 'error',
        'no-implied-eval': 'error',
        'no-invalid-regexp': 'error',
        'no-inner-declarations': 'error',
        'no-lone-blocks': 'error',
        'no-multi-assign': 'error',
        'no-misleading-character-class': 'error',
        'no-new-symbol': 'error',
        'no-obj-calls': 'error',
        'no-param-reassign': 'error',
        'no-process-exit': 'error',
        'no-prototype-builtins': 'error',
        'no-return-await': 'error',
        'no-self-compare': 'error',
        'no-shadow-restricted-names': 'error',
        'no-sparse-arrays': 'error',
        'no-this-before-super': 'error',
        // rely on typescript
        'no-undef': 'off',
        'no-unreachable': 'error',
        'no-unsafe-finally': 'error',
        'no-useless-call': 'error',
        'no-useless-catch': 'error',
        'no-useless-concat': 'error',
        'no-useless-computed-key': 'error',
        'no-useless-rename': 'error',
        'no-useless-return': 'error',
        'one-var-declaration-per-line': 'error',
        'prefer-object-spread': 'error',
        'prefer-promise-reject-errors': 'error',
        'prefer-rest-params': 'error',
        'prefer-spread': 'error',
        'prefer-template': 'error',
        'react/boolean-prop-naming': 'error',
        'react/button-has-type': 'error',
        'react/display-name': 'error',
        'react/forbid-dom-props': 'error',
        'react/no-access-state-in-setstate': 'error',
        'react/no-children-prop': 'error',
        'react/no-danger-with-children': 'error',
        'react/no-deprecated': 'error',
        'react/no-did-mount-set-state': 'error',
        'react/no-direct-mutation-state': 'error',
        'react/no-find-dom-node': 'error',
        'react/no-redundant-should-component-update': 'error',
        'react/no-render-return-value': 'error',
        'react/no-typos': 'error',
        'react/no-string-refs': 'error',
        'react/no-this-in-sfc': 'error',
        'react/no-unescaped-entities': 'error',
        'react/no-unsafe': 'error',
        'react/no-unused-prop-types': 'error',
        'react/no-unused-state': 'error',
        'react/sort-default-props': 'error',
        'react/void-dom-elements-no-children': 'error',
        'react/jsx-no-comment-textnodes': 'error',
        'react/jsx-no-literals': 'error',
        'react/jsx-no-target-blank': 'error',
        'react/jsx-fragments': 'error',
        'require-atomic-updates': 'error',
        'symbol-description': 'error',
        'vars-on-top': 'error',
        'import/no-duplicates': ['error'],
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/no-this-alias': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-useless-constructor': 'error',
        '@typescript-eslint/unified-signatures': 'error',
        'no-restricted-imports': [
          'error',
          {
            // prevents code from importing files that contain the name "legacy" within their name. This is a mechanism
            // to help deprecation and prevent accidental re-use/continued use of code we plan on removing. If you are
            // finding yourself turning this off a lot for "new code" consider renaming the file and functions if it is has valid uses.
            patterns: [
              '*legacy*',
              // Kibana has endpoint /api/spaces/_disable_legacy_url_aliases, resulting in generated file kibana.post_spaces_disable_legacy_url_aliases.gen.ts,
              // this pattern allows to import this generated file
              '!*.gen',
            ],
            paths: RESTRICTED_IMPORTS,
          },
        ],
        'import/order': [
          // This rule sorts import declarations
          'error',
          {
            groups: [
              'unknown',
              ['builtin', 'external'],
              'internal',
              ['parent', 'sibling', 'index'],
            ],
            pathGroups: [
              {
                pattern: '{**,.}/*.test.mocks',
                group: 'unknown',
              },
              {
                pattern: '{@kbn/**,src/**,kibana{,/**}}',
                group: 'internal',
              },
            ],
            pathGroupsExcludedImportTypes: [],
            alphabetize: {
              order: 'asc',
              caseInsensitive: true,
            },
          },
        ],
        'import/no-duplicates': ['error'],
        'sort-imports': [
          // This rule sorts imports of multiple members (destructured imports)
          'error',
          {
            ignoreCase: true,
            ignoreDeclarationSort: true,
          },
        ],
      },
    },
    /**
     * Workflows Team: public and common rules
     */
    {
      files: [
        'src/platform/plugins/shared/workflows_management/public/**/*.{js,mjs,ts,tsx}',
        'src/platform/plugins/shared/workflows_management/common/**/*.{js,mjs,ts,tsx}',
        'src/platform/plugins/shared/workflows_extensions/public/**/*.{js,mjs,ts,tsx}',
        'src/platform/plugins/shared/workflows_extensions/common/**/*.{js,mjs,ts,tsx}',
        'src/platform/packages/shared/kbn-workflows/**/*.{js,mjs,ts,tsx}',
        'src/platform/packages/shared/kbn-workflows-ui/**/*.{js,mjs,ts,tsx}',
      ],
      rules: {
        'import/no-nodejs-modules': 'error',
        'no-duplicate-imports': 'off',
        'import/no-duplicates': ['error'],
      },
    },
    /**
     * Workflows Team: test files
     */
    {
      files: [
        'src/platform/plugins/shared/workflows_management/**/*.{test,mock,test_helper}.{ts,tsx}',
        'src/platform/plugins/shared/workflows_execution_engine/**/*.{test,mock,test_helper}.{ts,tsx}',
        'src/platform/plugins/shared/workflows_extensions/**/*.{test,mock,test_helper}.{ts,tsx}',
        'src/platform/packages/shared/kbn-workflows/**/*.{test,mock,test_helper}.{ts,tsx}',
        'src/platform/packages/shared/kbn-workflows-ui/**/*.{test,mock,test_helper}.{ts,tsx}',
      ],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    /**
     * Workflows Team: scripts files
     */
    {
      files: ['src/platform/packages/shared/kbn-workflows/scripts/**/*.{js,ts}'],
      rules: {
        'import/no-nodejs-modules': 'off',
        'no-console': 'off',
        'no-process-exit': 'off',
      },
    },

    /**
     * Disallow `export *` syntax in plugin/core public/server/common index files and instead
     * require that plugins/core explicitly export the APIs that should be accessible outside the plugin.
     *
     * To add your plugin to this list just update the relevant glob with the name of your plugin
     */
    {
      files: [
        'src/core/{server,public,common}/index.ts',
        'src/platform/plugins/**/{server,public,common}/index.ts',
        'x-pack/platform/plugins/**/{server,public,common}/index.ts',
        'x-pack/solutions/*/plugins/**/{server,public,common}/index.ts',
      ],
      rules: {
        '@kbn/eslint/no_export_all': 'error',
      },
    },

    /**
     * Enterprise Search Prettier override
     * Lints unnecessary backticks - @see https://github.com/prettier/eslint-config-prettier/blob/main/README.md#forbid-unnecessary-backticks
     */
    {
      files: ['x-pack/solutions/search/plugins/enterprise_search/**/*.{ts,tsx}'],
      rules: {
        quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: false }],
      },
    },

    /**
     * Cloud Security Team overrides
     */
    {
      files: ['x-pack/solutions/security/plugins/cloud_security_posture/**/*.{js,mjs,ts,tsx}'],
      plugins: ['testing-library'],
      rules: {
        'testing-library/await-async-utils': 'error',
      },
    },
    /**
     * Code inside .buildkite runs separately from everything else in CI, before bootstrap, with ts-node. It needs a few tweaks because of this.
     */
    {
      files: '.buildkite/**/*.{js,ts}',
      rules: {
        'no-console': 'off',
        '@kbn/imports/no_unresolvable_imports': 'off',
      },
    },

    /**
     * Code inside .buildkite runs separately from everything else in CI, before bootstrap, with ts-node. It needs a few tweaks because of this.
     */
    {
      files: [
        'src/platform/packages/*/kbn-repo-*/**/*',
        'packages/kbn-repo-*/**/*',
        'packages/kbn-validate-next-docs-cli/**/*',
        'packages/kbn-find-used-node-modules/**/*',
      ],
      rules: {
        'max-classes-per-file': 'off',
      },
    },
    {
      files: [
        // TODO @kibana/operations
        'scripts/create_observability_rules.js', // is importing "@kbn/observability-alerting-test-data" (observability/private)
        'src/cli_setup/**', // is importing "@kbn/interactive-setup-plugin" (platform/private)
        'src/dev/build/tasks/install_chromium.ts', // is importing "@kbn/screenshotting-plugin" (platform/private)*',

        // For now, we keep the exception to let tests depend on anything.
        // Ideally, we need to classify the solution specific ones to reduce CI times
        'x-pack/platform/test/plugin_functional/plugins/resolver_test/**',
      ],
      rules: {
        '@kbn/imports/no_group_crossing_manifests': 'warn',
        '@kbn/imports/no_group_crossing_imports': 'warn',
      },
    },
    {
      files: ['packages/kbn-dependency-usage/**/*.{ts,tsx}'],
      rules: {
        // disabling it since package is a CLI tool
        'no-console': 'off',
        // disabling it since package is marked as module and it requires extension for files written
        '@kbn/imports/uniform_imports': 'off',
      },
    },
    {
      files: ['packages/kbn-dependency-ownership/**/*.{ts,tsx}'],
      rules: {
        // disabling it since package is a CLI tool
        'no-console': 'off',
      },
    },
    {
      files: ['x-pack/**/cypress/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@kbn/cypress-test-helper',
                message:
                  "Import from a sub-path (e.g. '@kbn/cypress-test-helper/src/utils'). Cypress uses Webpack, which requires direct file imports to avoid parse errors.",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        'src/platform/plugins/**/test/{scout,scout_*}/**/*.ts',
        'x-pack/platform/**/plugins/**/test/{scout,scout_*}/**/*.ts',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@playwright/test',
                message: "Platform tests should import only from '@kbn/scout'.",
              },
              {
                name: 'playwright',
                message: "Platform tests should import only from '@kbn/scout'.",
              },
            ],
            patterns: [
              {
                group: [
                  '@kbn/scout-oblt',
                  '@kbn/scout-oblt/**',
                  '@kbn/scout-search',
                  '@kbn/scout-search/**',
                  '@kbn/scout-security',
                  '@kbn/scout-security/**',
                  '@kbn/scout-info',
                  '@kbn/scout-info/**',
                  '@kbn/scout-reporting',
                  '@kbn/scout-reporting/**',
                  '@kbn/scout-release-testing',
                  '@kbn/scout-release-testing/**',
                  '@playwright/test/**',
                  'playwright/**',
                ],
                message:
                  "Platform tests should import from '@kbn/scout' (and '@kbn/scout-synthtrace' if you need synthtrace).",
              },
            ],
          },
        ],
      },
    },
    {
      files: ['x-pack/solutions/observability/plugins/**/test/{scout,scout_*}/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@kbn/scout',
                message:
                  "Observability solution tests should import from '@kbn/scout-oblt' instead.",
              },
              {
                name: '@playwright/test',
                message:
                  "Observability solution tests should import from '@kbn/scout-oblt' instead.",
              },
              {
                name: 'playwright',
                message:
                  "Observability solution tests should import from '@kbn/scout-oblt' instead.",
              },
            ],
            patterns: [
              {
                group: ['@kbn/scout/**', '@playwright/test/**', 'playwright/**'],
                message:
                  "Observability solution tests should import from '@kbn/scout-oblt' instead.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ['x-pack/solutions/search/plugins/**/test/{scout,scout_*}/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@kbn/scout',
                message: "Search solution tests should import from '@kbn/scout-search' instead.",
              },
              {
                name: '@playwright/test',
                message: "Search solution tests should import from '@kbn/scout-search' instead.",
              },
              {
                name: 'playwright',
                message: "Search solution tests should import from '@kbn/scout-search' instead.",
              },
            ],
            patterns: [
              {
                group: ['@kbn/scout/**', '@playwright/test/**', 'playwright/**'],
                message: "Search solution tests should import from '@kbn/scout-search' instead.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ['x-pack/solutions/security/plugins/**/test/{scout,scout_*}/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@kbn/scout',
                message:
                  "Security solution tests should import from '@kbn/scout-security' instead.",
              },
              {
                name: '@playwright/test',
                message:
                  "Security solution tests should import from '@kbn/scout-security' instead.",
              },
              {
                name: 'playwright',
                message:
                  "Security solution tests should import from '@kbn/scout-security' instead.",
              },
            ],
            patterns: [
              {
                group: ['@kbn/scout/**', '@playwright/test/**', 'playwright/**'],
                message:
                  "Security solution tests should import from '@kbn/scout-security' instead.",
              },
            ],
          },
        ],
      },
    },
    // Custom rules for scout tests
    {
      // Platform & Solutions (plugins and packages, excluding Scout framework's own tests)
      files: [
        'src/platform/{packages,plugins}/**/test/{scout,scout_*}/**/*.ts',
        'x-pack/platform/{packages,plugins}/**/test/{scout,scout_*}/**/*.ts',
        'x-pack/solutions/**/{packages,plugins}/**/test/{scout,scout_*}/**/*.ts',
      ],
      excludedFiles: ['src/platform/packages/shared/kbn-scout/test/**'],
      rules: {
        '@kbn/eslint/scout_no_describe_configure': 'error',
        '@kbn/eslint/scout_max_one_describe': 'error',
        '@kbn/eslint/scout_test_file_naming': 'error',
        '@kbn/eslint/scout_require_global_setup_hook_in_parallel_tests': 'error',
        '@kbn/eslint/scout_no_es_archiver_in_parallel_tests': 'error',
        '@kbn/eslint/scout_no_cross_boundary_imports': 'error',
        '@kbn/eslint/scout_expect_import': 'error',
        '@kbn/eslint/scout_no_deprecated_tags': 'error',
        '@kbn/eslint/scout_no_at_in_test_titles': 'warn',
        '@kbn/eslint/scout_no_locators': ['error', { restricted: ['globalLoadingIndicator'] }],
        '@kbn/eslint/scout_no_promise_all_with_playwright_apis': 'error',
        '@kbn/eslint/require_include_in_check_a11y': 'warn',
      },
    },
    {
      // Platform & Solutions API Tests
      files: [
        'src/platform/plugins/**/test/{scout,scout_*}/api/**/*.ts',
        'x-pack/platform/**/plugins/**/test/{scout,scout_*}/api/**/*.ts',
        'x-pack/solutions/**/plugins/**/test/{scout,scout_*}/api/**/*.ts',
      ],
      rules: {
        '@kbn/eslint/scout_require_api_client_in_api_test': [
          'error',
          { alternativeFixtures: ['esClient'] },
        ],
      },
    },
    {
      // Deployment-agnostic test files must use proper context and services
      files: [
        'x-pack/platform/test/api_integration_deployment_agnostic/apis/**/*.{js,ts}',
        'x-pack/platform/test/api_integration_deployment_agnostic/services/**/*.{js,ts}',
        'x-pack/solutions/**/test/api_integration_deployment_agnostic/apis/**/*.{js,ts}',
        'x-pack/solutions/**/test/api_integration_deployment_agnostic/services/**/*.{js,ts}',
      ],
      rules: {
        '@kbn/eslint/deployment_agnostic_test_context': 'error',
      },
    },

    {
      // Restrict fs imports in production code (exclude test files, scripts, etc.)
      files: [
        'src/platform/plugins/shared/**/*.ts',
        'x-pack/solutions/**/*.ts',
        'x-pack/plugins/**/*.ts',
        'x-pack/platform/plugins/shared/**/*.ts',
      ],
      excludedFiles: [
        '**/*.{test,spec}.ts',
        '**/*.test.ts',
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**',
        '**/scripts/**',
        '**/e2e/**',
        '**/cypress/**',
        '**/ftr_e2e/**',
        '**/.storybook/**',
        '**/json_schemas/**',
        // Can use fs for telemetry collection
        'src/platform/plugins/shared/telemetry/**',
        'x-pack/solutions/security/packages/test-api-clients/**',
        'x-pack/platform/plugins/shared/automatic_import/**',
      ],
      rules: {
        '@kbn/eslint/require_kbn_fs': [
          'error',
          {
            restrictedMethods: [
              'writeFile',
              'writeFileSync',
              'createWriteStream',
              'appendFile',
              'appendFileSync',
            ],
            disallowedMessage:
              'Use `@kbn/fs` for file write operations instead of direct `fs` in production code',
          },
        ],
      },
    },

    /**
     * kbn-ui dependency allowlist — packages under `src/platform/kbn-ui/**` must be
     * portable outside Kibana (e.g. Cloud UI). They may only import from the
     * baseline peer deps (`@elastic/eui`, `@emotion/*`, `react`, `react-dom`) plus
     * the `@kbn/*` modules that are stubbed at packaging time. Packaging, tests,
     * stories, and Storybook config are excluded because they reference
     * Kibana-only tooling.
     */
    {
      files: ['src/platform/kbn-ui/**/*.{ts,tsx}'],
      excludedFiles: [
        'src/platform/kbn-ui/**/*.test.*',
        'src/platform/kbn-ui/**/*.stories.*',
        'src/platform/kbn-ui/**/__stories__/**',
        'src/platform/kbn-ui/**/__tests__/**',
        'src/platform/kbn-ui/**/packaging/**',
        'src/platform/kbn-ui/storybook-config/**',
        'src/platform/kbn-ui/_tooling/**',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              '@kbn/*',
              '!@kbn/i18n',
              '!@kbn/i18n-react',
              '!@kbn/ui-chrome-layout-constants',
              '!@kbn/ui-chrome-layout-utils',
            ],
          },
        ],
      },
    },
    {
      // Allow axios in files that already use it. New axios imports are blocked
      // globally by RESTRICTED_IMPORTS; this allowlist should only ever shrink
      // as consumers migrate to the native `fetch` API. Placed last so it wins
      // over any earlier override that re-applies RESTRICTED_IMPORTS (e.g. the
      // security_solution and workflows_management blocks). The trade-off: the
      // allowlisted files that overlap with those blocks lose their `*legacy*`
      // pattern check; verified that none of them currently import any path
      // matching `*legacy*`. The js-yaml freeze is handled separately via
      // @kbn/eslint/module_migration in packages/kbn-eslint-config/.eslintrc.js
      // so it does not interact with this override.
      files: AXIOS_LEGACY_CONSUMERS,
      rules: {
        'no-restricted-imports': [
          'error',
          ...RESTRICTED_IMPORTS.filter(({ name }) => name !== 'axios'),
        ],
      },
    },
    {
      // These files are allowed to reference 'npx playwright' — either because they define
      // the rule itself, test it with invalid-code fixtures, or mention it in an error message
      // to explain what went wrong.
      files: [
        'src/platform/packages/private/kbn-scout-reporting/src/helpers/cli_processing.ts',
        'packages/kbn-eslint-plugin-eslint/rules/no_npx_playwright.js',
        'packages/kbn-eslint-plugin-eslint/rules/no_npx_playwright.test.js',
      ],
      rules: {
        '@kbn/eslint/no_npx_playwright': 'off',
      },
    },
  ],
};

/**
 * Prettier disables all conflicting rules, listing as last override so it takes precedence
 * people kept ignoring that this was last so it's now defined outside of the overrides list
 */
/** eslint-disable-next-line */
module.exports.overrides.push({ files: ['**/*'], rules: require('eslint-config-prettier').rules });
/** PLEASE DON'T PUT THINGS AFTER THIS */
