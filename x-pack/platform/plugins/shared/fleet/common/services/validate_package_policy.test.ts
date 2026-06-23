/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import { validateAgentConditionExpression } from '@kbn/elastic-agent-condition-language';

import { installationStatuses } from '../constants';
import type {
  PackageInfo,
  NewPackagePolicy,
  RegistryPolicyTemplate,
  NewPackagePolicyInputStream,
  NewPackagePolicyInput,
} from '../types';

import {
  validatePackagePolicy,
  validatePackagePolicyConfig,
  validationHasErrors,
  parseDuration,
} from './validate_package_policy';
import { AWS_PACKAGE, INVALID_AWS_POLICY, VALID_AWS_POLICY } from './fixtures/aws_package';

const deps = { safeLoadYaml: parse, conditionValidator: validateAgentConditionExpression };

describe('Fleet - validatePackagePolicy()', () => {
  describe('works for packages with single policy template (aka no integrations)', () => {
    const mockPackage = {
      name: 'mock-package',
      title: 'Mock package',
      version: '0.0.0',
      description: 'description',
      type: 'mock',
      categories: [],
      requirement: { kibana: { versions: '' }, elasticsearch: { versions: '' } },
      format_version: '',
      download: '',
      path: '',
      assets: {
        kibana: {
          dashboard: [],
          visualization: [],
          search: [],
          'index-pattern': [],
        },
      },
      status: installationStatuses.NotInstalled,
      data_streams: [
        {
          dataset: 'foo',
          streams: [
            {
              input: 'foo',
              title: 'Foo',
              vars: [{ name: 'var-name', type: 'yaml' }],
            },
          ],
        },
        {
          dataset: 'bar',
          streams: [
            {
              input: 'bar',
              title: 'Bar',
              vars: [{ name: 'var-name', type: 'yaml', required: true }],
            },
            {
              input: 'with-no-stream-vars',
              title: 'Bar stream no vars',
              enabled: true,
            },
          ],
        },
        {
          dataset: 'bar2',
          streams: [
            {
              input: 'bar',
              title: 'Bar 2',
              vars: [{ default: 'bar2-var-value', name: 'var-name', type: 'text' }],
            },
          ],
        },
        {
          dataset: 'bar3',
          streams: [
            {
              input: 'bar',
              title: 'Bar 3',
              vars: [{ default: true, name: 'var-name', type: 'bool' }],
            },
          ],
        },
        {
          dataset: 'disabled',
          streams: [
            {
              input: 'with-disabled-streams',
              title: 'Disabled',
              enabled: false,
              vars: [{ multi: true, required: true, name: 'var-name', type: 'text' }],
            },
          ],
        },
        {
          dataset: 'disabled2',
          streams: [
            {
              input: 'with-disabled-streams',
              title: 'Disabled 2',
              enabled: false,
            },
          ],
        },
      ],
      policy_templates: [
        {
          name: 'pkgPolicy1',
          title: 'Package policy 1',
          description: 'test package policy',
          inputs: [
            {
              type: 'foo',
              title: 'Foo',
              vars: [
                { default: 'foo-input-var-value', name: 'foo-input-var-name', type: 'text' },
                {
                  default: 'foo-input2-var-value',
                  name: 'foo-input2-var-name',
                  required: true,
                  type: 'text',
                },
                { name: 'foo-input3-var-name', type: 'text', required: true, multi: true },
              ],
            },
            {
              type: 'bar',
              title: 'Bar',
              vars: [
                {
                  default: ['value1', 'value2'],
                  name: 'bar-input-var-name',
                  type: 'text',
                  multi: true,
                },
                { name: 'bar-input2-var-name', required: true, type: 'text' },
              ],
            },
            {
              type: 'with-no-config-or-streams',
              title: 'With no config or streams',
            },
            {
              type: 'with-disabled-streams',
              title: 'With disabled streams',
            },
            {
              type: 'with-no-stream-vars',
              enabled: true,
              vars: [{ required: true, name: 'var-name', type: 'text' }],
            },
          ],
        },
      ],
    } as unknown as PackageInfo;

    const validPackagePolicy: NewPackagePolicy = {
      name: 'pkgPolicy1-1',
      namespace: 'default',
      policy_id: 'test-policy',
      policy_ids: ['test-policy'],
      enabled: true,
      inputs: [
        {
          type: 'foo',
          policy_template: 'pkgPolicy1',
          enabled: true,
          vars: {
            'foo-input-var-name': { value: 'foo-input-var-value', type: 'text' },
            'foo-input2-var-name': { value: 'foo-input2-var-value', type: 'text' },
            'foo-input3-var-name': { value: ['test'], type: 'text' },
          },
          streams: [
            {
              data_stream: { dataset: 'foo', type: 'logs' },
              enabled: true,
              vars: { 'var-name': { value: 'test_yaml: value', type: 'yaml' } },
            },
          ],
        },
        {
          type: 'bar',
          policy_template: 'pkgPolicy1',
          enabled: true,
          vars: {
            'bar-input-var-name': { value: ['value1', 'value2'], type: 'text' },
            'bar-input2-var-name': { value: 'test', type: 'text' },
          },
          streams: [
            {
              data_stream: { dataset: 'bar', type: 'logs' },
              enabled: true,
              vars: { 'var-name': { value: 'test_yaml: value', type: 'yaml' } },
            },
            {
              data_stream: { dataset: 'bar2', type: 'logs' },
              enabled: true,
              vars: { 'var-name': { value: undefined, type: 'text' } },
            },
            {
              data_stream: { dataset: 'bar3', type: 'logs' },
              enabled: true,
              vars: { 'var-name': { value: true, type: 'text' } },
            },
          ],
        },
        {
          type: 'with-no-config-or-streams',
          policy_template: 'pkgPolicy1',
          enabled: true,
          streams: [],
        },
        {
          type: 'with-disabled-streams',
          policy_template: 'pkgPolicy1',
          enabled: true,
          streams: [
            {
              data_stream: { dataset: 'disabled', type: 'logs' },
              enabled: false,
              vars: { 'var-name': { value: undefined, type: 'text' } },
            },
            {
              data_stream: { dataset: 'disabled2', type: 'logs' },
              enabled: false,
            },
          ],
        },
        {
          type: 'with-no-stream-vars',
          policy_template: 'pkgPolicy1',
          enabled: true,
          vars: {
            'var-name': { value: 'test', type: 'text' },
          },
          streams: [
            {
              data_stream: { dataset: 'with-no-stream-vars-bar', type: 'logs' },
              enabled: true,
            },
          ],
        },
      ],
      vars: {},
    };

    const invalidPackagePolicy: NewPackagePolicy = {
      ...validPackagePolicy,
      name: '',
      inputs: [
        {
          type: 'foo',
          policy_template: 'pkgPolicy1',
          enabled: true,
          vars: {
            'foo-input-var-name': { value: undefined, type: 'text' },
            'foo-input2-var-name': { value: undefined, type: 'text' },
            'foo-input3-var-name': { value: [], type: 'text' },
          },
          streams: [
            {
              data_stream: { dataset: 'foo', type: 'logs' },
              enabled: true,
              vars: { 'var-name': { value: 'invalidyaml: test\n foo bar:', type: 'yaml' } },
            },
          ],
        },
        {
          type: 'bar',
          policy_template: 'pkgPolicy1',
          enabled: true,
          vars: {
            'bar-input-var-name': { value: 'invalid value for multi', type: 'text' },
            'bar-input2-var-name': { value: undefined, type: 'text' },
          },
          streams: [
            {
              data_stream: { dataset: 'bar', type: 'logs' },
              enabled: true,
              vars: { 'var-name': { value: '    \n\n', type: 'yaml' } },
            },
            {
              data_stream: { dataset: 'bar2', type: 'logs' },
              enabled: true,
              vars: { 'var-name': { value: undefined, type: 'text' } },
            },
            {
              data_stream: { dataset: 'bar3', type: 'logs' },
              enabled: true,
              vars: { 'var-name': { value: 'not a bool', type: 'bool' } },
            },
          ],
        },
        {
          type: 'with-no-config-or-streams',
          policy_template: 'pkgPolicy1',
          enabled: true,
          streams: [],
        },
        {
          type: 'with-disabled-streams',
          policy_template: 'pkgPolicy1',
          enabled: true,
          streams: [
            {
              data_stream: { dataset: 'disabled', type: 'logs' },
              enabled: false,
              vars: {
                'var-name': {
                  value: 'invalid value but not checked due to not enabled',
                  type: 'text',
                },
              },
            },
            {
              data_stream: { dataset: 'disabled2', type: 'logs' },
              enabled: false,
            },
          ],
        },
        {
          type: 'with-no-stream-vars',
          policy_template: 'pkgPolicy1',
          enabled: true,
          vars: {
            'var-name': { value: undefined, type: 'text' },
          },
          streams: [
            {
              data_stream: { dataset: 'with-no-stream-vars-bar', type: 'logs' },
              enabled: true,
            },
          ],
        },
      ],
      vars: {},
    };

    const noErrorsValidationResults = {
      name: null,
      additional_datastreams_permissions: null,
      condition: null,
      description: null,
      namespace: null,
      inputs: {
        foo: {
          vars: {
            'foo-input-var-name': null,
            'foo-input2-var-name': null,
            'foo-input3-var-name': null,
          },
          streams: { foo: { vars: { 'var-name': null } } },
        },
        bar: {
          vars: { 'bar-input-var-name': null, 'bar-input2-var-name': null },
          streams: {
            bar: { vars: { 'var-name': null } },
            bar2: { vars: { 'var-name': null } },
            bar3: { vars: { 'var-name': null } },
          },
        },
        'with-disabled-streams': {
          streams: {
            disabled: {
              vars: { 'var-name': null },
            },
            disabled2: {},
          },
        },
        'with-no-stream-vars': {
          streams: {
            'with-no-stream-vars-bar': {},
          },
          vars: { 'var-name': null },
        },
      },
      vars: {},
    };

    it('returns no errors for valid package policy', () => {
      expect(validatePackagePolicy(validPackagePolicy, mockPackage, deps)).toEqual(
        noErrorsValidationResults
      );
    });

    it('returns errors for invalid package policy', () => {
      expect(validatePackagePolicy(invalidPackagePolicy, mockPackage, deps)).toEqual({
        name: ['Name is required'],
        description: null,
        namespace: null,
        additional_datastreams_permissions: null,
        condition: null,
        inputs: {
          foo: {
            vars: {
              'foo-input-var-name': null,
              'foo-input2-var-name': ['foo-input2-var-name is required'],
              'foo-input3-var-name': ['foo-input3-var-name is required'],
            },
            streams: { foo: { vars: { 'var-name': ['Invalid YAML format'] } } },
          },
          bar: {
            vars: {
              'bar-input-var-name': ['Invalid format for bar-input-var-name: expected array'],
              'bar-input2-var-name': ['bar-input2-var-name is required'],
            },
            streams: {
              bar: { vars: { 'var-name': ['var-name is required'] } },
              bar2: { vars: { 'var-name': null } },
              bar3: { vars: { 'var-name': ['Boolean values must be either true or false'] } },
            },
          },
          'with-disabled-streams': {
            streams: {
              disabled: { vars: { 'var-name': null } },
              disabled2: {},
            },
          },
          'with-no-stream-vars': {
            vars: {
              'var-name': ['var-name is required'],
            },
            streams: { 'with-no-stream-vars-bar': {} },
          },
        },
        vars: {},
      });
    });

    it('returns no errors for disabled inputs', () => {
      const disabledInputs = invalidPackagePolicy.inputs.map((input) => ({
        ...input,
        enabled: false,
      }));
      expect(
        validatePackagePolicy({ ...validPackagePolicy, inputs: disabledInputs }, mockPackage, deps)
      ).toEqual(noErrorsValidationResults);
    });

    it('returns only package policy and input-level errors for disabled streams', () => {
      const inputsWithDisabledStreams = invalidPackagePolicy.inputs.map((input) =>
        input.streams
          ? {
              ...input,
              streams: input.streams.map((stream) => ({ ...stream, enabled: false })),
            }
          : input
      );
      expect(
        validatePackagePolicy(
          { ...invalidPackagePolicy, inputs: inputsWithDisabledStreams },
          mockPackage,
          deps
        )
      ).toEqual({
        name: ['Name is required'],
        description: null,
        namespace: null,
        additional_datastreams_permissions: null,
        condition: null,
        inputs: {
          foo: {
            vars: {
              'foo-input-var-name': null,
              'foo-input2-var-name': ['foo-input2-var-name is required'],
              'foo-input3-var-name': ['foo-input3-var-name is required'],
            },
            streams: { foo: { vars: { 'var-name': null } } },
          },
          bar: {
            vars: {
              'bar-input-var-name': ['Invalid format for bar-input-var-name: expected array'],
              'bar-input2-var-name': ['bar-input2-var-name is required'],
            },
            streams: {
              bar: { vars: { 'var-name': null } },
              bar2: { vars: { 'var-name': null } },
              bar3: { vars: { 'var-name': null } },
            },
          },
          'with-disabled-streams': {
            streams: {
              disabled: {
                vars: { 'var-name': null },
              },
              disabled2: {},
            },
          },
          'with-no-stream-vars': {
            vars: {
              'var-name': ['var-name is required'],
            },
            streams: { 'with-no-stream-vars-bar': {} },
          },
        },
        vars: {},
      });
    });

    it('returns no errors for packages with no package policies', () => {
      expect(
        validatePackagePolicy(
          validPackagePolicy,
          {
            ...mockPackage,
            policy_templates: undefined,
          },
          deps
        )
      ).toEqual({
        name: null,
        description: null,
        namespace: null,
        additional_datastreams_permissions: null,
        condition: null,
        inputs: {},
        vars: {},
      });
      expect(
        validatePackagePolicy(
          validPackagePolicy,
          {
            ...mockPackage,
            policy_templates: [],
          },
          deps
        )
      ).toEqual({
        name: null,
        description: null,
        namespace: null,
        additional_datastreams_permissions: null,
        condition: null,
        inputs: {},
        vars: {},
      });
    });

    it('returns no errors for packages with no inputs', () => {
      expect(
        validatePackagePolicy(
          validPackagePolicy,
          {
            ...mockPackage,
            policy_templates: [{} as RegistryPolicyTemplate],
          },
          deps
        )
      ).toEqual({
        name: null,
        description: null,
        namespace: null,
        additional_datastreams_permissions: null,
        condition: null,
        inputs: {},
        vars: {},
      });
      expect(
        validatePackagePolicy(
          validPackagePolicy,
          {
            ...mockPackage,
            policy_templates: [{ inputs: [] } as unknown as RegistryPolicyTemplate],
          },
          deps
        )
      ).toEqual({
        name: null,
        description: null,
        additional_datastreams_permissions: null,
        condition: null,
        namespace: null,
        inputs: {},
        vars: {},
      });
    });

    it('returns no errors when required field is present but empty', () => {
      expect(
        validatePackagePolicy(
          {
            ...validPackagePolicy,
            inputs: [
              {
                type: 'foo',
                policy_template: 'pkgPolicy1',
                enabled: true,
                vars: {
                  'foo-input-var-name': { value: '', type: 'text' },
                  'foo-input2-var-name': { value: '', type: 'text' },
                  'foo-input3-var-name': { value: ['test'], type: 'text' },
                },
                streams: [
                  {
                    data_stream: { dataset: 'foo', type: 'logs' },
                    enabled: true,
                    vars: { 'var-name': { value: 'test_yaml: value', type: 'yaml' } },
                  },
                ],
              },
            ],
          },
          mockPackage,
          deps
        )
      ).toEqual({
        name: null,
        description: null,
        namespace: null,
        additional_datastreams_permissions: null,
        condition: null,
        inputs: {
          foo: {
            streams: {
              foo: {
                vars: {
                  'var-name': null,
                },
              },
            },
            vars: {
              'foo-input-var-name': null,
              'foo-input2-var-name': null,
              'foo-input3-var-name': null,
            },
          },
        },
        vars: {},
      });
    });

    describe('condition field', () => {
      const VALID_EXPR = "${host.platform} == 'linux'";
      const INVALID_EXPR = "(${host.platform} == 'linux'"; // unclosed paren

      it('condition is null when no condition is set at any level', () => {
        const result = validatePackagePolicy(validPackagePolicy, mockPackage, deps);
        expect(result.condition).toBeNull();
        expect(validationHasErrors(result)).toBe(false);
      });

      it('condition is null for a valid integration-level expression', () => {
        const result = validatePackagePolicy(
          { ...validPackagePolicy, condition: VALID_EXPR },
          mockPackage,
          deps
        );
        expect(result.condition).toBeNull();
        expect(validationHasErrors(result)).toBe(false);
      });

      it('returns errors for an invalid integration-level condition', () => {
        const result = validatePackagePolicy(
          { ...validPackagePolicy, condition: INVALID_EXPR },
          mockPackage,
          deps
        );
        expect(result.condition).not.toBeNull();
        expect(result.condition!.length).toBeGreaterThan(0);
        expect(result.condition![0]).toMatch(/column \d+:/);
        expect(validationHasErrors(result)).toBe(true);
      });

      it('has no condition errors for a valid input-level expression', () => {
        const result = validatePackagePolicy(
          {
            ...validPackagePolicy,
            inputs: [
              { ...validPackagePolicy.inputs[0], condition: VALID_EXPR },
              ...validPackagePolicy.inputs.slice(1),
            ],
          },
          mockPackage,
          deps
        );
        expect(result.inputs?.foo?.condition).toBeFalsy();
        expect(validationHasErrors(result)).toBe(false);
      });

      it('returns errors for an invalid input-level condition', () => {
        const result = validatePackagePolicy(
          {
            ...validPackagePolicy,
            inputs: [
              { ...validPackagePolicy.inputs[0], condition: INVALID_EXPR },
              ...validPackagePolicy.inputs.slice(1),
            ],
          },
          mockPackage,
          deps
        );
        expect(result.inputs?.foo?.condition).toBeTruthy();
        expect(result.inputs?.foo?.condition!.length).toBeGreaterThan(0);
        expect(validationHasErrors(result)).toBe(true);
      });

      it('has no condition errors for a valid stream-level expression', () => {
        const result = validatePackagePolicy(
          {
            ...validPackagePolicy,
            inputs: [
              {
                ...validPackagePolicy.inputs[0],
                streams: [{ ...validPackagePolicy.inputs[0].streams[0], condition: VALID_EXPR }],
              },
              ...validPackagePolicy.inputs.slice(1),
            ],
          },
          mockPackage,
          deps
        );
        expect(result.inputs?.foo?.streams?.foo?.condition).toBeFalsy();
        expect(validationHasErrors(result)).toBe(false);
      });

      it('returns errors for an invalid stream-level condition', () => {
        const result = validatePackagePolicy(
          {
            ...validPackagePolicy,
            inputs: [
              {
                ...validPackagePolicy.inputs[0],
                streams: [{ ...validPackagePolicy.inputs[0].streams[0], condition: INVALID_EXPR }],
              },
              ...validPackagePolicy.inputs.slice(1),
            ],
          },
          mockPackage,
          deps
        );
        expect(result.inputs?.foo?.streams?.foo?.condition).toBeTruthy();
        expect(result.inputs?.foo?.streams?.foo?.condition!.length).toBeGreaterThan(0);
        expect(validationHasErrors(result)).toBe(true);
      });
    });
  });

  describe('works for packages with multiple policy templates (aka integrations)', () => {
    it('returns errors for invalid package policy', () => {
      expect(
        validatePackagePolicy(
          INVALID_AWS_POLICY as NewPackagePolicy,
          AWS_PACKAGE as unknown as PackageInfo,
          deps
        )
      ).toMatchSnapshot();
    });

    it('returns no errors for valid package policy', () => {
      expect(
        validationHasErrors(
          validatePackagePolicy(
            VALID_AWS_POLICY as NewPackagePolicy,
            AWS_PACKAGE as unknown as PackageInfo,
            deps
          )
        )
      ).toBe(false);
    });
  });

  describe('works for inputs with same type but different ids', () => {
    const packageWithDuplicateTypeInputs: PackageInfo = {
      name: 'nginx',
      title: 'Nginx',
      version: '1.0.0',
      latestVersion: '1.0.0',
      description: 'Nginx integration',
      type: 'integration',
      categories: [],
      conditions: { kibana: { version: '' } },
      format_version: '',
      download: '',
      path: '',
      assets: { kibana: {} as any, elasticsearch: {} as any },
      status: 'not_installed',
      release: 'ga',
      owner: { github: 'elastic/fleet' },
      policy_templates: [
        {
          name: 'nginx',
          title: 'Nginx',
          description: 'Nginx logs and metrics',
          data_streams: ['access', 'stubstatus'],
          inputs: [
            {
              name: 'filelog_otel',
              type: 'otelcol',
              title: 'Logs via filelog',
              description: 'Collect logs',
              vars: [{ name: 'log_path', type: 'text', required: true }],
            },
            {
              name: 'nginx_otel',
              type: 'otelcol',
              title: 'Metrics via nginx receiver',
              description: 'Collect metrics',
              vars: [{ name: 'endpoint', type: 'text', required: true }],
            },
          ],
        },
      ] as unknown as RegistryPolicyTemplate[],
      data_streams: [
        {
          type: 'logs',
          dataset: 'nginx.access',
          title: 'Access logs',
          path: 'access',
          release: 'ga',
          package: 'nginx',
          streams: [{ input: 'filelog_otel', title: 'Access logs', vars: [] }],
        },
        {
          type: 'metrics',
          dataset: 'nginx.stubstatus',
          title: 'Stub status',
          path: 'stubstatus',
          release: 'ga',
          package: 'nginx',
          streams: [{ input: 'nginx_otel', title: 'Stub status', vars: [] }],
        },
      ] as any,
    };

    it('validates each input independently using name as key', () => {
      const packagePolicy: NewPackagePolicy = {
        name: 'nginx-1',
        namespace: 'default',
        policy_ids: ['policy1'],
        enabled: true,
        inputs: [
          {
            type: 'otelcol',
            name: 'filelog_otel',
            policy_template: 'nginx',
            enabled: true,
            vars: { log_path: { value: '/var/log/nginx/access.log' } },
            streams: [
              {
                enabled: true,
                data_stream: { type: 'logs', dataset: 'nginx.access' },
              },
            ],
          },
          {
            type: 'otelcol',
            name: 'nginx_otel',
            policy_template: 'nginx',
            enabled: true,
            vars: { endpoint: { value: undefined } },
            streams: [
              {
                enabled: true,
                data_stream: { type: 'metrics', dataset: 'nginx.stubstatus' },
              },
            ],
          },
        ],
      };

      const result = validatePackagePolicy(packagePolicy, packageWithDuplicateTypeInputs, deps);

      // The first input (filelog_otel) has a valid var, so no error
      // Single policy template packages use just the effectiveName as key (no template prefix)
      expect(result.inputs?.filelog_otel?.vars?.log_path).toBeNull();
      // The second input (nginx_otel) has an empty required var, so it should error
      expect(result.inputs?.nginx_otel?.vars?.endpoint).not.toBeNull();
    });
  });
});

