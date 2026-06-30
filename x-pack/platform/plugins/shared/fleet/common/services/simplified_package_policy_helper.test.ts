/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { NewPackagePolicy, PackageInfo } from '../../server/types';
import { PackagePolicyValidationError } from '../errors';

import nginxPackageInfo from '../../server/services/package_policies/fixtures/package_info/nginx_1.5.0.json';

import {
  simplifiedPackagePolicytoNewPackagePolicy,
  packagePolicyToSimplifiedPackagePolicy,
  generateInputId,
  toNewAgentlessPolicy,
} from './simplified_package_policy_helper';

jest.mock('./cloud_connectors', () => ({
  ...jest.requireActual('./cloud_connectors'),
  detectTargetCsp: jest.fn(() => undefined),
}));

/**
 * Minimal multi-template package fixture covering both shapes of the
 * deployment-mode annotation that drove https://github.com/elastic/kibana/issues/268930:
 *
 * - `otel`: a normal template with no `deployment_modes` annotation. Implicitly
 *   allowed in both default and agentless modes.
 * - `apache-agentless`: a template marked agentless-only at the template level
 *   (`deployment_modes.default.enabled = false`). Its `aws/s3` input is also
 *   annotated `deployment_modes: ['agentless']` for good measure.
 * - `mixed`: a template with no template-level annotation but a per-input
 *   annotation: `httpjson` is unannotated (allowed everywhere), `cel` is
 *   annotated `deployment_modes: ['agentless']`.
 */
const multiTemplatePkgInfo = {
  name: 'good_v3',
  title: 'Good v3',
  version: '1.0.0',
  description: 'Test package with multiple policy templates',
  type: 'integration',
  format_version: '3.0.0',
  owner: { github: 'elastic/fleet' },
  policy_templates: [
    {
      name: 'otel',
      title: 'OTel template',
      description: 'Default-allowed template',
      inputs: [{ type: 'otelcol', title: 'OTel collector', description: '' }],
      multiple: true,
    },
    {
      name: 'apache-agentless',
      title: 'Apache agentless template',
      description: 'Agentless-only template',
      deployment_modes: {
        agentless: { enabled: true },
        default: { enabled: false },
      },
      inputs: [
        {
          type: 'aws/s3',
          title: 'AWS S3',
          description: '',
          deployment_modes: ['agentless'],
        },
      ],
      multiple: false,
    },
    {
      name: 'mixed',
      title: 'Mixed template',
      description: 'Template with default-allowed and agentless-only inputs',
      inputs: [
        { type: 'httpjson', title: 'HTTP JSON', description: '' },
        {
          type: 'cel',
          title: 'CEL',
          description: '',
          deployment_modes: ['agentless'],
        },
      ],
      multiple: true,
    },
  ],
  data_streams: [
    {
      type: 'logs',
      dataset: 'good_v3.otel_logs',
      title: 'OTel logs',
      release: 'ga',
      package: 'good_v3',
      ingest_pipeline: 'default',
      path: 'otel_logs',
      streams: [
        {
          input: 'otelcol',
          title: 'OTel logs stream',
          description: '',
          vars: [],
          template_path: '',
        },
      ],
    },
    {
      type: 'logs',
      dataset: 'good_v3.s3_logs',
      title: 'S3 logs',
      release: 'ga',
      package: 'good_v3',
      ingest_pipeline: 'default',
      path: 's3_logs',
      streams: [
        {
          input: 'aws/s3',
          title: 'S3 logs stream',
          description: '',
          vars: [],
          template_path: '',
        },
      ],
    },
    {
      type: 'logs',
      dataset: 'good_v3.cel_logs',
      title: 'CEL logs',
      release: 'ga',
      package: 'good_v3',
      ingest_pipeline: 'default',
      path: 'cel_logs',
      streams: [
        {
          input: 'cel',
          title: 'CEL logs stream',
          description: '',
          vars: [],
          template_path: '',
        },
      ],
    },
  ],
  latestVersion: '1.0.0',
  keepPoliciesUpToDate: false,
  status: 'not_installed',
} as unknown as PackageInfo;

