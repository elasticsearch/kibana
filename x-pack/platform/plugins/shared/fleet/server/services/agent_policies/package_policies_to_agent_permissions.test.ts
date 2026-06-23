/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('../epm/packages');
jest.mock('../app_context');

import { DATA_STREAM_TYPE_VAR_NAME, DATASET_VAR_NAME } from '../../../common/constants';
import type { PackagePolicy } from '../../types';
import { PackagePolicyValidationError } from '../../errors';

import { appContextService } from '../app_context';
import { createAppContextStartContractMock } from '../../mocks';

import type { DataStreamMeta } from './package_policies_to_agent_permissions';
import {
  ELASTIC_CONNECTORS_INDEX_PERMISSIONS,
  getDataStreamPrivileges,
  storedPackagePoliciesToAgentPermissions,
  UNIVERSAL_PROFILING_PERMISSIONS,
} from './package_policies_to_agent_permissions';

const packageInfoCache = new Map();
packageInfoCache.set('test_package-0.0.0', {
  name: 'test_package',
  version: '0.0.0',
  latestVersion: '0.0.0',
  release: 'experimental',
  format_version: '1.0.0',
  title: 'Test Package',
  description: '',
  icons: [],
  owner: { github: '' },
  status: 'not_installed',
  assets: {
    kibana: {
      csp_rule_template: [],
      dashboard: [],
      visualization: [],
      search: [],
      index_pattern: [],
      map: [],
      lens: [],
      security_ai_prompt: [],
      security_rule: [],
      ml_module: [],
      tag: [],
      osquery_pack_asset: [],
      osquery_saved_query: [],
    },
    elasticsearch: {
      component_template: [],
      ingest_pipeline: [],
      ilm_policy: [],
      transform: [],
      index_template: [],
      data_stream_ilm_policy: [],
      ml_model: [],
    },
  },
  data_streams: [
    {
      type: 'logs',
      dataset: 'some-logs',
      title: '',
      release: '',
      package: 'test_package',
      path: '',
      ingest_pipeline: '',
      streams: [{ input: 'test-logs', title: 'Test Logs', template_path: '' }],
    },
    {
      type: 'metrics',
      dataset: 'some-metrics',
      title: '',
      release: '',
      package: 'test_package',
      path: '',
      ingest_pipeline: '',
      streams: [{ input: 'test-metrics', title: 'Test Logs', template_path: '' }],
    },
  ],
});
packageInfoCache.set('osquery_manager-0.3.0', {
  format_version: '1.0.0',
  name: 'osquery_manager',
  title: 'Osquery Manager',
  version: '0.3.0',
  license: 'basic',
  description:
    'Centrally manage osquery deployments, run live queries, and schedule recurring queries',
  type: 'integration',
  release: 'beta',
  categories: ['security', 'os_system', 'config_management'],
  icons: [
    {
      src: '/img/logo_osquery.svg',
      title: 'logo osquery',
      size: '32x32',
      type: 'image/svg+xml',
    },
  ],
  owner: { github: 'elastic/integrations' },
  readme: '/package/osquery_manager/0.3.0/docs/README.md',
  data_streams: [
    {
      dataset: 'osquery_manager.result',
      package: 'osquery_manager',
      ingest_pipeline: 'test',
      path: 'result',
      streams: [],
      title: 'Osquery Manager queries',
      type: 'logs',
      release: 'experimental',
    },
  ],
  latestVersion: '0.3.0',
  notice: undefined,
  status: 'not_installed',
  assets: {
    kibana: {
      csp_rule_template: [],
      dashboard: [],
      visualization: [],
      search: [],
      index_pattern: [],
      map: [],
      lens: [],
      security_ai_prompt: [],
      security_rule: [],
      ml_module: [],
      tag: [],
      osquery_pack_asset: [],
      osquery_saved_query: [],
    },
    elasticsearch: {
      component_template: [],
      ingest_pipeline: [],
      ilm_policy: [],
      transform: [],
      index_template: [],
      data_stream_ilm_policy: [],
      ml_model: [],
    },
  },
});
packageInfoCache.set('profiler_symbolizer-8.8.0-preview', {
  format_version: '2.7.0',
  name: 'profiler_symbolizer',
  title: 'Universal Profiling Symbolizer',
  version: '8.8.0-preview',
  license: 'basic',
  description:
    ' Fleet-wide, whole-system, continuous profiling with zero instrumentation. Symbolize native frames.',
  type: 'integration',
  release: 'beta',
  categories: ['monitoring', 'elastic_stack'],
  icons: [
    {
      src: '/img/logo_profiling_symbolizer.svg',
      title: 'logo symbolizer',
      size: '32x32',
      type: 'image/svg+xml',
    },
  ],
  owner: { github: 'elastic/profiling' },
  data_streams: [],
  latestVersion: '8.8.0-preview',
  notice: undefined,
  status: 'not_installed',
  assets: {
    kibana: {
      csp_rule_template: [],
      dashboard: [],
      visualization: [],
      search: [],
      index_pattern: [],
      map: [],
      lens: [],
      security_ai_prompt: [],
      security_rule: [],
      ml_module: [],
      tag: [],
      osquery_pack_asset: [],
      osquery_saved_query: [],
    },
    elasticsearch: {
      component_template: [],
      ingest_pipeline: [],
      ilm_policy: [],
      transform: [],
      index_template: [],
      data_stream_ilm_policy: [],
      ml_model: [],
    },
  },
});
packageInfoCache.set('profiler_collector-8.9.0-preview', {
  format_version: '2.7.0',
  name: 'profiler_collector',
  title: 'Universal Profiling Collector',
  version: '8.9.0-preview',
  license: 'basic',
  description:
    'Fleet-wide, whole-system, continuous profiling with zero instrumentation. Collect profiling data.',
  type: 'integration',
  release: 'beta',
  categories: ['monitoring', 'elastic_stack'],
  icons: [
    {
      src: '/img/logo_profiling_symbolizer.svg',
      title: 'logo symbolizer',
      size: '32x32',
      type: 'image/svg+xml',
    },
  ],
  owner: { github: 'elastic/profiling' },
  data_streams: [],
  latestVersion: '8.9.0-preview',
  notice: undefined,
  status: 'not_installed',
  assets: {
    kibana: {
      csp_rule_template: [],
      dashboard: [],
      visualization: [],
      search: [],
      index_pattern: [],
      map: [],
      lens: [],
      security_ai_prompt: [],
      security_rule: [],
      ml_module: [],
      tag: [],
      osquery_pack_asset: [],
      osquery_saved_query: [],
    },
    elasticsearch: {
      component_template: [],
      ingest_pipeline: [],
      ilm_policy: [],
      transform: [],
      index_template: [],
      data_stream_ilm_policy: [],
      ml_model: [],
    },
  },
});