describe('Fleet - validateConditionalRequiredVars()', () => {
  const createMockRequiredVarPackageInfo = (streams: unknown, inputs: unknown[]) => {
    return {
      name: 'mock-package',
      title: 'Mock package',
      version: '0.0.0',
      description: 'description',
      type: 'mock',
      categories: [],
      requirement: { kibana: { versions: '' }, elasticsearch: { versions: '' } },
      format_version: '',
      download: '',
      path: '',
      assets: {
        kibana: {
          dashboard: [],
          visualization: [],
          search: [],
          'index-pattern': [],
        },
      },
      status: installationStatuses.NotInstalled,
      data_streams: [
        {
          dataset: 'foo',
          streams,
        },
        {
          dataset: 'bar',
          streams: [
            {
              input: 'bar',
              title: 'Bar',
              vars: [
                { name: 'bar-name', type: 'text', required: true },
                { name: 'bar-age', type: 'text' },
              ],
            },
            {
              input: 'with-no-stream-vars',
              title: 'Bar stream no vars',
              enabled: true,
            },
          ],
        },
      ],
      policy_templates: [
        {
          name: 'pkgPolicy1',
          title: 'Package policy 1',
          description: 'test package policy',
          inputs: [
            {
              type: 'foo',
              title: 'Foo',
              vars: [
                { default: 'foo-input-var-value', name: 'foo-input-var-name', type: 'text' },
                {
                  default: 'foo-input2-var-value',
                  name: 'foo-input2-var-name',
                  required: true,
                  type: 'text',
                },
                { name: 'foo-input3-var-name', type: 'text', required: true, multi: true },
              ],
            },
            {
              type: 'bar',
              title: 'Bar',
              vars: [
                {
                  default: ['value1', 'value2'],
                  name: 'bar-input-var-name',
                  type: 'text',
                  multi: true,
                },
                { name: 'bar-input2-var-name', required: true, type: 'text' },
              ],
            },
            {
              type: 'with-no-config-or-streams',
              title: 'With no config or streams',
            },
            {
              type: 'with-disabled-streams',
              title: 'With disabled streams',
            },
            {
              type: 'with-no-stream-vars',
              enabled: true,
              vars: [{ required: true, name: 'var-name', type: 'text' }],
            },
            ...inputs,
          ],
        },
      ],
    } as unknown as PackageInfo;
  };

  const createPackagePolicyForRequiredVars = (
    streams: NewPackagePolicyInputStream[],
    inputs: NewPackagePolicyInput[]
  ) => {
    return {
      name: 'pkgPolicy1-1',
      namespace: 'default',
      policy_id: 'test-policy',
      policy_ids: ['test-policy'],
      enabled: true,
      inputs: [
        {
          type: 'foo-input',
          policy_template: 'pkgPolicy1',
          enabled: true,
          streams,
        },
        ...inputs,
      ],
      vars: {},
    };
  };

  it('should return package policy validation error if invalid required_vars exist', () => {
    const mockPackageInfoRequireVars = createMockRequiredVarPackageInfo(
      [
        {
          title: 'Foo',
          input: 'foo-input',
          vars: [
            { name: 'foo-name', type: 'text' },
            { name: 'foo-age', type: 'text' },
          ],
          required_vars: {
            'foo-required-var-name': [{ name: 'foo-name' }, { name: 'foo-age', value: '1' }],
          },
        },
      ],
      [
        {
          type: 'lorem',
          title: 'Lorem',
          vars: [
            { name: 'lorem-name', type: 'text' },
            { name: 'lorem-age', type: 'text' },
          ],
          required_vars: {
            'lorem-required-var-name': [{ name: 'lorem-name' }, { name: 'lorem-age', value: '1' }],
          },
        },
      ]
    );
    const invalidPackagePolicyWithRequiredVars = createPackagePolicyForRequiredVars(
      [
        {
          data_stream: { dataset: 'foo', type: 'logs' },
          enabled: true,
          vars: { 'foo-name': { type: 'text' }, 'foo-age': { type: 'text' } },
        },
      ],
      [
        {
          type: 'lorem',
          enabled: true,
          vars: { 'lorem-name': { type: 'text' }, 'lorem-age': { type: 'text' } },
          streams: [],
        },
      ]
    );

    const validationResults = validatePackagePolicy(
      invalidPackagePolicyWithRequiredVars,
      mockPackageInfoRequireVars,
      deps
    );

    expect(validationResults).toEqual({
      name: null,
      description: null,
      namespace: null,
      additional_datastreams_permissions: null,
      condition: null,
      inputs: {
        'foo-input': {
          streams: {
            foo: {
              required_vars: {
                'foo-required-var-name': [
                  { name: 'foo-name', invalid: true },
                  { name: 'foo-age', invalid: true },
                ],
              },
              vars: {
                'foo-name': null,
                'foo-age': null,
              },
            },
          },
        },
        lorem: {
          vars: {
            'lorem-name': null,
            'lorem-age': null,
          },
          required_vars: {
            'lorem-required-var-name': [
              {
                name: 'lorem-name',
                invalid: true,
              },
              {
                name: 'lorem-age',
                invalid: true,
              },
            ],
          },
        },
      },
      vars: {},
    });

    expect(validationHasErrors(validationResults)).toBe(true);
  });

  it('should return package policy validation error if partial invalid required_vars exist', () => {
    const mockPackageInfoRequireVars = createMockRequiredVarPackageInfo(
      [
        {
          title: 'Foo',
          input: 'foo-input',
          vars: [
            { name: 'foo-name', type: 'text' },
            { name: 'foo-age', type: 'text' },
          ],
          required_vars: {
            'foo-required-var-name': [{ name: 'foo-name' }, { name: 'foo-age', value: '1' }],
          },
        },
      ],
      [
        {
          type: 'lorem',
          title: 'Lorem',
          vars: [
            { name: 'lorem-name', type: 'text' },
            { name: 'lorem-age', type: 'text' },
          ],
          required_vars: {
            'lorem-required-var-name': [{ name: 'lorem-name' }, { name: 'lorem-age', value: '1' }],
          },
        },
      ]
    );
    const invalidPackagePolicyWithRequiredVars = createPackagePolicyForRequiredVars(
      [
        {
          data_stream: { dataset: 'foo', type: 'logs' },
          enabled: true,
          vars: { 'foo-name': { type: 'text' }, 'foo-age': { type: 'text', value: '1' } },
        },
      ],
      [
        {
          type: 'lorem',
          enabled: true,
          vars: { 'lorem-name': { type: 'text' }, 'lorem-age': { type: 'text', value: '1' } },
          streams: [],
        },
      ]
    );

    const validationResults = validatePackagePolicy(
      invalidPackagePolicyWithRequiredVars,
      mockPackageInfoRequireVars,
      deps
    );

    expect(validationResults).toEqual({
      name: null,
      description: null,
      namespace: null,
      additional_datastreams_permissions: null,
      condition: null,
      inputs: {
        'foo-input': {
          streams: {
            foo: {
              vars: {
                'foo-name': null,
                'foo-age': null,
              },
              required_vars: {
                'foo-required-var-name': [
                  {
                    name: 'foo-name',
                    invalid: true,
                  },
                ],
              },
            },
          },
        },
        lorem: {
          vars: {
            'lorem-name': null,
            'lorem-age': null,
          },
          required_vars: {
            'lorem-required-var-name': [
              {
                name: 'lorem-name',
                invalid: true,
              },
            ],
          },
        },
      },
      vars: {},
    });

    expect(validationHasErrors(validationResults)).toBe(true);
  });

  it('should not return package policy validation errors if required_vars have existence and a value', () => {
    const mockPackageInfoRequireVars = createMockRequiredVarPackageInfo(
      [
        {
          title: 'Foo',
          input: 'foo-input',
          vars: [
            { name: 'foo-name', type: 'text' },
            { name: 'foo-age', type: 'text' },
          ],
          required_vars: {
            'foo-required-var-name': [{ name: 'foo-name' }, { name: 'foo-age', value: '1' }],
          },
        },
      ],
      [
        {
          type: 'lorem',
          title: 'Lorem',
          vars: [
            { name: 'lorem-name', type: 'text' },
            { name: 'lorem-age', type: 'text' },
          ],
          required_vars: {
            'lorem-required-var-name': [{ name: 'lorem-name' }, { name: 'lorem-age', value: '1' }],
          },
        },
      ]
    );
    const invalidPackagePolicyWithRequiredVars = createPackagePolicyForRequiredVars(
      [
        {
          data_stream: { dataset: 'foo', type: 'logs' },
          enabled: true,
          vars: {
            'foo-name': { type: 'text', value: 'Some name' },
            'foo-age': { type: 'text', value: '1' },
          },
        },
      ],
      [
        {
          type: 'lorem',
          enabled: true,
          vars: {
            'lorem-name': { type: 'text', value: 'Some name' },
            'lorem-age': { type: 'text', value: '1' },
          },
          streams: [],
        },
      ]
    );

    const validationResults = validatePackagePolicy(
      invalidPackagePolicyWithRequiredVars,
      mockPackageInfoRequireVars,
      deps
    );

    expect(validationResults).toEqual({
      name: null,
      description: null,
      namespace: null,
      additional_datastreams_permissions: null,
      condition: null,
      inputs: {
        'foo-input': {
          streams: {
            foo: {
              vars: {
                'foo-name': null,
                'foo-age': null,
              },
            },
          },
        },
        lorem: {
          vars: {
            'lorem-name': null,
            'lorem-age': null,
          },
        },
      },
      vars: {},
    });

    expect(validationHasErrors(validationResults)).toBe(false);
  });

  it('should not return package policy validation errors if required_vars all have values', () => {
    const mockPackageInfoRequireVars = createMockRequiredVarPackageInfo(
      [
        {
          title: 'Foo',
          input: 'foo-input',
          vars: [
            { name: 'foo-name', type: 'text' },
            { name: 'foo-age', type: 'text' },
          ],
          required_vars: {
            'foo-required-var-name': [
              { name: 'foo-name', value: 'Some name' },
              { name: 'foo-age', value: '1' },
            ],
          },
        },
      ],
      [
        {
          type: 'lorem',
          title: 'Lorem',
          vars: [
            { name: 'lorem-name', type: 'text' },
            { name: 'lorem-age', type: 'text' },
          ],
          required_vars: {
            'lorem-required-var-name': [
              { name: 'lorem-name', value: 'Some name' },
              { name: 'lorem-age', value: '1' },
            ],
          },
        },
      ]
    );
    const invalidPackagePolicyWithRequiredVars = createPackagePolicyForRequiredVars(
      [
        {
          data_stream: { dataset: 'foo', type: 'logs' },
          enabled: true,
          vars: {
            'foo-name': { type: 'text', value: 'Some name' },
            'foo-age': { type: 'text', value: '1' },
          },
        },
      ],
      [
        {
          type: 'lorem',
          enabled: true,
          vars: {
            'lorem-name': { type: 'text', value: 'Some name' },
            'lorem-age': { type: 'text', value: '1' },
          },
          streams: [],
        },
      ]
    );

    const validationResults = validatePackagePolicy(
      invalidPackagePolicyWithRequiredVars,
      mockPackageInfoRequireVars,
      deps
    );

    expect(validationResults).toEqual({
      name: null,
      description: null,
      namespace: null,
      additional_datastreams_permissions: null,
      condition: null,
      inputs: {
        'foo-input': {
          streams: {
            foo: {
              vars: {
                'foo-name': null,
                'foo-age': null,
              },
            },
          },
        },
        lorem: {
          vars: {
            'lorem-name': null,
            'lorem-age': null,
          },
        },
      },
      vars: {},
    });

    expect(validationHasErrors(validationResults)).toBe(false);
  });
});