function getEnabledInputsAndStreams(newPackagePolicy: NewPackagePolicy) {
  return newPackagePolicy.inputs
    .filter((input) => input.enabled)
    .reduce((acc, input) => {
      const inputId = generateInputId(input);

      acc[inputId] = input.streams
        .filter((stream) => stream.enabled)
        .map((stream) => stream.data_stream.dataset);

      return acc;
    }, {} as Record<string, string[]>);
}

describe('generateInputId', () => {
  it('should use name instead of type when name is present', () => {
    expect(
      generateInputId({
        type: 'otelcol',
        name: 'filelog_otel',
        policy_template: 'nginx',
        enabled: true,
        streams: [],
      })
    ).toBe('nginx-filelog_otel');
  });

  it('should fall back to type when name is not present', () => {
    expect(
      generateInputId({
        type: 'logfile',
        policy_template: 'nginx',
        enabled: true,
        streams: [],
      })
    ).toBe('nginx-logfile');
  });

  it('should use name without policy_template prefix when policy_template is not stored on the input (single-template packages)', () => {
    expect(
      generateInputId({
        type: 'otelcol',
        name: 'filelog_otel',
        enabled: true,
        streams: [],
      })
    ).toBe('filelog_otel');
  });
});

describe('toPackagePolicy', () => {
  describe('With nginx package', () => {
    it('should work', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'nginx-1',
          namespace: 'default',
          policy_id: 'policy123',
          policy_ids: ['policy123'],
          supports_cloud_connector: undefined,
          cloud_connector_id: undefined,
          output_id: 'output123',
          description: 'Test description',
          inputs: {
            'nginx-logfile': {
              streams: {
                'nginx.error': {
                  vars: {
                    tags: ['test', 'nginx-error'],
                  },
                },
              },
            },
            'nginx-nginx/metrics': {},
          },
        },
        nginxPackageInfo as unknown as PackageInfo
      );

      expect(res).toMatchSnapshot();
    });

    it('should enable default inputs streams', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'nginx-1',
          namespace: 'default',
          policy_id: 'policy123',
          policy_ids: ['policy123'],
          description: 'Test description',
        },
        nginxPackageInfo as unknown as PackageInfo
      );

      expect(getEnabledInputsAndStreams(res)).toEqual({
        'nginx-logfile': ['nginx.access', 'nginx.error'],
        'nginx-nginx/metrics': ['nginx.stubstatus'],
      });
    });

    it('should allow user to disable inputs', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'nginx-1',
          namespace: 'default',
          policy_id: 'policy123',
          policy_ids: ['policy123'],
          description: 'Test description',
          inputs: {
            'nginx-logfile': { enabled: false },
          },
        },
        nginxPackageInfo as unknown as PackageInfo
      );

      expect(getEnabledInputsAndStreams(res)).toEqual({
        'nginx-nginx/metrics': ['nginx.stubstatus'],
      });
    });

    it('should allow user to disable streams', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'nginx-1',
          namespace: 'default',
          policy_id: 'policy123',
          policy_ids: ['policy123'],
          description: 'Test description',
          inputs: {
            'nginx-logfile': {
              streams: {
                'nginx.error': { enabled: false },
              },
            },
          },
        },
        nginxPackageInfo as unknown as PackageInfo
      );

      expect(getEnabledInputsAndStreams(res)).toEqual({
        'nginx-logfile': ['nginx.access'],
        'nginx-nginx/metrics': ['nginx.stubstatus'],
      });
    });

    it('should to pass experimental_data_stream_features', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'nginx-1',
          namespace: 'default',
          policy_id: 'policy123',
          policy_ids: ['policy123'],
          description: 'Test description',
        },
        nginxPackageInfo as unknown as PackageInfo,
        {
          experimental_data_stream_features: [
            {
              data_stream: 'logs-nginx.access',
              features: {
                synthetic_source: true,
                tsdb: false,
                doc_value_only_numeric: false,
                doc_value_only_other: false,
              },
            },
          ],
        }
      );

      expect(res.package?.experimental_data_stream_features).toEqual([
        {
          data_stream: 'logs-nginx.access',
          features: {
            synthetic_source: true,
            tsdb: false,
            doc_value_only_numeric: false,
            doc_value_only_other: false,
          },
        },
      ]);
    });

    it('should to pass additional_datastreams_permissions', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'nginx-1',
          namespace: 'default',
          policy_id: 'policy123',
          policy_ids: ['policy123'],
          description: 'Test description',
          additional_datastreams_permissions: ['logs-test-123'],
        },
        nginxPackageInfo as unknown as PackageInfo
      );

      expect(res.additional_datastreams_permissions).toEqual(['logs-test-123']);
    });

    it('should preserve var_group_selections when creating package policy', () => {
      const varGroupSelections = { auth_method: 'api_key' };
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'nginx-1',
          namespace: 'default',
          policy_id: 'policy123',
          policy_ids: ['policy123'],
          description: 'Test description',
          var_group_selections: varGroupSelections,
        },
        nginxPackageInfo as unknown as PackageInfo
      );

      expect(res.var_group_selections).toEqual(varGroupSelections);
    });

    it('should include var_group_selections when converting back to simplified policy', () => {
      const varGroupSelections = { auth_method: 'api_key' };
      const packagePolicy = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'nginx-1',
          namespace: 'default',
          policy_id: 'policy123',
          policy_ids: ['policy123'],
          description: 'Test description',
          var_group_selections: varGroupSelections,
        },
        nginxPackageInfo as unknown as PackageInfo
      );

      const simplified = packagePolicyToSimplifiedPackagePolicy(packagePolicy as any);

      expect((simplified as any).var_group_selections).toEqual(varGroupSelections);
    });
  });

  describe('With input-only package', () => {
    const inputPkgInfo: PackageInfo = {
      name: 'log',
      type: 'input',
      title: 'Custom logs',
      version: '2.4.0',
      description: 'Collect custom logs with Elastic Agent.',
      format_version: '3.1.5',
      owner: { github: '' },
      assets: {} as any,
      data_streams: [],
      policy_templates: [
        {
          name: 'logs',
          type: 'logs',
          title: 'Custom log file',
          description: 'Collect logs from custom files.',
          input: 'logfile',
          template_path: 'input.yml.hbs',
          vars: [],
        },
      ],
      latestVersion: '2.4.0',
      keepPoliciesUpToDate: false,
      status: 'not_installed',
    };

    it('should accept data_stream.type via simplified API for input packages', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'log-1',
          namespace: 'default',
          policy_ids: ['policy123'],
          inputs: {
            'logs-logfile': {
              streams: {
                'log.logs': {
                  vars: {
                    'data_stream.type': 'metrics',
                  },
                },
              },
            },
          },
        },
        inputPkgInfo
      );

      const streamVars = res.inputs[0].streams[0].vars;
      expect(streamVars?.['data_stream.type']?.value).toEqual('metrics');
      expect(res.inputs[0].streams[0].data_stream.type).toEqual('metrics');
    });

    it('should reject data_stream.type via simplified API when dynamic_signal_types is true', () => {
      const dynamicPkgInfo: PackageInfo = {
        ...inputPkgInfo,
        policy_templates: [
          {
            name: 'otel',
            title: 'OTel',
            description: 'OTel input',
            input: 'otelcol',
            template_path: 'input.yml.hbs',
            vars: [],
            dynamic_signal_types: true,
          } as any,
        ],
      };

      expect(() =>
        simplifiedPackagePolicytoNewPackagePolicy(
          {
            name: 'otel-1',
            namespace: 'default',
            policy_ids: ['policy123'],
            inputs: {
              'otel-otelcol': {
                streams: {
                  'log.otel': {
                    vars: {
                      'data_stream.type': 'metrics',
                    },
                  },
                },
              },
            },
          },
          dynamicPkgInfo
        )
      ).toThrow(PackagePolicyValidationError);
    });
  });

  /**
   * Regression tests for https://github.com/elastic/kibana/issues/268930.
   *
   * When a multi-policy-template package is used with the simplified API and
   * the resulting policy targets the default deployment mode, inputs that the
   * package spec marks as not allowed in default mode (either via a
   * template-level `deployment_modes.default.enabled = false` flag or a
   * per-input `deployment_modes: ['agentless']` annotation) must come out as
   * `enabled: false` so that `validateDeploymentModesForInputs` does not
   * reject the policy with a 400.
   *
   * Agentless mode is intentionally not subject to this filtering: that flow
   * already routes through an explicit `policy_template` and would not benefit.
   */
  describe('default-mode filtering for multi-template packages', () => {
    it('disables inputs from agentless-only templates when no inputs are listed', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'good-v3-defaults',
          namespace: 'default',
          policy_ids: ['policy123'],
        },
        multiTemplatePkgInfo
      );

      const apacheInput = res.inputs.find((input) => input.policy_template === 'apache-agentless');
      expect(apacheInput).toBeDefined();
      expect(apacheInput?.enabled).toBe(false);
    });

    it('disables agentless-only inputs inside otherwise default-allowed templates', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'good-v3-defaults',
          namespace: 'default',
          policy_ids: ['policy123'],
        },
        multiTemplatePkgInfo
      );

      const celInput = res.inputs.find(
        (input) => input.policy_template === 'mixed' && input.type === 'cel'
      );
      const httpjsonInput = res.inputs.find(
        (input) => input.policy_template === 'mixed' && input.type === 'httpjson'
      );

      expect(celInput?.enabled).toBe(false);
      expect(httpjsonInput?.enabled).toBe(true);
    });

    it('keeps inputs without deployment_modes annotations enabled in default mode', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'good-v3-defaults',
          namespace: 'default',
          policy_ids: ['policy123'],
        },
        multiTemplatePkgInfo
      );

      const otelInput = res.inputs.find((input) => input.policy_template === 'otel');
      expect(otelInput?.enabled).toBe(true);
    });

    it('disables streams of inputs filtered out by default-mode policy', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'good-v3-defaults',
          namespace: 'default',
          policy_ids: ['policy123'],
        },
        multiTemplatePkgInfo
      );

      const apacheInput = res.inputs.find((input) => input.policy_template === 'apache-agentless');
      expect(apacheInput?.streams.length).toBeGreaterThan(0);
      expect(apacheInput?.streams.every((stream) => stream.enabled === false)).toBe(true);
    });

    it('does not affect agentless policies (symmetric behavior intentionally omitted)', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'good-v3-agentless',
          namespace: 'default',
          policy_ids: ['policy123'],
          supports_agentless: true,
        },
        multiTemplatePkgInfo
      );

      const apacheInput = res.inputs.find((input) => input.policy_template === 'apache-agentless');
      const celInput = res.inputs.find(
        (input) => input.policy_template === 'mixed' && input.type === 'cel'
      );
      expect(apacheInput?.enabled).toBe(true);
      expect(celInput?.enabled).toBe(true);
    });

    it('is a no-op for packages without deployment_modes annotations', () => {
      const res = simplifiedPackagePolicytoNewPackagePolicy(
        {
          name: 'nginx-1',
          namespace: 'default',
          policy_ids: ['policy123'],
        },
        nginxPackageInfo as unknown as PackageInfo
      );

      expect(getEnabledInputsAndStreams(res)).toEqual({
        'nginx-logfile': ['nginx.access', 'nginx.error'],
        'nginx-nginx/metrics': ['nginx.stubstatus'],
      });
    });
  });
});