packageInfoCache.set('apm-8.9.0-preview', {
  format_version: '2.7.0',
  name: 'apm',
  title: 'APM',
  version: '8.9.0-preview',
  license: 'basic',
  description: 'APM Server integration',
  type: 'integration',
  release: 'beta',
  categories: ['observability'],
  icons: [],
  owner: { github: 'elastic/apm-server' },
  data_streams: [],
  latestVersion: '8.9.0-preview',
  status: 'not_installed',
  assets: {
    kibana: {
      csp_rule_template: [],
      dashboard: [],
      visualization: [],
      search: [],
      index_pattern: [],
      map: [],
      lens: [],
      security_ai_prompt: [],
      security_rule: [],
      ml_module: [],
      tag: [],
      osquery_pack_asset: [],
      osquery_saved_query: [],
    },
    elasticsearch: {
      component_template: [],
      ingest_pipeline: [],
      ilm_policy: [],
      transform: [],
      index_template: [],
      data_stream_ilm_policy: [],
      ml_model: [],
    },
  },
});

packageInfoCache.set('input_otel-1.0.0', {
  format_version: '2.7.0',
  name: 'input_otel',
  title: 'Input OTel',
  version: '1.0.0',
  type: 'input',
  release: 'ga',
  policy_templates: [
    {
      name: 'otel',
      title: 'OTel',
      description: 'OpenTelemetry input',
      type: 'logs',
      input: 'otelcol',
      template_path: 'input.yml.hbs',
      dynamic_signal_types: true,
      vars: [],
    },
  ],
  data_streams: [
    {
      type: 'logs',
      dataset: 'otel.logs',
      title: 'OTel Logs',
      release: 'ga',
      package: 'input_otel',
      path: 'logs',
      streams: [],
    },
    {
      type: 'metrics',
      dataset: 'otel.metrics',
      title: 'OTel Metrics',
      release: 'ga',
      package: 'input_otel',
      path: 'metrics',
      streams: [],
    },
    {
      type: 'traces',
      dataset: 'otel.traces',
      title: 'OTel Traces',
      release: 'ga',
      package: 'input_otel',
      path: 'traces',
      streams: [],
    },
  ],
  latestVersion: '1.0.0',
  status: 'not_installed',
  assets: { kibana: {}, elasticsearch: {} },
});

packageInfoCache.set('elastic_connectors-1.0.0', {
  format_version: '2.7.0',
  name: 'elastic_connectors',
  title: 'Elastic Connectors',
  version: '1.0.0',
  license: 'basic',
  description: 'Sync data from source to the Elasticsearch index.',
  type: 'integration',
  release: 'beta',
  categories: ['connector'],
  icons: [],
  owner: { github: 'elastic/ingestion-team' },
  data_streams: [],
  latestVersion: '1.0.0',
  status: 'not_installed',
  assets: {
    kibana: {
      csp_rule_template: [],
      dashboard: [],
      visualization: [],
      search: [],
      index_pattern: [],
      map: [],
      lens: [],
      security_ai_prompt: [],
      security_rule: [],
      ml_module: [],
      tag: [],
      osquery_pack_asset: [],
      osquery_saved_query: [],
    },
    elasticsearch: {
      component_template: [],
      ingest_pipeline: [],
      ilm_policy: [],
      transform: [],
      index_template: [],
      data_stream_ilm_policy: [],
      ml_model: [],
    },
  },
});

packageInfoCache.set('sql_input-1.0.0', {
  format_version: '3.1.5',
  name: 'sql_input',
  title: 'SQL Input',
  version: '1.0.0',
  type: 'input',
  release: 'ga',
  policy_templates: [
    {
      name: 'mysql',
      type: 'metrics',
      title: 'MySQL',
      description: 'Collect metrics from MySQL.',
      input: 'sql/metrics',
      template_path: 'input.yml.hbs',
      vars: [],
    },
  ],
  data_streams: [],
  latestVersion: '1.0.0',
  status: 'not_installed',
  assets: { kibana: {}, elasticsearch: {} },
});

packageInfoCache.set('non_dynamic_pkg-1.0.0', {
  format_version: '2.7.0',
  name: 'non_dynamic_pkg',
  title: 'Non Dynamic Package',
  version: '1.0.0',
  type: 'integration',
  release: 'ga',
  policy_templates: [],
  data_streams: [
    {
      type: 'logs',
      dataset: 'non_dynamic_pkg.logs',
      title: 'Logs',
      release: 'ga',
      package: 'non_dynamic_pkg',
      path: 'logs',
      streams: [],
    },
  ],
  latestVersion: '1.0.0',
  status: 'not_installed',
  assets: { kibana: {}, elasticsearch: {} },
});