describe('Fleet - validationHasErrors()', () => {
  it('returns true for stream validation results with errors', () => {
    expect(
      validationHasErrors({
        vars: { foo: ['foo error'], bar: null },
      })
    ).toBe(true);
  });

  it('returns false for stream validation results with no errors', () => {
    expect(
      validationHasErrors({
        vars: { foo: null, bar: null },
      })
    ).toBe(false);
  });

  it('returns true for input validation results with errors', () => {
    expect(
      validationHasErrors({
        vars: { foo: ['foo error'], bar: null },
        streams: { stream1: { vars: { foo: null, bar: null } } },
      })
    ).toBe(true);
    expect(
      validationHasErrors({
        vars: { foo: null, bar: null },
        streams: { stream1: { vars: { foo: ['foo error'], bar: null } } },
      })
    ).toBe(true);
  });

  it('returns false for input validation results with no errors', () => {
    expect(
      validationHasErrors({
        vars: { foo: null, bar: null },
        streams: { stream1: { vars: { foo: null, bar: null } } },
      })
    ).toBe(false);
  });

  it('returns true for package policy validation results with errors', () => {
    expect(
      validationHasErrors({
        name: ['name error'],
        description: null,
        additional_datastreams_permissions: null,
        condition: null,
        namespace: null,
        inputs: {
          input1: {
            vars: { foo: null, bar: null },
            streams: { stream1: { vars: { foo: null, bar: null } } },
          },
        },
      })
    ).toBe(true);

    expect(
      validationHasErrors({
        name: null,
        description: null,
        additional_datastreams_permissions: null,
        condition: null,
        namespace: null,
        inputs: {
          input1: {
            vars: { foo: ['foo error'], bar: null },
            streams: { stream1: { vars: { foo: null, bar: null } } },
          },
        },
      })
    ).toBe(true);
    expect(
      validationHasErrors({
        name: null,
        description: null,
        additional_datastreams_permissions: null,
        condition: null,
        namespace: null,
        inputs: {
          input1: {
            vars: { foo: null, bar: null },
            streams: { stream1: { vars: { foo: ['foo error'], bar: null } } },
          },
        },
      })
    ).toBe(true);
  });

  it('returns false for package policy validation results with no errors', () => {
    expect(
      validationHasErrors({
        name: null,
        description: null,
        namespace: null,
        additional_datastreams_permissions: null,
        condition: null,
        inputs: {
          input1: {
            vars: { foo: null, bar: null },
            streams: { stream1: { vars: { foo: null, bar: null } } },
          },
        },
      })
    ).toBe(false);
  });
});