describe('toNewAgentlessPolicy', () => {
  const { detectTargetCsp } = jest.requireMock('./cloud_connectors');

  type AgentlessPolicyInput = NewPackagePolicy & {
    force?: boolean;
    create_dataset_templates?: boolean;
  };

  const createPackagePolicy = (
    overrides: Partial<AgentlessPolicyInput> = {}
  ): AgentlessPolicyInput => ({
    name: 'my-agentless-policy',
    namespace: 'default',
    description: 'a description',
    enabled: true,
    policy_ids: ['agent-policy-1'],
    package: { name: 'cspm', title: 'CSPM', version: '1.0.0' },
    inputs: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    detectTargetCsp.mockReturnValue(undefined);
  });

  it('maps the allowlisted fields and strips the disallowed ones', () => {
    const result = toNewAgentlessPolicy(
      createPackagePolicy({
        global_data_tags: [{ name: 'team', value: 'fleet' }],
        additional_datastreams_permissions: ['logs-*'],
        force: true,
        create_dataset_templates: false,
      })
    );

    expect(result).toEqual({
      name: 'my-agentless-policy',
      namespace: 'default',
      description: 'a description',
      global_data_tags: [{ name: 'team', value: 'fleet' }],
      additional_datastreams_permissions: ['logs-*'],
      force: true,
      create_dataset_templates: false,
      package: { name: 'cspm', version: '1.0.0' },
      id: undefined,
      inputs: {},
      vars: undefined,
    });
  });

  it('disables inputs that are blocked in agentless mode', () => {
    // 'logfile' is in AGENTLESS_DISABLED_INPUTS — should be forced to enabled=false
    const result = toNewAgentlessPolicy(
      createPackagePolicy({
        inputs: [{ type: 'logfile', enabled: true, streams: [], vars: undefined }],
      })
    );

    expect(result.inputs).toMatchObject({ logfile: { enabled: false } });
  });

  it('strips package.title', () => {
    const result = toNewAgentlessPolicy(createPackagePolicy());

    expect(result.package).toEqual({ name: 'cspm', version: '1.0.0' });
    expect(result.package).not.toHaveProperty('title');
  });

  it('stringifies the id when present', () => {
    const result = toNewAgentlessPolicy(createPackagePolicy({ id: 123 as unknown as string }));

    expect(result.id).toBe('123');
  });

  it('does not forward fields that are not part of the agentless contract', () => {
    const result = toNewAgentlessPolicy(
      createPackagePolicy({
        policy_id: 'agent-policy-1',
        policy_ids: ['agent-policy-1'],
        supports_agentless: true,
        output_id: 'output-1',
        condition: 'true',
        supports_cloud_connector: false,
        cloud_connector_id: 'cc-1',
        cloud_connector_name: 'cc-name',
      })
    );

    expect(result).not.toHaveProperty('policy_id');
    expect(result).not.toHaveProperty('policy_ids');
    expect(result).not.toHaveProperty('supports_agentless');
    expect(result).not.toHaveProperty('output_id');
    expect(result).not.toHaveProperty('condition');
    expect(result).not.toHaveProperty('enabled');
    expect(result).not.toHaveProperty('supports_cloud_connector');
    expect(result).not.toHaveProperty('cloud_connector_id');
    expect(result).not.toHaveProperty('cloud_connector_name');
    // supports_cloud_connector is false → no nested cloud_connector
    expect(result).not.toHaveProperty('cloud_connector');
  });

  it('drops unknown/new fields not in the allowlist (leak-proof contract)', () => {
    // These fields exist on NewPackagePolicy (or could be added in the future) and
    // are NOT part of the agentless contract. A blocklist would silently forward
    // them; the pick allowlist must drop them.
    const result = toNewAgentlessPolicy(
      createPackagePolicy({
        is_managed: true,
        overrides: { inputs: { 'some-input': { enabled: false } } },
        elasticsearch: { privileges: { cluster: ['monitor'] } },
        var_group_selections: { group: 'selection' },
      })
    );

    expect(result).not.toHaveProperty('is_managed');
    expect(result).not.toHaveProperty('overrides');
    expect(result).not.toHaveProperty('elasticsearch');
  });

  describe('cloud_connector', () => {
    it('reuses an existing connector when cloud_connector_id is set', () => {
      const result = toNewAgentlessPolicy(
        createPackagePolicy({
          supports_cloud_connector: true,
          cloud_connector_id: 'cc-123',
          cloud_connector_name: 'ignored-when-id-present',
        })
      );

      expect(result.cloud_connector).toEqual({
        enabled: true,
        cloud_connector_id: 'cc-123',
      });
    });

    it('creates a new connector with name when no cloud_connector_id', () => {
      const result = toNewAgentlessPolicy(
        createPackagePolicy({
          supports_cloud_connector: true,
          cloud_connector_name: 'new-connector',
        })
      );

      expect(result.cloud_connector).toEqual({
        enabled: true,
        name: 'new-connector',
      });
    });

    it('injects target_csp when detected', () => {
      detectTargetCsp.mockReturnValue('aws');

      const result = toNewAgentlessPolicy(
        createPackagePolicy({
          supports_cloud_connector: true,
          cloud_connector_id: 'cc-123',
        })
      );

      expect(result.cloud_connector).toEqual({
        enabled: true,
        target_csp: 'aws',
        cloud_connector_id: 'cc-123',
      });
    });

    it('passes the policy and varGroups to detectTargetCsp', () => {
      const policy = createPackagePolicy();
      const varGroups = [
        { name: 'auth', title: 'Auth', selector_title: 'Select auth', options: [] },
      ];

      toNewAgentlessPolicy(policy, varGroups);

      expect(detectTargetCsp).toHaveBeenCalledWith(policy, varGroups);
    });
  });
});