describe('storedPackagePoliciesToAgentPermissions()', () => {
  beforeEach(() => {
    appContextService.start(createAppContextStartContractMock());
    jest.spyOn(appContextService, 'getExperimentalFeatures').mockReturnValue({
      enableOtelIntegrations: true,
    } as any);
  });

  it('Returns `undefined` if there are no package policies', async () => {
    const permissions = await storedPackagePoliciesToAgentPermissions(packageInfoCache, 'test', []);
    expect(permissions).toBeUndefined();
  });

  it('Throw an error if package policies is not an array', () => {
    expect(() =>
      storedPackagePoliciesToAgentPermissions(packageInfoCache, 'test', undefined)
    ).toThrow(/storedPackagePoliciesToAgentPermissions should be called with a PackagePolicy/);
  });

  it('Returns the default permissions if a package policy does not have a package', () => {
    expect(() =>
      storedPackagePoliciesToAgentPermissions(packageInfoCache, 'test', [
        { name: 'foo', package: undefined } as PackagePolicy,
      ])
    ).toThrow(/No package for package policy foo/);
  });

  it('Returns the permissions for the enabled inputs', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-uuid-test-123',
        name: 'test-policy',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'test-logs',
            enabled: true,
            streams: [
              {
                id: 'test-logs',
                enabled: true,
                data_stream: { type: 'logs', dataset: 'some-logs' },
              },
            ],
          },
          {
            type: 'test-metrics',
            enabled: false,
            streams: [
              {
                id: 'test-logs',
                enabled: false,
                data_stream: { type: 'metrics', dataset: 'some-metrics' },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-uuid-test-123': {
        indices: [
          {
            names: ['logs-some-logs-test'],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
      },
    });
  });

  it('Add additional_datastream_permissions', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-uuid-test-123',
        name: 'test-policy',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'test-logs',
            enabled: true,
            streams: [
              {
                id: 'test-logs',
                enabled: true,
                data_stream: { type: 'logs', dataset: 'some-logs' },
              },
            ],
          },
          {
            type: 'test-metrics',
            enabled: false,
            streams: [
              {
                id: 'test-logs',
                enabled: false,
                data_stream: { type: 'metrics', dataset: 'some-metrics' },
              },
            ],
          },
        ],
        additional_datastreams_permissions: ['logs-test-default', 'metrics-test-default'],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-uuid-test-123': {
        indices: [
          {
            names: ['logs-some-logs-test'],
            privileges: ['auto_configure', 'create_doc'],
          },
          {
            names: ['logs-test-default', 'metrics-test-default'],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
      },
    });
  });

  it('Returns the dataset for the compiled data_streams', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-uuid-test-123',
        name: 'test-policy',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'test-logs',
            enabled: true,
            streams: [
              {
                id: 'test-logs',
                enabled: true,
                data_stream: { type: 'logs', dataset: 'some-logs' },
                compiled_stream: { data_stream: { dataset: 'compiled' } },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-uuid-test-123': {
        indices: [
          {
            names: ['logs-compiled-test'],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
      },
    });
  });

  it('Returns the cluster privileges if there is one in the package policy', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-uuid-test-123',
        name: 'test-policy',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        elasticsearch: {
          privileges: {
            cluster: ['monitor'],
          },
        },
        inputs: [
          {
            type: 'test-logs',
            enabled: true,
            streams: [
              {
                id: 'test-logs',
                enabled: true,
                data_stream: { type: 'logs', dataset: 'some-logs' },
                compiled_stream: { data_stream: { dataset: 'compiled' } },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-uuid-test-123': {
        indices: [
          {
            names: ['logs-compiled-test'],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
        cluster: ['monitor'],
      },
    });
  });

  it('Returns the dataset for osquery_manager package', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-uuid-test-123',
        name: 'test-policy',
        namespace: 'test',
        enabled: true,
        package: { name: 'osquery_manager', version: '0.3.0', title: 'Test Package' },
        inputs: [
          {
            type: 'osquery_manager',
            enabled: true,
            streams: [
              {
                id: 'test-logs',
                enabled: true,
                data_stream: { type: 'logs', dataset: 'some-logs' },
                compiled_stream: { data_stream: { dataset: 'compiled' } },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-uuid-test-123': {
        indices: [
          {
            names: ['logs-osquery_manager.result-test'],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
      },
    });
  });

  it('Returns the Universal Profiling permissions for profiler_symbolizer package', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-uuid-test-123',
        name: 'test-policy',
        namespace: '',
        enabled: true,
        package: { name: 'profiler_symbolizer', version: '8.8.0-preview', title: 'Test Package' },
        inputs: [
          {
            type: 'pf-elastic-symbolizer',
            enabled: true,
            streams: [],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );

    expect(permissions).toMatchObject({
      'package-policy-uuid-test-123': {
        indices: [
          {
            names: ['profiling-*', 'profiles-*'],
            privileges: UNIVERSAL_PROFILING_PERMISSIONS,
          },
        ],
      },
    });
  });
  it('Returns the Universal Profiling permissions for profiler_collector package', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-uuid-test-123',
        name: 'test-policy',
        namespace: '',
        enabled: true,
        package: { name: 'profiler_collector', version: '8.9.0-preview', title: 'Test Package' },
        inputs: [
          {
            type: 'pf-elastic-collector',
            enabled: true,
            streams: [],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );

    expect(permissions).toMatchObject({
      'package-policy-uuid-test-123': {
        indices: [
          {
            names: ['profiling-*', 'profiles-*'],
            privileges: UNIVERSAL_PROFILING_PERMISSIONS,
          },
        ],
      },
    });
  });

  it('Returns Universal Profiling permissions for a non-dynamic OTel profiles input', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-otel-profiles',
        name: 'profiling-otel-policy',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'otelcol',
            enabled: true,
            streams: [
              {
                id: 'otel-profiles',
                enabled: true,
                data_stream: { type: 'profiles', dataset: 'profilingreceiver' },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    // profiles is owned end-to-end by Universal Profiling, not managed as a profiles-<dataset> data stream.
    expect(permissions).toMatchObject({
      'package-policy-otel-profiles': {
        indices: [
          {
            names: ['profiling-*', 'profiles-*'],
            privileges: UNIVERSAL_PROFILING_PERMISSIONS,
          },
        ],
      },
    });
  });

  it('Returns additional logs permissions for OTel traces span events', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-uuid-test-456',
        name: 'otel-traces-policy',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'otelcol',
            enabled: true,
            streams: [
              {
                id: 'otel-traces',
                enabled: true,
                data_stream: { type: 'traces', dataset: 'otel-traces' },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-uuid-test-456': {
        indices: [
          {
            names: ['traces-otel-traces.otel-test'],
            privileges: ['auto_configure', 'create_doc'],
          },
          {
            names: ['logs-otel-traces.otel-test'],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
      },
    });
  });

  it('OTel non-dynamic: data_stream.dataset var overrides stream dataset (e.g. generic → zipkinreceiver)', async () => {
    // Matches getFullInputStreams: var replaces merged dataset for otelcol. Traces + span-event logs
    // must use the same effective dataset (previously traces ignored the var).
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-otel-var-over-compiled',
        name: 'otel-var-beats-compiled',
        namespace: 'ep',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'otelcol',
            enabled: true,
            streams: [
              {
                id: 'otel-traces',
                enabled: true,
                data_stream: { type: 'traces', dataset: 'generic' },
                compiled_stream: { data_stream: { dataset: 'generic' } },
                vars: {
                  [DATASET_VAR_NAME]: { value: 'zipkinreceiver' },
                },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'ep',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-otel-var-over-compiled': {
        indices: [
          {
            names: ['traces-zipkinreceiver.otel-ep'],
            privileges: ['auto_configure', 'create_doc'],
          },
          { names: ['logs-zipkinreceiver.otel-ep'], privileges: ['auto_configure', 'create_doc'] },
        ],
      },
    });
  });

  it('Falls back to stream dataset when OTel traces data_stream.dataset var is an empty object', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-otel-dataset-empty-object',
        name: 'otel-traces-bad-dataset-var',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'otelcol',
            enabled: true,
            streams: [
              {
                id: 'otel-traces',
                enabled: true,
                data_stream: { type: 'traces', dataset: 'otel-traces' },
                vars: {
                  [DATASET_VAR_NAME]: { value: {} },
                },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-otel-dataset-empty-object': {
        indices: expect.arrayContaining([
          { names: ['logs-otel-traces.otel-test'], privileges: ['auto_configure', 'create_doc'] },
        ]),
      },
    });
  });

  it('Falls back to stream dataset when OTel traces data_stream.dataset var is an array', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-otel-dataset-array',
        name: 'otel-traces-array-dataset-var',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'otelcol',
            enabled: true,
            streams: [
              {
                id: 'otel-traces',
                enabled: true,
                data_stream: { type: 'traces', dataset: 'otel-traces' },
                vars: {
                  [DATASET_VAR_NAME]: { value: ['a', 'b', 'c'] },
                },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-otel-dataset-array': {
        indices: expect.arrayContaining([
          { names: ['logs-otel-traces.otel-test'], privileges: ['auto_configure', 'create_doc'] },
        ]),
      },
    });
  });

  it('Uses dataset from object-shaped OTel traces data_stream.dataset var', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-otel-dataset-object',
        name: 'otel-traces-object-dataset-var',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'otelcol',
            enabled: true,
            streams: [
              {
                id: 'otel-traces',
                enabled: true,
                data_stream: { type: 'traces', dataset: 'otel-traces' },
                vars: {
                  [DATASET_VAR_NAME]: { value: { dataset: 'my.custom' } },
                },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-otel-dataset-object': {
        indices: expect.arrayContaining([
          { names: ['logs-my.custom.otel-test'], privileges: ['auto_configure', 'create_doc'] },
        ]),
      },
    });
  });

  it('Falls back to stream dataset when OTel traces data_stream.dataset var is only whitespace or empty nested dataset', async () => {
    const whitespacePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-otel-dataset-whitespace',
        name: 'otel-traces-ws',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'otelcol',
            enabled: true,
            streams: [
              {
                id: 'otel-traces',
                enabled: true,
                data_stream: { type: 'traces', dataset: 'otel-traces' },
                vars: {
                  [DATASET_VAR_NAME]: { value: '   ' },
                },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const emptyNestedPolicies: PackagePolicy[] = [
      {
        id: 'package-policy-otel-dataset-empty-nested',
        name: 'otel-traces-empty-nested',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'otelcol',
            enabled: true,
            streams: [
              {
                id: 'otel-traces',
                enabled: true,
                data_stream: { type: 'traces', dataset: 'otel-traces' },
                vars: {
                  [DATASET_VAR_NAME]: { value: { dataset: '' } },
                },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const [wsPermissions, nestedPermissions] = await Promise.all([
      storedPackagePoliciesToAgentPermissions(packageInfoCache, 'test', whitespacePolicies),
      storedPackagePoliciesToAgentPermissions(packageInfoCache, 'test', emptyNestedPolicies),
    ]);

    expect(wsPermissions).toMatchObject({
      'package-policy-otel-dataset-whitespace': {
        indices: expect.arrayContaining([
          { names: ['logs-otel-traces.otel-test'], privileges: ['auto_configure', 'create_doc'] },
        ]),
      },
    });
    expect(nestedPermissions).toMatchObject({
      'package-policy-otel-dataset-empty-nested': {
        indices: expect.arrayContaining([
          { names: ['logs-otel-traces.otel-test'], privileges: ['auto_configure', 'create_doc'] },
        ]),
      },
    });
  });

  it('Returns wildcard traces and logs for OTel traces span events when dynamic_dataset and dynamic_namespace are set (input-type packages)', async () => {
    // getNormalizedDataStreams always sets both flags for type: input packages; span-event logs must
    // receive dynamic_dataset too or they stay literal while traces-*-* (regression fixed in code).
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-uuid-test-789',
        name: 'otel-traces-dynamic-ds-ns',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'otelcol',
            enabled: true,
            streams: [
              {
                id: 'otel-traces',
                enabled: true,
                data_stream: {
                  type: 'traces',
                  dataset: 'otel-traces',
                  elasticsearch: { dynamic_dataset: true, dynamic_namespace: true },
                },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-uuid-test-789': {
        indices: [
          {
            names: ['traces-*-*'],
            privileges: ['auto_configure', 'create_doc'],
          },
          {
            names: ['logs-*-*'],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
      },
    });
  });

  it('Uses literal dataset for span-event logs when only dynamic_namespace is set (no dynamic_dataset)', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-otel-span-ns-only',
        name: 'otel-traces-ns-only',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'otelcol',
            enabled: true,
            streams: [
              {
                id: 'otel-traces',
                enabled: true,
                data_stream: {
                  type: 'traces',
                  dataset: 'otel-traces',
                  elasticsearch: { dynamic_namespace: true },
                },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-otel-span-ns-only': {
        indices: [
          {
            names: ['traces-otel-traces.otel-*'],
            privileges: ['auto_configure', 'create_doc'],
          },
          {
            names: ['logs-otel-traces.otel-*'],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
      },
    });
  });

  it('Propagates dynamic_dataset to span events so logs are not stuck on literal policy dataset (receiver name)', async () => {
    // Mirrors input-type OTel integrations: registry dataset may differ from OTTL output, but
    // dynamic_dataset/dynamic_namespace on the traces stream must apply to span-event logs too,
    // otherwise permissions stay literal (e.g. logs-zipkinreceiver-*) while routing uses wildcards.
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-otel-span-dynamic-dataset',
        name: 'otel-traces-dynamic-ds',
        namespace: 'ep',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'otelcol',
            enabled: true,
            streams: [
              {
                id: 'otel-traces',
                enabled: true,
                data_stream: {
                  type: 'traces',
                  dataset: 'zipkinreceiver',
                  elasticsearch: { dynamic_dataset: true, dynamic_namespace: true },
                },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'ep',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-otel-span-dynamic-dataset': {
        indices: [
          {
            names: ['traces-*-*'],
            privileges: ['auto_configure', 'create_doc'],
          },
          {
            names: ['logs-*-*'],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
      },
    });
  });

  it('Aligns span-event logs with data_stream.dataset var override when traces are dynamic (registry vs OTTL)', async () => {
    // Same path as getFullInputStreams: stream var overrides dataset for OTTL; compiled_stream can
    // still carry the shorter registry name. Span-event permissions must use the override for the
    // literal case and propagate dynamic_dataset so wildcard indices match traces-*-* / logs-*-*.
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-otel-span-var-plus-dynamic',
        name: 'otel-zipkin-var',
        namespace: 'ep',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'otelcol',
            enabled: true,
            streams: [
              {
                id: 'otel-traces',
                enabled: true,
                data_stream: {
                  type: 'traces',
                  dataset: 'generic',
                  elasticsearch: { dynamic_dataset: true, dynamic_namespace: true },
                },
                compiled_stream: {
                  data_stream: { dataset: 'generic' },
                },
                vars: {
                  [DATASET_VAR_NAME]: { value: 'zipkinreceiver' },
                },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'ep',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-otel-span-var-plus-dynamic': {
        indices: [
          {
            names: ['traces-*-*'],
            privileges: ['auto_configure', 'create_doc'],
          },
          {
            names: ['logs-*-*'],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
      },
    });
  });

  it('Does not add additional logs permissions for non-OTel traces inputs', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-uuid-test-101',
        name: 'non-otel-traces-policy',
        namespace: 'test',
        enabled: true,
        package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
        inputs: [
          {
            type: 'test-logs',
            enabled: true,
            streams: [
              {
                id: 'test-traces',
                enabled: true,
                data_stream: { type: 'traces', dataset: 'some-traces' },
              },
            ],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );
    expect(permissions).toMatchObject({
      'package-policy-uuid-test-101': {
        indices: [
          {
            names: ['traces-some-traces-test'],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
      },
    });
    // Should only have one index permission, no additional logs permission
    expect(permissions!['package-policy-uuid-test-101'].indices).toHaveLength(1);
  });

  it('returns the correct permissions for the APM package', async () => {
    const packagePolicies: PackagePolicy[] = [
      {
        id: 'package-policy-uuid-test-123',
        name: 'test-policy',
        namespace: '',
        enabled: true,
        package: { name: 'apm', version: '8.9.0-preview', title: 'Test Package' },
        inputs: [
          {
            type: 'pf-elastic-collector',
            enabled: true,
            streams: [],
          },
        ],
        created_at: '',
        updated_at: '',
        created_by: '',
        updated_by: '',
        revision: 1,
        policy_id: '',
        policy_ids: [''],
      },
    ];

    const permissions = await storedPackagePoliciesToAgentPermissions(
      packageInfoCache,
      'test',
      packagePolicies
    );

    expect(permissions).toMatchObject({
      'package-policy-uuid-test-123': {
        cluster: ['cluster:monitor/main'],
        indices: [
          {
            names: ['traces-*', 'logs-*', 'metrics-*'],
            privileges: ['auto_configure', 'create_doc'],
          },
          {
            names: ['traces-apm.sampled-*'],
            privileges: ['auto_configure', 'create_doc', 'maintenance', 'monitor', 'read'],
          },
        ],
      },
    });
  });

  describe('input packages with dynamic_signal_types: true', () => {
    it('adds permissions for input package with dynamic_signal_types: true', async () => {
      const packagePolicies: PackagePolicy[] = [
        {
          id: 'package-policy-dynamic-signal',
          name: 'otel-policy',
          namespace: 'default',
          enabled: true,
          package: { name: 'input_otel', version: '1.0.0', title: 'Input OTel' },
          inputs: [
            {
              type: 'otelcol',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'otel.dataset' },
                  vars: {},
                } as any,
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      const agentInputs = [
        {
          id: 'otelcol-input-1',
          type: 'otelcol',
          streams: [
            {
              id: 'stream-1',
              service: {
                pipelines: {
                  'logs/otlp': {
                    receivers: ['otlp'],
                  },
                  'metrics/otlp': {
                    receivers: ['otlp'],
                  },
                  'traces/otlp': {
                    receivers: ['otlp'],
                  },
                },
              },
            },
          ],
        },
      ] as any;

      const permissions = await storedPackagePoliciesToAgentPermissions(
        packageInfoCache,
        'default',
        packagePolicies,
        agentInputs
      );
      expect(permissions?.['package-policy-dynamic-signal']?.indices).toHaveLength(3);
      expect(permissions).toMatchObject({
        'package-policy-dynamic-signal': {
          indices: [
            { names: ['logs-*-*'], privileges: ['auto_configure', 'create_doc'] },
            { names: ['metrics-*-*'], privileges: ['auto_configure', 'create_doc'] },
            { names: ['traces-*-*'], privileges: ['auto_configure', 'create_doc'] },
          ],
        },
      });
    });

    it('adds permissions only for signal types defined in pipelines', async () => {
      packageInfoCache.set('input_otel_partial-1.0.0', {
        format_version: '2.7.0',
        name: 'input_otel_partial',
        title: 'Input OTel Partial',
        version: '1.0.0',
        type: 'input',
        release: 'ga',
        policy_templates: [
          {
            name: 'otel',
            title: 'OTel',
            description: 'OpenTelemetry input',
            type: 'logs',
            input: 'otelcol',
            template_path: 'input.yml.hbs',
            dynamic_signal_types: true,
            vars: [],
          },
        ],
        data_streams: [
          {
            type: 'logs',
            dataset: 'otel.logs',
            title: 'OTel Logs',
            release: 'ga',
            package: 'input_otel_partial',
            path: 'logs',
            streams: [],
          },
          {
            type: 'metrics',
            dataset: 'otel.metrics',
            title: 'OTel Metrics',
            release: 'ga',
            package: 'input_otel_partial',
            path: 'metrics',
            streams: [],
          },
          {
            type: 'traces',
            dataset: 'otel.traces',
            title: 'OTel Traces',
            release: 'ga',
            package: 'input_otel_partial',
            path: 'traces',
            streams: [],
          },
        ],
        latestVersion: '1.0.0',
        status: 'not_installed',
        assets: { kibana: {}, elasticsearch: {} },
      } as any);

      const packagePolicies: PackagePolicy[] = [
        {
          id: 'package-policy-partial-signals',
          name: 'otel-partial-policy',
          namespace: 'default',
          enabled: true,
          package: { name: 'input_otel_partial', version: '1.0.0', title: 'Input OTel Partial' },
          inputs: [
            {
              type: 'otelcol',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'otel.dataset' },
                  vars: {},
                } as any,
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      const agentInputs = [
        {
          id: 'otelcol-input-1',
          type: 'otelcol',
          streams: [
            {
              id: 'stream-1',
              service: {
                pipelines: {
                  'logs/otlp': {
                    receivers: ['otlp'],
                  },
                  'metrics/otlp': {
                    receivers: ['otlp'],
                  },
                },
              },
            },
          ],
        },
      ] as any;

      const permissions = await storedPackagePoliciesToAgentPermissions(
        packageInfoCache,
        'default',
        packagePolicies,
        agentInputs
      );

      expect(permissions?.['package-policy-partial-signals']?.indices).toHaveLength(2);
      expect(permissions).toMatchObject({
        'package-policy-partial-signals': {
          indices: [
            { names: ['logs-*-*'], privileges: ['auto_configure', 'create_doc'] },
            { names: ['metrics-*-*'], privileges: ['auto_configure', 'create_doc'] },
            // No traces pipeline - should only grant logs and metrics permissions
          ],
        },
      });
    });

    it('returns no permissions when agentInputs is not provided for dynamic_signal_types package', async () => {
      const packagePolicies: PackagePolicy[] = [
        {
          id: 'package-policy-no-inputs',
          name: 'otel-no-inputs-policy',
          namespace: 'default',
          enabled: true,
          package: { name: 'input_otel', version: '1.0.0', title: 'Input OTel' },
          inputs: [
            {
              type: 'otelcol',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'otel.dataset' },
                  vars: {},
                },
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      const permissions = await storedPackagePoliciesToAgentPermissions(
        packageInfoCache,
        'default',
        packagePolicies
      );

      // Should return empty indices array when no pipelines are found
      expect(permissions).toMatchObject({
        'package-policy-no-inputs': {
          indices: [],
        },
      });
    });
  });

  describe('OTel .otel suffix on agent permissions', () => {
    it('appends .otel suffix for non-dynamic OTel integration package logs stream', async () => {
      const packagePolicies: PackagePolicy[] = [
        {
          id: 'policy-otel-integration-logs',
          name: 'otel-integration-logs',
          namespace: 'default',
          enabled: true,
          package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
          inputs: [
            {
              type: 'otelcol',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'myintegration' },
                },
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      const permissions = await storedPackagePoliciesToAgentPermissions(
        packageInfoCache,
        'default',
        packagePolicies
      );
      expect(permissions).toMatchObject({
        'policy-otel-integration-logs': {
          indices: [
            {
              names: ['logs-myintegration.otel-default'],
              privileges: ['auto_configure', 'create_doc'],
            },
          ],
        },
      });
    });

    it('does not double-append .otel when dataset already ends in .otel', async () => {
      const packagePolicies: PackagePolicy[] = [
        {
          id: 'policy-otel-already-suffixed',
          name: 'otel-already-suffixed',
          namespace: 'default',
          enabled: true,
          package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
          inputs: [
            {
              type: 'otelcol',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'generic.otel' },
                },
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      const permissions = await storedPackagePoliciesToAgentPermissions(
        packageInfoCache,
        'default',
        packagePolicies
      );
      expect(permissions).toMatchObject({
        'policy-otel-already-suffixed': {
          indices: [
            {
              names: ['logs-generic.otel-default'],
              privileges: ['auto_configure', 'create_doc'],
            },
          ],
        },
      });
    });

    it('does not append .otel when enableOtelIntegrations is false', async () => {
      jest.spyOn(appContextService, 'getExperimentalFeatures').mockReturnValue({
        enableOtelIntegrations: false,
      } as any);

      const packagePolicies: PackagePolicy[] = [
        {
          id: 'policy-otel-flag-off',
          name: 'otel-flag-off',
          namespace: 'default',
          enabled: true,
          package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
          inputs: [
            {
              type: 'otelcol',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'myintegration' },
                },
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      const permissions = await storedPackagePoliciesToAgentPermissions(
        packageInfoCache,
        'default',
        packagePolicies
      );
      expect(permissions).toMatchObject({
        'policy-otel-flag-off': {
          indices: [
            {
              names: ['logs-myintegration-default'],
              privileges: ['auto_configure', 'create_doc'],
            },
          ],
        },
      });
    });

    it('does not append .otel when dynamic_dataset is true (wildcard already covers .otel)', async () => {
      const packagePolicies: PackagePolicy[] = [
        {
          id: 'policy-otel-dynamic-dataset',
          name: 'otel-dynamic-dataset',
          namespace: 'default',
          enabled: true,
          package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
          inputs: [
            {
              type: 'otelcol',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: {
                    type: 'logs',
                    dataset: 'myintegration',
                    elasticsearch: { dynamic_dataset: true, dynamic_namespace: true },
                  },
                },
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      const permissions = await storedPackagePoliciesToAgentPermissions(
        packageInfoCache,
        'default',
        packagePolicies
      );
      expect(permissions).toMatchObject({
        'policy-otel-dynamic-dataset': {
          indices: [
            {
              names: ['logs-*-*'],
              privileges: ['auto_configure', 'create_doc'],
            },
          ],
        },
      });
    });

    it('does not append .otel when dataset_is_prefix is true (wildcard already covers .otel)', async () => {
      // dataset_is_prefix lives on the registry RegistryDataStream, not on the policy stream's
      // data_stream object. The implementation looks it up from getNormalizedDataStreams(pkg),
      // so the package fixture must declare it there.
      packageInfoCache.set('otel_prefix_pkg-1.0.0', {
        name: 'otel_prefix_pkg',
        version: '1.0.0',
        latestVersion: '1.0.0',
        release: 'ga',
        format_version: '2.7.0',
        title: 'OTel Prefix Pkg',
        description: '',
        type: 'integration',
        status: 'not_installed',
        assets: { kibana: {}, elasticsearch: {} },
        policy_templates: [
          {
            name: 'otel',
            title: 'OTel',
            description: 'OTel input',
            inputs: [{ type: 'otelcol', title: 'OTel', description: 'OTel' }],
          },
        ],
        data_streams: [
          {
            type: 'logs',
            dataset: 'myintegration',
            title: 'My Integration Logs',
            release: 'ga',
            package: 'otel_prefix_pkg',
            path: 'logs',
            dataset_is_prefix: true,
            streams: [{ input: 'otelcol', title: 'OTel Logs', template_path: '' }],
          },
        ],
      } as any);

      const packagePolicies: PackagePolicy[] = [
        {
          id: 'policy-otel-dataset-prefix',
          name: 'otel-dataset-prefix',
          namespace: 'default',
          enabled: true,
          package: { name: 'otel_prefix_pkg', version: '1.0.0', title: 'OTel Prefix Pkg' },
          inputs: [
            {
              type: 'otelcol',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'myintegration' },
                },
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      const permissions = await storedPackagePoliciesToAgentPermissions(
        packageInfoCache,
        'default',
        packagePolicies
      );
      expect(permissions).toMatchObject({
        'policy-otel-dataset-prefix': {
          indices: [
            {
              names: ['logs-myintegration.*-default'],
              privileges: ['auto_configure', 'create_doc'],
            },
          ],
        },
      });
    });
  });

  describe('data_stream.type undefined handling', () => {
    it('throws for non-dynamic package stream with undefined data_stream.type', () => {
      const packagePolicies: PackagePolicy[] = [
        {
          id: 'policy-undefined-type',
          name: 'non-dynamic-policy',
          namespace: 'default',
          enabled: true,
          package: { name: 'non_dynamic_pkg', version: '1.0.0', title: 'Non Dynamic Package' },
          inputs: [
            {
              type: 'logfile',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: { dataset: 'non_dynamic_pkg.logs' },
                } as any,
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      const invoke = () =>
        storedPackagePoliciesToAgentPermissions(packageInfoCache, 'default', packagePolicies);
      expect(invoke).toThrow(PackagePolicyValidationError);
      expect(invoke).toThrow(
        '[data_stream.type]: unexpected undefined stream type for non-dynamic package "non_dynamic_pkg"'
      );
    });

    it('does not throw for dynamic_signal_types package stream with undefined data_stream.type', () => {
      const packagePolicies: PackagePolicy[] = [
        {
          id: 'policy-dynamic-no-type',
          name: 'dynamic-no-type-policy',
          namespace: 'default',
          enabled: true,
          package: { name: 'input_otel', version: '1.0.0', title: 'Input OTel' },
          inputs: [
            {
              type: 'otelcol',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: { dataset: 'otel.dataset' },
                  vars: {},
                } as any,
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      // dynamic_signal_types packages are handled separately and do not reach the DataStreamMeta guard
      expect(() =>
        storedPackagePoliciesToAgentPermissions(packageInfoCache, 'default', packagePolicies)
      ).not.toThrow();
    });

    it('grants normal data-stream permissions for a non-dynamic input even when another template in the same package has dynamic_signal_types', () => {
      // Package has two policy templates: 'otel_policy' (dynamic) and 'logfile_policy' (non-dynamic).
      // A package policy using 'logfile_policy' should get regular per-data-stream permissions,
      // not the wildcard dynamic permissions that belong to the otelcol template.
      const mixedPkgKey = 'mixed_multi_template_pkg-1.0.0';
      packageInfoCache.set(mixedPkgKey, {
        format_version: '2.7.0',
        name: 'mixed_multi_template_pkg',
        title: 'Mixed Multi Template Pkg',
        version: '1.0.0',
        type: 'integration',
        release: 'ga',
        policy_templates: [
          {
            name: 'otel_policy',
            title: 'OTel',
            description: 'OTel inputs',
            inputs: [
              {
                type: 'otelcol',
                title: 'OTel',
                description: 'OTel',
                dynamic_signal_types: true,
              },
            ],
          },
          {
            name: 'logfile_policy',
            title: 'Logfile',
            description: 'Logfile inputs',
            inputs: [{ type: 'logfile', title: 'Logfile', description: 'Logfile' }],
          },
        ],
        data_streams: [
          {
            type: 'logs',
            dataset: 'mixed_multi_template_pkg.app',
            title: 'App Logs',
            release: 'ga',
            package: 'mixed_multi_template_pkg',
            path: 'app',
            streams: [],
          },
        ],
        latestVersion: '1.0.0',
        status: 'not_installed',
        assets: { kibana: {}, elasticsearch: {} },
      } as any);

      const packagePolicies: PackagePolicy[] = [
        {
          id: 'policy-logfile',
          name: 'logfile-policy',
          namespace: 'default',
          enabled: true,
          package: {
            name: 'mixed_multi_template_pkg',
            version: '1.0.0',
            title: 'Mixed Multi Template Pkg',
          },
          inputs: [
            {
              type: 'logfile',
              policy_template: 'logfile_policy',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: {
                    type: 'logs',
                    dataset: 'mixed_multi_template_pkg.app',
                  },
                  vars: {},
                } as any,
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      const permissions = storedPackagePoliciesToAgentPermissions(
        packageInfoCache,
        'default',
        packagePolicies
      );

      // The logfile input is non-dynamic — should get a concrete data stream permission,
      // NOT the wildcard logs-*-* / metrics-*-* / traces-*-* from the otelcol template.
      expect(permissions?.['policy-logfile']?.indices).toHaveLength(1);
      expect(permissions?.['policy-logfile']?.indices?.[0].names).toEqual([
        'logs-mixed_multi_template_pkg.app-default',
      ]);
    });

    it('grants normal data-stream permissions for a non-dynamic input when the same template also has a different dynamic input type', () => {
      // Single template 'combined_policy' with two inputs:
      //   - 'logfile'  — no dynamic_signal_types
      //   - 'otelcol'  — dynamic_signal_types: true
      // A package policy using only the 'logfile' input should get concrete stream permissions.
      const combinedPkgKey = 'combined_inputs_pkg-1.0.0';
      packageInfoCache.set(combinedPkgKey, {
        format_version: '2.7.0',
        name: 'combined_inputs_pkg',
        title: 'Combined Inputs Pkg',
        version: '1.0.0',
        type: 'integration',
        release: 'ga',
        policy_templates: [
          {
            name: 'combined_policy',
            title: 'Combined',
            description: 'Combined inputs',
            inputs: [
              { type: 'logfile', title: 'Logfile', description: 'Logfile' },
              { type: 'otelcol', title: 'OTel', description: 'OTel', dynamic_signal_types: true },
            ],
          },
        ],
        data_streams: [
          {
            type: 'logs',
            dataset: 'combined_inputs_pkg.app',
            title: 'App Logs',
            release: 'ga',
            package: 'combined_inputs_pkg',
            path: 'app',
            streams: [],
          },
        ],
        latestVersion: '1.0.0',
        status: 'not_installed',
        assets: { kibana: {}, elasticsearch: {} },
      } as any);

      const packagePolicies: PackagePolicy[] = [
        {
          id: 'policy-combined-logfile',
          name: 'combined-logfile-policy',
          namespace: 'default',
          enabled: true,
          package: {
            name: 'combined_inputs_pkg',
            version: '1.0.0',
            title: 'Combined Inputs Pkg',
          },
          inputs: [
            {
              type: 'logfile',
              policy_template: 'combined_policy',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'combined_inputs_pkg.app' },
                  vars: {},
                } as any,
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      const permissions = storedPackagePoliciesToAgentPermissions(
        packageInfoCache,
        'default',
        packagePolicies
      );

      // Only the logfile input is enabled — should get one concrete stream permission,
      // NOT wildcard dynamic permissions from the sibling otelcol input definition.
      expect(permissions?.['policy-combined-logfile']?.indices).toHaveLength(1);
      expect(permissions?.['policy-combined-logfile']?.indices?.[0].names).toEqual([
        'logs-combined_inputs_pkg.app-default',
      ]);
    });

    it('uses data_stream.type var value for permissions when it overrides stream.data_stream.type', () => {
      // Simulates a sql_input policy where policyTemplate.type is 'metrics' but the user
      // overrode data_stream.type to 'logs' via the simplified API. The saved stream retains
      // data_stream.type = 'metrics' on the stream object; the override lives in the var.
      const packagePolicies: PackagePolicy[] = [
        {
          id: 'sql-logs-override',
          name: 'sql-logs-override-policy',
          namespace: 'default',
          enabled: true,
          package: { name: 'sql_input', version: '1.0.0', title: 'SQL Input' },
          inputs: [
            {
              type: 'sql/metrics',
              enabled: true,
              streams: [
                {
                  id: 'stream-1',
                  enabled: true,
                  data_stream: {
                    type: 'metrics',
                    dataset: 'sql_input.mysql',
                    elasticsearch: { dynamic_dataset: true, dynamic_namespace: true },
                  },
                  vars: {
                    [DATA_STREAM_TYPE_VAR_NAME]: { value: 'logs' },
                  },
                } as any,
              ],
            },
          ],
          created_at: '',
          updated_at: '',
          created_by: '',
          updated_by: '',
          revision: 1,
          policy_id: '',
          policy_ids: [''],
        },
      ];

      const permissions = storedPackagePoliciesToAgentPermissions(
        packageInfoCache,
        'default',
        packagePolicies
      );

      expect(permissions?.['sql-logs-override']?.indices).toHaveLength(1);
      // Must use 'logs-*-*', not 'metrics-*-*'
      expect(permissions?.['sql-logs-override']?.indices?.[0].names).toEqual(['logs-*-*']);
    });
  });
});

describe('getDataStreamPrivileges()', () => {
  it('returns defaults for a datastream with no privileges', () => {
    const dataStream = { type: 'logs', dataset: 'test' } as DataStreamMeta;
    const privileges = getDataStreamPrivileges(dataStream);

    expect(privileges).toMatchObject({
      names: ['logs-test-*'],
      privileges: ['auto_configure', 'create_doc'],
    });
  });

  it('adds the namespace to the index name', () => {
    const dataStream = { type: 'logs', dataset: 'test' } as DataStreamMeta;
    const privileges = getDataStreamPrivileges(dataStream, 'namespace');

    expect(privileges).toMatchObject({
      names: ['logs-test-namespace'],
      privileges: ['auto_configure', 'create_doc'],
    });
  });

  it('appends a wildcard if dataset is prefix', () => {
    const dataStream = {
      type: 'logs',
      dataset: 'test',
      dataset_is_prefix: true,
    } as DataStreamMeta;
    const privileges = getDataStreamPrivileges(dataStream, 'namespace');

    expect(privileges).toMatchObject({
      names: ['logs-test.*-namespace'],
      privileges: ['auto_configure', 'create_doc'],
    });
  });

  it('prepends a dot if datastream is hidden', () => {
    const dataStream = {
      type: 'logs',
      dataset: 'test',
      hidden: true,
    } as DataStreamMeta;
    const privileges = getDataStreamPrivileges(dataStream, 'namespace');

    expect(privileges).toMatchObject({
      names: ['.logs-test-namespace'],
      privileges: ['auto_configure', 'create_doc'],
    });
  });

  it('uses custom privileges if they are present in the datastream', () => {
    const dataStream = {
      type: 'logs',
      dataset: 'test',
      elasticsearch: {
        privileges: { indices: ['read', 'monitor'] },
      },
    } as DataStreamMeta;
    const privileges = getDataStreamPrivileges(dataStream, 'namespace');

    expect(privileges).toMatchObject({
      names: ['logs-test-namespace'],
      privileges: ['read', 'monitor'],
    });
  });

  it('sets a wildcard namespace when dynamic_namespace: true', () => {
    const dataStream = {
      type: 'logs',
      dataset: 'test',
      elasticsearch: {
        dynamic_namespace: true,
      },
    } as DataStreamMeta;
    const privileges = getDataStreamPrivileges(dataStream, 'namespace');

    expect(privileges).toMatchObject({
      names: ['logs-test-*'],
      privileges: ['auto_configure', 'create_doc'],
    });
  });

  it('sets a wildcard dataset when dynamic_dataset: true', () => {
    const dataStream = {
      type: 'logs',
      dataset: 'test',
      elasticsearch: {
        dynamic_dataset: true,
      },
    } as DataStreamMeta;
    const privileges = getDataStreamPrivileges(dataStream, 'namespace');

    expect(privileges).toMatchObject({
      names: ['logs-*-namespace'],
      privileges: ['auto_configure', 'create_doc'],
    });
  });

  it('sets a wildcard namespace and dataset when dynamic_namespace: true and dynamic_dataset: true', () => {
    const dataStream = {
      type: 'logs',
      dataset: 'test',
      elasticsearch: {
        dynamic_dataset: true,
        dynamic_namespace: true,
      },
    } as DataStreamMeta;
    const privileges = getDataStreamPrivileges(dataStream, 'namespace');

    expect(privileges).toMatchObject({
      names: ['logs-*-*'],
      privileges: ['auto_configure', 'create_doc'],
    });
  });

  it('targets Universal Profiling index patterns for the profiles signal regardless of dataset/namespace', () => {
    const dataStream = { type: 'profiles', dataset: 'profilingreceiver' } as DataStreamMeta;
    const privileges = getDataStreamPrivileges(dataStream, 'namespace');

    // profiles is owned end-to-end by Universal Profiling; permissions cover both legacy
    // profiling-* custom indices and future profiles-* data streams.
    expect(privileges).toEqual({
      names: ['profiling-*', 'profiles-*'],
      privileges: UNIVERSAL_PROFILING_PERMISSIONS,
    });
  });

  it('uses custom privileges for the profiles signal when present', () => {
    const dataStream = {
      type: 'profiles',
      dataset: 'profilingreceiver',
      elasticsearch: {
        privileges: { indices: ['create_doc'] },
      },
    } as DataStreamMeta;
    const privileges = getDataStreamPrivileges(dataStream, 'namespace');

    expect(privileges).toEqual({
      names: ['profiling-*', 'profiles-*'],
      privileges: ['create_doc'],
    });
  });
});

it('Returns the Elastic Connectors permissions for elastic_connectors package', async () => {
  const packagePolicies: PackagePolicy[] = [
    {
      id: 'package-policy-uuid-test-123',
      name: 'test-policy',
      namespace: '',
      enabled: true,
      package: { name: 'elastic_connectors', version: '1.0.0', title: 'Elastic Connectors' },
      inputs: [
        {
          type: 'connectors-py',
          enabled: true,
          streams: [],
        },
      ],
      created_at: '',
      updated_at: '',
      created_by: '',
      updated_by: '',
      revision: 1,
      policy_id: '',
      policy_ids: [''],
    },
  ];

  const permissions = await storedPackagePoliciesToAgentPermissions(
    packageInfoCache,
    'test',
    packagePolicies
  );

  expect(permissions).toMatchObject({
    'package-policy-uuid-test-123': {
      cluster: ['manage_connector'],
      indices: [
        {
          names: ['.elastic-connectors*'],
          privileges: ELASTIC_CONNECTORS_INDEX_PERMISSIONS,
        },
        {
          names: ['content-*', '.search-acl-filter-*'],
          privileges: ELASTIC_CONNECTORS_INDEX_PERMISSIONS,
        },
        {
          names: ['logs-elastic_agent*'],
          privileges: ['auto_configure', 'create_doc'],
        },
      ],
    },
  });
});