describe('Fleet - validatePackagePolicyConfig', () => {
  describe('Text', () => {
    it('should return required error message for undefined variable', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'text',
          value: undefined,
        },
        {
          name: 'myvariable',
          type: 'text',
          multi: false,
          required: true,
        },
        'myvariable',
        parse
      );

      expect(res).toEqual(['myvariable is required']);
    });

    it('should accept empty string', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'text',
          value: '',
        },
        {
          name: 'myvariable',
          type: 'text',
          multi: false,
          required: true,
        },
        'myvariable',
        parse
      );

      expect(res).toBeNull();
    });
    it('should accept blank spaces', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'text',
          value: '  ',
        },
        {
          name: 'myvariable',
          type: 'text',
          multi: false,
          required: true,
        },
        'myvariable',
        parse
      );

      expect(res).toBeNull();
    });

    it('should accept string', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'text',
          value: 'some text',
        },
        {
          name: 'myvariable',
          type: 'text',
          multi: false,
          required: true,
        },
        'myvariable',
        parse
      );

      expect(res).toBeNull();
    });
  });
  describe('Multi Text', () => {
    it('should return required error message for empty string', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'text',
          value: [''],
        },
        {
          name: 'myvariable',
          type: 'text',
          multi: true,
          required: true,
        },
        'myvariable',
        parse
      );

      expect(res).toEqual(['myvariable is required']);
    });

    it('should return required error message for blank spaces', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'text',
          value: ['value1', '  '],
        },
        {
          name: 'myvariable',
          type: 'text',
          multi: true,
          required: true,
        },
        'myvariable',
        parse
      );

      expect(res).toEqual(['myvariable is required']);
    });

    it('should accept integer', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'text',
          value: [1],
        },
        {
          name: 'myvariable',
          type: 'text',
          multi: true,
          required: true,
        },
        'myvariable',
        parse
      );

      expect(res).toBeNull();
    });
  });

  describe('Integer', () => {
    it('should return an error message for invalid integer', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'integer',
          value: 'test',
        },
        {
          name: 'myvariable',
          type: 'integer',
        },
        'myvariable',
        parse
      );

      expect(res).toEqual(['Invalid integer']);
    });

    it('should accept valid integer', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'integer',
          value: '12',
        },
        {
          name: 'myvariable',
          type: 'integer',
        },
        'myvariable',
        parse
      );

      expect(res).toBeNull();
    });

    it('should return an error message for invalid multi integers', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'integer',
          value: ['test'],
        },
        {
          name: 'myvariable',
          type: 'integer',
          multi: true,
        },
        'myvariable',
        parse
      );

      expect(res).toEqual(['Invalid integer']);
    });

    it('should accept valid multi integer', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'integer',
          value: ['12'],
        },
        {
          name: 'myvariable',
          type: 'integer',
          multi: true,
        },
        'myvariable',
        parse
      );

      expect(res).toBeNull();
    });
  });

  describe('Select', () => {
    it('should return an error message if the value is not an option value', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'select',
          value: 'c',
        },
        {
          name: 'myvariable',
          type: 'select',
          options: [
            { value: 'a', text: 'A' },
            { value: 'b', text: 'B' },
          ],
        },
        'myvariable',
        parse
      );

      expect(res).toEqual(['Invalid value for select type']);
    });

    it('should return an error message if the value is an empty string', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'select',
          value: '',
        },
        {
          name: 'myvariable',
          type: 'select',
          options: [
            { value: 'a', text: 'A' },
            { value: 'b', text: 'B' },
          ],
        },
        'myvariable',
        parse
      );

      expect(res).toEqual(['Invalid value for select type']);
    });

    it('should accept a select with a valid value', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'select',
          value: 'b',
        },
        {
          name: 'myvariable',
          type: 'select',
          options: [
            { value: 'a', text: 'A' },
            { value: 'b', text: 'B' },
          ],
        },
        'myvariable',
        parse
      );

      expect(res).toBeNull();
    });

    it('should accept a select with undefined value', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'select',
          value: undefined,
        },
        {
          name: 'myvariable',
          type: 'select',
          options: [
            { value: 'a', text: 'A' },
            { value: 'b', text: 'B' },
          ],
        },
        'myvariable',
        parse
      );

      expect(res).toBeNull();
    });
    it('should accept a secret ref id instead of a text value for a secret field', () => {
      const res = validatePackagePolicyConfig(
        {
          value: { isSecretRef: true, id: 'secret1' },
        },
        {
          name: 'secret_variable',
          type: 'text',
          secret: true,
        },
        'secret_variable',
        parse
      );

      expect(res).toBeNull();
    });
    it('should accept secret ref ids instead of a text value for a secret field', () => {
      const res = validatePackagePolicyConfig(
        {
          value: { isSecretRef: true, ids: ['secret1', 'secret2'] },
        },
        {
          name: 'secret_variable',
          type: 'text',
          multi: true,
          secret: true,
        },
        'secret_variable',
        parse
      );

      expect(res).toBeNull();
    });
    it('secret refs should always have an id or ids', () => {
      const res = validatePackagePolicyConfig(
        {
          value: { isSecretRef: true },
        },
        {
          name: 'secret_variable',
          type: 'text',
          secret: true,
        },
        'secret_variable',
        parse
      );

      expect(res).toEqual(['Secret reference is invalid, id or ids must be provided']);
    });
    it('secret ref id should be a string', () => {
      const res = validatePackagePolicyConfig(
        {
          value: { isSecretRef: true, id: 123 },
        },
        {
          name: 'secret_variable',
          type: 'text',
          secret: true,
        },
        'secret_variable',
        parse
      );

      expect(res).toEqual(['Secret reference is invalid, id must be a string']);
    });
    it('secret ref ids should all be strings', () => {
      const res = validatePackagePolicyConfig(
        {
          value: { isSecretRef: true, ids: ['someid', 123] },
        },
        {
          name: 'secret_variable',
          type: 'text',
          multi: true,
          secret: true,
        },
        'secret_variable',
        parse
      );

      expect(res).toEqual(['Secret reference is invalid, ids must be an array of strings']);
    });
  });

  describe('Duration', () => {
    it('should validate a valid duration format', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'duration',
          value: '1h30m45s',
        },
        {
          name: 'timeout',
          type: 'duration',
        },
        'timeout',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should validate a valid duration with milliseconds', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'duration',
          value: '2h15m30s500ms',
        },
        {
          name: 'timeout',
          type: 'duration',
        },
        'timeout',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should validate a valid duration with a single unit', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'duration',
          value: '60s',
        },
        {
          name: 'timeout',
          type: 'duration',
        },
        'timeout',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should return error for invalid duration format', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'duration',
          value: 'invalid',
        },
        {
          name: 'timeout',
          type: 'duration',
        },
        'timeout',
        parse
      );

      expect(res).toContain('Invalid duration format. Expected format like "1h30m45s"');
    });

    it('should validate duration with min_duration constraint (valid)', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'duration',
          value: '1h30m',
        },
        {
          name: 'timeout',
          type: 'duration',
          min_duration: '1h',
        },
        'timeout',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should return error for duration below min_duration', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'duration',
          value: '30m',
        },
        {
          name: 'timeout',
          type: 'duration',
          min_duration: '1h',
        },
        'timeout',
        parse
      );

      expect(res).toContain('Duration is below the minimum allowed value of 1h');
    });

    it('should validate duration with max_duration constraint (valid)', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'duration',
          value: '1h30m',
        },
        {
          name: 'timeout',
          type: 'duration',
          max_duration: '2h',
        },
        'timeout',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should return error for duration above max_duration', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'duration',
          value: '3h',
        },
        {
          name: 'timeout',
          type: 'duration',
          max_duration: '2h',
        },
        'timeout',
        parse
      );

      expect(res).toContain('Duration is above the maximum allowed value of 2h');
    });

    it('should validate duration with both min and max constraints (valid)', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'duration',
          value: '1h30m',
        },
        {
          name: 'timeout',
          type: 'duration',
          min_duration: '1h',
          max_duration: '2h',
        },
        'timeout',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should return error for invalid min_duration specification', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'duration',
          value: '1h30m',
        },
        {
          name: 'timeout',
          type: 'duration',
          min_duration: 'invalid',
        },
        'timeout',
        parse
      );

      expect(res).toContain('Invalid min_duration specification');
    });

    it('should return error for invalid max_duration specification', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'duration',
          value: '1h30m',
        },
        {
          name: 'timeout',
          type: 'duration',
          max_duration: 'invalid',
        },
        'timeout',
        parse
      );

      expect(res).toContain('Invalid max_duration specification');
    });
  });

  describe('Dataset', () => {
    const datasetError = 'Dataset contains invalid characters';

    const validateDataset = (dataset: string) => {
      return validatePackagePolicyConfig(
        {
          type: 'text',
          value: { dataset, package: 'log' },
        },
        {
          name: 'data_stream.dataset',
          type: 'text',
        },
        'data_stream.dataset',
        parse,
        'input'
      );
    };

    it('should return an error message if the value has *', () => {
      const res = validateDataset('test*');

      expect(res).toEqual([datasetError]);
    });

    it('should return an error message if the value has uppercase letter', () => {
      const res = validateDataset('Test');

      expect(res).toEqual(['Dataset must be lowercase']);
    });

    it('should return an error message if the value has _ in the beginning', () => {
      const res = validateDataset('_test');

      expect(res).toEqual(['Dataset cannot start with an underscore or dot']);
    });

    it('should return an error message if the value has . in the beginning', () => {
      const res = validateDataset('.test');

      expect(res).toEqual(['Dataset cannot start with an underscore or dot']);
    });

    it('should not return an error message if the value is valid', () => {
      const res = validateDataset('fleet_server.test_dataset');

      expect(res).toEqual(null);
    });

    it('should not return an error message if the value is undefined', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'text',
          value: undefined,
        },
        {
          name: 'data_stream.dataset',
          type: 'text',
        },
        'data_stream.dataset',
        parse,
        'input'
      );

      expect(res).toEqual(null);
    });

    it('should not return an error message if the package is not input type', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'text',
          value: { dataset: 'Test', package: 'log' },
        },
        {
          name: 'data_stream.dataset',
          type: 'text',
        },
        'data_stream.dataset',
        parse,
        'integration'
      );

      expect(res).toEqual(null);
    });

    it('should not return an error message if the var is not dataset', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'text',
          value: { dataset: 'Test', package: 'log' },
        },
        {
          name: 'test_field',
          type: 'text',
        },
        'test_field',
        parse,
        'input'
      );

      expect(res).toEqual(null);
    });

    it('should return an error message if the string dataset value has special characters', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'text',
          value: 'test*',
        },
        {
          name: 'data_stream.dataset',
          type: 'text',
        },
        'data_stream.dataset',
        parse,
        'input'
      );

      expect(res).toEqual(['Dataset contains invalid characters']);
    });

    it('should return an error message if the dataset value has special characters', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'text',
          value: { dataset: 'test*', package: 'log' },
        },
        {
          name: 'data_stream.dataset',
          type: 'text',
        },
        'data_stream.dataset',
        parse,
        'input'
      );

      expect(res).toEqual(['Dataset contains invalid characters']);
    });
  });

  describe('Data stream type', () => {
    const validateDataStreamType = (type: string, packageType: string = 'input') => {
      return validatePackagePolicyConfig(
        {
          type: 'text',
          value: type,
        },
        {
          name: 'data_stream.type',
          type: 'text',
        },
        'data_stream.type',
        parse,
        packageType
      );
    };

    it('should return null for valid types', () => {
      expect(validateDataStreamType('logs')).toBeNull();
      expect(validateDataStreamType('metrics')).toBeNull();
      expect(validateDataStreamType('traces')).toBeNull();
      expect(validateDataStreamType('synthetics')).toBeNull();
      expect(validateDataStreamType('profiles')).toBeNull();
    });

    it('should return an error for the legacy profiling type', () => {
      const res = validateDataStreamType('profiling');
      expect(res).toEqual([
        'Data stream type must be one of: logs, metrics, traces, synthetics, profiles',
      ]);
    });

    it('should return an error for an unknown type', () => {
      const res = validateDataStreamType('bogus');
      expect(res).toEqual([
        'Data stream type must be one of: logs, metrics, traces, synthetics, profiles',
      ]);
    });

    it('should return null when value is undefined', () => {
      const res = validatePackagePolicyConfig(
        { type: 'text', value: undefined },
        { name: 'data_stream.type', type: 'text' },
        'data_stream.type',
        parse,
        'input'
      );
      expect(res).toBeNull();
    });

    it('should return null for non-input package type', () => {
      expect(validateDataStreamType('bogus', 'integration')).toBeNull();
    });
  });

  describe('additional_datastreams_permissions', () => {
    const basePolicy: NewPackagePolicy = {
      name: 'test-policy',
      namespace: 'default',
      enabled: true,
      policy_ids: [],
      inputs: [],
      vars: {},
    };
    const minimalPackage = {
      name: 'test-pkg',
      title: 'Test',
      version: '0.0.0',
      description: '',
      type: 'integration',
      categories: [],
      requirement: { kibana: { versions: '' }, elasticsearch: { versions: '' } },
      format_version: '',
      download: '',
      path: '',
      assets: { kibana: {} },
      status: installationStatuses.NotInstalled,
      data_streams: [],
      policy_templates: [],
    };

    it('accepts profiles-* as an additional datastreams permission', () => {
      const result = validatePackagePolicy(
        { ...basePolicy, additional_datastreams_permissions: ['profiles-generic.otel-default'] },
        minimalPackage as unknown as PackageInfo,
        deps
      );
      expect(result.additional_datastreams_permissions).toBeNull();
    });

    it('rejects profiling-* as an additional datastreams permission', () => {
      const result = validatePackagePolicy(
        { ...basePolicy, additional_datastreams_permissions: ['profiling-events-default'] },
        minimalPackage as unknown as PackageInfo,
        deps
      );
      expect(result.additional_datastreams_permissions).not.toBeNull();
      expect(result.additional_datastreams_permissions![0]).toContain('profiling-events-default');
    });
  });

  describe('URL validation', () => {
    it('should not return an error message for a valid URL', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'url',
          value: 'https://example.com',
        },
        {
          name: 'test_url',
          type: 'url',
        },
        'test_url',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should not return an error message for a valid URL with port', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'url',
          value: 'https://example.com:8080',
        },
        {
          name: 'test_url',
          type: 'url',
        },
        'test_url',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should not return an error message for a valid URL with userinfo', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'url',
          value: 'https://foo:bar@example.com',
        },
        {
          name: 'test_url',
          type: 'url',
        },
        'test_url',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should not return an error message for a valid URL with path', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'url',
          value: 'phony://example.com/path',
        },
        {
          name: 'test_url',
          type: 'url',
        },
        'test_url',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should not return an error message for a valid URL with query params', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'url',
          value: 'https://example.com/?foo=bar',
        },
        {
          name: 'test_url',
          type: 'url',
        },
        'test_url',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should not return an error message for a valid URL with IPv4', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'url',
          value: 'https://192.0.2.1',
        },
        {
          name: 'test_url',
          type: 'url',
        },
        'test_url',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should not return an error message for a valid URL with IPv6', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'url',
          value: 'https://[2001:db8::1]:443',
        },
        {
          name: 'test_url',
          type: 'url',
        },
        'test_url',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should return an error message for an invalid URL', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'url',
          value: 'not-a-valid-url',
        },
        {
          name: 'test_url',
          type: 'url',
        },
        'test_url',
        parse
      );

      expect(res).toEqual([expect.stringContaining('Invalid URL format')]);
    });

    it('should not return an error message for a URL with allowed scheme', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'url',
          value: 'https://example.com',
        },
        {
          name: 'test_url',
          type: 'url',
          url_allowed_schemes: ['https', 'http'],
        },
        'test_url',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should return an error message for a URL with disallowed scheme', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'url',
          value: 'ftp://example.com',
        },
        {
          name: 'test_url',
          type: 'url',
          url_allowed_schemes: ['https', 'http'],
        },
        'test_url',
        parse
      );

      expect(res).toEqual([expect.stringContaining('URL scheme "ftp" is not allowed')]);
    });

    it('should not validate empty URL values', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'url',
          value: '',
        },
        {
          name: 'test_url',
          type: 'url',
        },
        'test_url',
        parse
      );

      expect(res).toEqual(null);
    });

    it('should validate required URL values', () => {
      const res = validatePackagePolicyConfig(
        {
          type: 'url',
          value: undefined,
        },
        {
          name: 'test_url',
          type: 'url',
          required: true,
        },
        'test_url',
        parse
      );

      expect(res).toEqual([expect.stringContaining('is required')]);
    });
  });
});

describe('Fleet - parseDuration()', () => {
  it('correctly calculates nanoseconds for a valid duration string', () => {
    const result = parseDuration('1h30m45s500ms');

    const expectedNs =
      3_600_000_000_000 + // 1 hour
      1_800_000_000_000 + // 30 minutes
      45_000_000_000 + // 45 seconds
      500_000_000; // 500 milliseconds

    expect(result.isValid).toBe(true);
    expect(result.valueNs).toBe(expectedNs);
    expect(result.errors).toHaveLength(0);
  });

  it('produces an error when given an invalid duration', () => {
    // Test with an invalid duration format
    const result = parseDuration('invalid');

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Invalid duration format');
  });
});

describe('Fleet - validatePackagePolicy with var_groups', () => {
  const packageInfoWithVarGroups: PackageInfo = {
    name: 'test_package',
    version: '1.0.0',
    title: 'Test Package',
    description: 'Test package with var_groups',
    type: 'integration',
    format_version: '3.0.0',
    owner: { github: 'elastic/integrations', type: 'elastic' },
    categories: ['custom'],
    status: installationStatuses.NotInstalled,
    assets: { kibana: {} },
    data_streams: [],
    policy_templates: [],
    vars: [
      { name: 'api_key', type: 'password', title: 'API Key' },
      { name: 'api_url', type: 'text', title: 'API URL' },
      { name: 'client_id', type: 'text', title: 'Client ID' },
      { name: 'client_secret', type: 'password', title: 'Client Secret' },
      { name: 'proxy_url', type: 'text', title: 'Proxy URL' },
    ],
    var_groups: [
      {
        name: 'auth_method',
        title: 'Authentication',
        selector_title: 'Select method',
        required: true,
        options: [
          {
            name: 'api_key',
            title: 'API Key',
            vars: ['api_key', 'api_url'],
          },
          {
            name: 'oauth',
            title: 'OAuth',
            vars: ['client_id', 'client_secret'],
          },
        ],
      },
    ],
  } as unknown as PackageInfo;

  const basePackagePolicy: NewPackagePolicy = {
    name: 'test-policy',
    namespace: 'default',
    description: '',
    policy_ids: ['policy-1'],
    enabled: true,
    inputs: [],
    vars: {
      api_key: { type: 'password', value: '' },
      api_url: { type: 'text', value: '' },
      client_id: { type: 'text', value: '' },
      client_secret: { type: 'password', value: '' },
      proxy_url: { type: 'text', value: '' },
    },
    var_group_selections: { auth_method: 'api_key' },
  };

  it('should validate vars in selected var_group option as required when var_group.required is true', () => {
    const policyWithUndefinedApiKey = {
      ...basePackagePolicy,
      vars: {
        ...basePackagePolicy.vars,
        api_key: { type: 'password', value: undefined }, // Undefined - should be invalid
        api_url: { type: 'text', value: undefined }, // Undefined - should be invalid
      },
      var_group_selections: { auth_method: 'api_key' },
    };

    const result = validatePackagePolicy(policyWithUndefinedApiKey, packageInfoWithVarGroups, deps);

    // api_key and api_url should have validation errors because they're required by var_group
    expect(result.vars?.api_key).toEqual([expect.stringContaining('is required')]);
    expect(result.vars?.api_url).toEqual([expect.stringContaining('is required')]);
  });

  it('should allow empty strings for var_group required vars (same as regular required vars)', () => {
    const policyWithEmptyApiKey = {
      ...basePackagePolicy,
      vars: {
        ...basePackagePolicy.vars,
        api_key: { type: 'password', value: '' }, // Empty string is allowed
        api_url: { type: 'text', value: '' }, // Empty string is allowed
      },
      var_group_selections: { auth_method: 'api_key' },
    };

    const result = validatePackagePolicy(policyWithEmptyApiKey, packageInfoWithVarGroups, deps);

    // Empty strings are allowed for var_group required vars (same as regular required vars)
    expect(result.vars?.api_key).toBeNull();
    expect(result.vars?.api_url).toBeNull();
  });

  it('should not validate vars outside selected var_group option', () => {
    const policyWithApiKeySelected = {
      ...basePackagePolicy,
      vars: {
        ...basePackagePolicy.vars,
        api_key: { type: 'password', value: 'my-api-key' },
        api_url: { type: 'text', value: 'https://api.example.com' },
        client_id: { type: 'text', value: '' }, // Empty but not in selected option
        client_secret: { type: 'password', value: '' }, // Empty but not in selected option
      },
      var_group_selections: { auth_method: 'api_key' },
    };

    const result = validatePackagePolicy(policyWithApiKeySelected, packageInfoWithVarGroups, deps);

    // api_key and api_url have values, should be valid (null)
    expect(result.vars?.api_key).toBeNull();
    expect(result.vars?.api_url).toBeNull();
    // client_id and client_secret are not in selected option, should be skipped (null)
    expect(result.vars?.client_id).toBeNull();
    expect(result.vars?.client_secret).toBeNull();
  });

  it('should validate oauth vars when oauth option is selected', () => {
    const policyWithOAuthSelected = {
      ...basePackagePolicy,
      vars: {
        ...basePackagePolicy.vars,
        api_key: { type: 'password', value: '' }, // Not in selected option
        api_url: { type: 'text', value: '' }, // Not in selected option
        client_id: { type: 'text', value: undefined }, // In selected option - should be required
        client_secret: { type: 'password', value: undefined }, // In selected option - should be required
      },
      var_group_selections: { auth_method: 'oauth' },
    };

    const result = validatePackagePolicy(policyWithOAuthSelected, packageInfoWithVarGroups, deps);

    // api_key and api_url are not in selected option, should be skipped
    expect(result.vars?.api_key).toBeNull();
    expect(result.vars?.api_url).toBeNull();
    // client_id and client_secret are in selected option and undefined, should be invalid
    expect(result.vars?.client_id).toEqual([expect.stringContaining('is required')]);
    expect(result.vars?.client_secret).toEqual([expect.stringContaining('is required')]);
  });

  it('should always validate vars not controlled by any var_group', () => {
    const packageInfoWithRequiredNonGroupVar: PackageInfo = {
      ...packageInfoWithVarGroups,
      vars: [
        ...packageInfoWithVarGroups.vars!,
        { name: 'required_var', type: 'text', title: 'Required Var', required: true },
      ],
    } as unknown as PackageInfo;

    // Test with undefined value - should fail required validation
    const policyWithMissingRequiredVar = {
      ...basePackagePolicy,
      vars: {
        ...basePackagePolicy.vars,
        api_key: { type: 'password', value: 'my-key' },
        api_url: { type: 'text', value: 'https://api.example.com' },
        required_var: { type: 'text', value: undefined }, // Required by varDef, value is undefined
      },
      var_group_selections: { auth_method: 'api_key' },
    };

    const result = validatePackagePolicy(
      policyWithMissingRequiredVar,
      packageInfoWithRequiredNonGroupVar,
      deps
    );

    // required_var is not controlled by var_group but has required: true and undefined value
    expect(result.vars?.required_var).toEqual([expect.stringContaining('is required')]);
  });

  it('should allow empty strings for regular required vars (not required by var_group)', () => {
    const packageInfoWithRequiredNonGroupVar: PackageInfo = {
      ...packageInfoWithVarGroups,
      vars: [
        ...packageInfoWithVarGroups.vars!,
        { name: 'required_var', type: 'text', title: 'Required Var', required: true },
      ],
    } as unknown as PackageInfo;

    // Note: Empty strings are allowed for regular required vars in Fleet
    // Only undefined values trigger required validation error
    const policyWithEmptyRequiredVar = {
      ...basePackagePolicy,
      vars: {
        ...basePackagePolicy.vars,
        api_key: { type: 'password', value: 'my-key' },
        api_url: { type: 'text', value: 'https://api.example.com' },
        required_var: { type: 'text', value: '' }, // Required by varDef but empty string is OK
      },
      var_group_selections: { auth_method: 'api_key' },
    };

    const result = validatePackagePolicy(
      policyWithEmptyRequiredVar,
      packageInfoWithRequiredNonGroupVar,
      deps
    );

    // Empty strings are allowed for regular required vars
    expect(result.vars?.required_var).toBeNull();
  });

  it('should pass validation when all required var_group vars have values', () => {
    const validPolicy = {
      ...basePackagePolicy,
      vars: {
        ...basePackagePolicy.vars,
        api_key: { type: 'password', value: 'my-api-key' },
        api_url: { type: 'text', value: 'https://api.example.com' },
      },
      var_group_selections: { auth_method: 'api_key' },
    };

    const result = validatePackagePolicy(validPolicy, packageInfoWithVarGroups, deps);

    expect(result.vars?.api_key).toBeNull();
    expect(result.vars?.api_url).toBeNull();
    expect(validationHasErrors(result)).toBe(false);
  });
});
