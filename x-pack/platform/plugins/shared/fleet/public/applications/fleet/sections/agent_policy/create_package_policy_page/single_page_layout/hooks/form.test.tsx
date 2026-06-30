/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RenderHookResult } from '@testing-library/react';
import { act, waitFor } from '@testing-library/react';

import type { TestRenderer } from '../../../../../../../mock';
import { createFleetTestRendererMock } from '../../../../../../../mock';
import type { PackageInfo } from '../../../../../types';

import { sendGetPackagePolicies, useConfig } from '../../../../../hooks';
import { ExperimentalFeaturesService } from '../../../../../services';

import { SelectedPolicyTab } from '../../components';

import { useOnSubmit, updateAgentlessCloudConnectorConfig } from './form';

type MockFn = jest.MockedFunction<any>;

jest.mock('../../../../../hooks', () => {
  return {
    ...jest.requireActual('../../../../../hooks'),
    sendGetPackagePolicies: jest.fn().mockReturnValue({
      data: {
        items: [{ name: 'nginx-1' }, { name: 'other-policy' }],
      },
      isLoading: false,
    }),
    useFleetStatus: jest.fn().mockReturnValue({ isReady: true } as any),
    sendGetStatus: jest
      .fn()
      .mockResolvedValue({ data: { isReady: true, missing_requirements: [] } }),
    useConfig: jest.fn(),
  };
});

describe('useOnSubmit', () => {
  const packageInfo: PackageInfo = {
    name: 'apache',
    version: '1.0.0',
    description: '',
    format_version: '',
    release: 'ga',
    owner: { github: '' },
    title: 'Apache',
    latestVersion: '',
    assets: {} as any,
    status: 'not_installed',
    vars: [
      {
        show_user: true,
        name: 'Show user var',
        type: 'string',
        default: 'showUserVarVal',
      },
      {
        required: true,
        name: 'Required var',
        type: 'bool',
      },
      {
        name: 'Advanced var',
        type: 'bool',
        default: true,
      },
    ],
  };

  let testRenderer: TestRenderer;
  let renderResult: RenderHookResult<
    ReturnType<typeof useOnSubmit>,
    Parameters<typeof useOnSubmit>
  >;
  const render = async ({ isUpdate } = { isUpdate: false }) => {
    renderResult = testRenderer.renderHook(() =>
      useOnSubmit({
        agentCount: 0,
        packageInfo,
        withSysMonitoring: false,
        selectedPolicyTab: SelectedPolicyTab.NEW,
        newAgentPolicy: { name: 'test', namespace: '' },
        queryParamsPolicyId: undefined,
        hasFleetAddAgentsPrivileges: true,
        setNewAgentPolicy: jest.fn(),
        setSelectedPolicyTab: jest.fn(),
      })
    );

    await waitFor(() => new Promise((resolve) => resolve(null)));

    return renderResult;
  };

  beforeEach(() => {
    testRenderer = createFleetTestRendererMock();
    (useConfig as MockFn).mockReturnValue({
      agentless: undefined,
    } as any);
  });

  describe('default API response', () => {
    beforeEach(async () => {
      await render();
    });

    it('should set new values when package policy changes', () => {
      act(() => {
        renderResult.result.current.updatePackagePolicy({
          id: 'new-id',
          namespace: 'newspace',
          name: 'apache-2',
        });
      });

      expect(renderResult.result.current.packagePolicy).toEqual({
        id: 'new-id',
        policy_ids: [],
        namespace: 'newspace',
        description: '',
        enabled: true,
        inputs: [],
        name: 'apache-2',
        package: {
          name: 'apache',
          title: 'Apache',
          version: '1.0.0',
        },
        vars: {
          'Advanced var': {
            type: 'bool',
            value: true,
          },
          'Required var': {
            type: 'bool',
            value: undefined,
          },
          'Show user var': {
            type: 'string',
            value: 'showUserVarVal',
          },
        },
      });
    });

    it('should set index 1 name to package policy on init if no package policies exist for this package', () => {
      // waitFor(() => {
      //   expect(renderResult.getByDisplayValue('apache-1')).toBeInTheDocument();
      //   expect(renderResult.getByDisplayValue('desc')).toBeInTheDocument();
      // });

      expect(renderResult.result.current.packagePolicy).toEqual({
        description: '',
        enabled: true,
        inputs: [],
        name: 'apache-1',
        namespace: '',
        policy_ids: [],
        package: {
          name: 'apache',
          title: 'Apache',
          version: '1.0.0',
        },
        vars: {
          'Advanced var': {
            type: 'bool',
            value: true,
          },
          'Required var': {
            type: 'bool',
            value: undefined,
          },
          'Show user var': {
            type: 'string',
            value: 'showUserVarVal',
          },
        },
      });
    });
  });

  describe('submitAttempted', () => {
    // Regression test for validation errors being shown on initial load. The UI
    // gates forced validation errors behind `submitAttempted`, so the flag must
    // stay `false` on load even when the form already has errors, and only flip
    // to `true` once a save is attempted.
    it('should not set submitAttempted on load with validation errors, only after submit', async () => {
      // agentCount > 0 makes onSubmit short-circuit on the confirm step, so it
      // never reaches the real save path regardless of the (timing-dependent)
      // form state set during init.
      renderResult = testRenderer.renderHook(() =>
        useOnSubmit({
          agentCount: 1,
          packageInfo,
          withSysMonitoring: false,
          selectedPolicyTab: SelectedPolicyTab.NEW,
          newAgentPolicy: { name: 'test', namespace: '' },
          queryParamsPolicyId: undefined,
          hasFleetAddAgentsPrivileges: true,
          setNewAgentPolicy: jest.fn(),
          setSelectedPolicyTab: jest.fn(),
        })
      );
      await waitFor(() => new Promise((resolve) => resolve(null)));

      // Give the form validation errors (e.g. an empty required var) as if they
      // existed as soon as the form loaded.
      act(() => {
        renderResult.result.current.setValidationResults({
          name: null,
          description: null,
          namespace: null,
          additional_datastreams_permissions: null,
          condition: null,
          inputs: null,
          vars: { 'Required var': ['Required var is required'] },
        });
      });

      // Errors are present, but until a save is attempted the flag stays false.
      expect(renderResult.result.current.hasErrors).toBe(true);
      expect(renderResult.result.current.submitAttempted).toBe(false);

      await act(async () => {
        await renderResult.result.current.onSubmit();
      });

      // Only after attempting to save does submitAttempted flip to true.
      expect(renderResult.result.current.submitAttempted).toBe(true);
    });
  });

  it('should set incremented name if other package policies exist', async () => {
    (sendGetPackagePolicies as jest.MockedFunction<any>).mockReturnValue({
      data: {
        items: [
          { name: 'apache-1' },
          { name: 'apache-2' },
          { name: 'apache-9' },
          { name: 'apache-10' },
        ],
      },
      isLoading: false,
    });

    await render();

    expect(renderResult.result.current.packagePolicy).toEqual({
      description: '',
      enabled: true,
      inputs: [],
      name: 'apache-11',
      namespace: '',
      policy_ids: [],
      package: {
        name: 'apache',
        title: 'Apache',
        version: '1.0.0',
      },
      vars: {
        'Advanced var': {
          type: 'bool',
          value: true,
        },
        'Required var': {
          type: 'bool',
          value: undefined,
        },
        'Show user var': {
          type: 'string',
          value: 'showUserVarVal',
        },
      },
    });
  });

  describe('input deployment mode filtering', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(ExperimentalFeaturesService, 'get').mockReturnValue({
        enableVarGroups: true,
      } as any);
    });

    it('should disable inputs that are not allowed for agentless deployment mode', async () => {
      // Mock packageInfo with inputs that have deployment_modes
      const packageInfoWithInputs: PackageInfo = {
        ...packageInfo,
        policy_templates: [
          {
            name: 'test_template',
            title: 'Test Template',
            description: 'Test template',
            deployment_modes: {
              default: { enabled: true },
              agentless: { enabled: true },
            },
            inputs: [
              {
                type: 'logs',
                title: 'Logs',
                description: 'Log collection',
                deployment_modes: ['default', 'agentless'],
              },
              {
                type: 'metrics',
                title: 'Metrics',
                description: 'Metrics collection',
                deployment_modes: ['default'],
              },
              {
                type: 'http_endpoint',
                title: 'HTTP Endpoint',
                description: 'HTTP endpoint',
                deployment_modes: ['agentless'],
              },
            ],
          },
        ],
      };

      // Mock useConfig to return agentless configuration
      (useConfig as MockFn).mockReturnValue({
        agentless: { enabled: true },
      } as any);

      // Render the hook with a package policy that has inputs including metrics
      renderResult = testRenderer.renderHook(() =>
        useOnSubmit({
          agentCount: 0,
          packageInfo: packageInfoWithInputs,
          withSysMonitoring: false,
          selectedPolicyTab: SelectedPolicyTab.NEW,
          newAgentPolicy: { name: 'test', namespace: '', supports_agentless: true },
          queryParamsPolicyId: undefined,
          hasFleetAddAgentsPrivileges: true,
          setNewAgentPolicy: jest.fn(),
          setSelectedPolicyTab: jest.fn(),
        })
      );

      await waitFor(() => new Promise((resolve) => resolve(null)));
      act(() => {
        // Simulate switching to agentless setup technology
        renderResult.result.current.handleSetupTechnologyChange('agentless' as any);
      });

      await waitFor(() => {
        const { packagePolicy } = renderResult.result.current;
        const logsInput = packagePolicy.inputs.find((input: any) => input.type === 'logs');
        const metricsInput = packagePolicy.inputs.find((input: any) => input.type === 'metrics');
        const httpInput = packagePolicy.inputs.find((input: any) => input.type === 'http_endpoint');

        // Expect logs and http_endpoint to be enabled, and metrics to be disabled
        expect(logsInput?.enabled).toBe(true);
        expect(httpInput?.enabled).toBe(true);
        expect(metricsInput?.enabled).toBe(false);
      });
    });

    it('should disable inputs when policy_template deployment mode is not declared when in agentless deployment mode', async () => {
      // Mock packageInfo with a policy template that doesn't declare agentless deployment mode
      // But also has a policy template that does so the package is deemed supports_agentless
      // We will try to install the non-agentless policy template

      const packageInfoWithInputs: PackageInfo = {
        ...packageInfo,
        policy_templates: [
          {
            name: 'test_template',
            title: 'Test Template',
            description: 'Test template',
            inputs: [
              {
                type: 'logs',
                title: 'Logs',
                description: 'Log collection',
                deployment_modes: ['default', 'agentless'],
              },
              {
                type: 'metrics',
                title: 'Metrics',
                description: 'Metrics collection',
                deployment_modes: ['default'],
              },
              {
                type: 'http_endpoint',
                title: 'HTTP Endpoint',
                description: 'HTTP endpoint',
                deployment_modes: ['agentless'],
              },
            ],
          },
          {
            name: 'test_template_2',
            title: 'Test Template 2',
            description: 'Test template',
            deployment_modes: {
              agentless: { enabled: true },
              default: { enabled: true },
            },
            inputs: [
              {
                type: 'logs',
                title: 'Logs',
                description: 'Log collection',
                deployment_modes: ['default', 'agentless'],
              },
              {
                type: 'metrics',
                title: 'Metrics',
                description: 'Metrics collection',
                deployment_modes: ['default'],
              },
              {
                type: 'http_endpoint',
                title: 'HTTP Endpoint',
                description: 'HTTP endpoint',
                deployment_modes: ['agentless'],
              },
            ],
          },
        ],
      };

      // Mock useConfig to return agentless configuration
      (useConfig as MockFn).mockReturnValue({
        agentless: { enabled: true },
      } as any);

      // Render the hook with a package policy that has inputs including metrics
      renderResult = testRenderer.renderHook(() =>
        useOnSubmit({
          agentCount: 0,
          packageInfo: packageInfoWithInputs,
          integrationToEnable: 'test_template_1',
          withSysMonitoring: false,
          selectedPolicyTab: SelectedPolicyTab.NEW,
          newAgentPolicy: { name: 'test', namespace: '', supports_agentless: true },
          queryParamsPolicyId: undefined,
          hasFleetAddAgentsPrivileges: true,
          setNewAgentPolicy: jest.fn(),
          setSelectedPolicyTab: jest.fn(),
        })
      );

      act(() => {
        // Simulate switching to agentless setup technology
        renderResult.result.current.handleSetupTechnologyChange('agentless' as any);
      });

      await waitFor(() => {
        const { packagePolicy } = renderResult.result.current;
        const logsInput = packagePolicy.inputs.find((input: any) => input.type === 'logs');
        const metricsInput = packagePolicy.inputs.find((input: any) => input.type === 'metrics');
        const httpInput = packagePolicy.inputs.find((input: any) => input.type === 'http_endpoint');

        expect(logsInput?.enabled).toBe(false);
        expect(httpInput?.enabled).toBe(false);
        expect(metricsInput?.enabled).toBe(false);
      });
    });

    it('should disable inputs hidden by var_group selection (same pattern as deployment mode)', async () => {
      const packageInfoWithVarGroups = {
        ...packageInfo,
        var_groups: [
          {
            name: 'credential_type',
            title: 'Credential',
            selector_title: 'Select credential',
            required: true,
            options: [
              { name: 'cloud_connectors', title: 'Cloud Connector', vars: [] },
              { name: 'direct_access_key', title: 'Direct', vars: [] },
            ],
          },
        ],
        policy_templates: [
          {
            name: 'guardduty',
            title: 'GuardDuty',
            description: 'GuardDuty',
            inputs: [
              {
                type: 'guardduty',
                title: 'GuardDuty',
                description: 'GuardDuty input',
                hide_in_var_group_options: { credential_type: ['cloud_connectors'] },
              },
            ],
          },
        ],
      } as unknown as PackageInfo;

      renderResult = testRenderer.renderHook(() =>
        useOnSubmit({
          agentCount: 0,
          packageInfo: packageInfoWithVarGroups,
          withSysMonitoring: false,
          selectedPolicyTab: SelectedPolicyTab.NEW,
          newAgentPolicy: { name: 'test', namespace: '' },
          queryParamsPolicyId: undefined,
          hasFleetAddAgentsPrivileges: true,
          setNewAgentPolicy: jest.fn(),
          setSelectedPolicyTab: jest.fn(),
        })
      );

      await waitFor(() => new Promise((resolve) => resolve(null)));

      act(() => {
        renderResult.result.current.updatePackagePolicy({
          var_group_selections: { credential_type: 'cloud_connectors' },
        });
      });

      await waitFor(() => {
        const { packagePolicy } = renderResult.result.current;
        const guarddutyInput = packagePolicy.inputs?.find(
          (input: any) => input.type === 'guardduty'
        );
        expect(guarddutyInput?.enabled).toBe(false);
      });
    });

    it('should enable all inputs for default deployment mode', async () => {
      // Mock packageInfo with inputs
      const packageInfoWithInputs: PackageInfo = {
        ...packageInfo,
        policy_templates: [
          {
            name: 'test_template',
            title: 'Test Template',
            description: 'Test template',
            deployment_modes: {
              default: { enabled: true },
              agentless: { enabled: true },
            },
            inputs: [
              {
                type: 'logs',
                title: 'Logs',
                description: 'Log collection',
                deployment_modes: ['default', 'agentless'],
              },
              {
                type: 'metrics',
                title: 'Metrics',
                description: 'Metrics collection',
                deployment_modes: ['default'],
              },
            ],
          },
        ],
      };

      // Mock useConfig to return regular configuration
      (useConfig as MockFn).mockReturnValue({
        agentless: undefined,
      } as any);

      // Render the hook with regular agent policy
      renderResult = testRenderer.renderHook(() =>
        useOnSubmit({
          agentCount: 0,
          packageInfo: packageInfoWithInputs,
          withSysMonitoring: false,
          selectedPolicyTab: SelectedPolicyTab.NEW,
          newAgentPolicy: { name: 'test', namespace: '' },
          queryParamsPolicyId: undefined,
          hasFleetAddAgentsPrivileges: true,
          setNewAgentPolicy: jest.fn(),
          setSelectedPolicyTab: jest.fn(),
        })
      );

      await waitFor(() => new Promise((resolve) => resolve(null)));
      await waitFor(() => {
        const { packagePolicy } = renderResult.result.current;
        const logsInput = packagePolicy.inputs.find((input: any) => input.type === 'logs');
        const metricsInput = packagePolicy.inputs.find((input: any) => input.type === 'metrics');

        // Both inputs should remain enabled for default mode
        expect(logsInput?.enabled).toBe(true);
        expect(metricsInput?.enabled).toBe(true);
      });
    });

    it('should auto-enable a single disabled input when switching to agentless deployment mode', async () => {
      // Single-input agentless package whose stream has enabled:false in the spec.
      // The simplified UX shows no toggle, so the input must be auto-enabled so that
      // configuration fields are visible and the integration can actually be deployed.
      const packageInfoWithDisabledInputs: PackageInfo = {
        ...packageInfo,
        data_streams: [
          {
            type: 'logs',
            dataset: 'test.access',
            path: 'access',
            release: 'ga',
            package: 'apache',
            ingest_pipeline: 'default',
            title: 'Apache access logs',
            streams: [
              {
                input: 'logfile',
                enabled: false,
                vars: [],
              },
            ],
          },
        ] as any,
        policy_templates: [
          {
            name: 'apache',
            title: 'Apache',
            description: 'Apache integration',
            deployment_modes: {
              default: { enabled: true },
              agentless: { enabled: true },
            },
            inputs: [
              {
                type: 'logfile',
                title: 'Log files',
                description: 'Collect Apache log files',
                deployment_modes: ['default', 'agentless'],
              },
            ],
          },
        ],
      };

      (useConfig as MockFn).mockReturnValue({
        agentless: { enabled: true },
      } as any);

      renderResult = testRenderer.renderHook(() =>
        useOnSubmit({
          agentCount: 0,
          packageInfo: packageInfoWithDisabledInputs,
          withSysMonitoring: false,
          selectedPolicyTab: SelectedPolicyTab.NEW,
          newAgentPolicy: { name: 'test', namespace: '', supports_agentless: true },
          queryParamsPolicyId: undefined,
          hasFleetAddAgentsPrivileges: true,
          setNewAgentPolicy: jest.fn(),
          setSelectedPolicyTab: jest.fn(),
        })
      );

      await waitFor(() => new Promise((resolve) => resolve(null)));

      // Verify input starts disabled (stream has enabled:false in spec)
      await waitFor(() => {
        const { packagePolicy } = renderResult.result.current;
        const logfileInput = packagePolicy.inputs.find((input: any) => input.type === 'logfile');
        expect(logfileInput?.enabled).toBe(false);
      });

      act(() => {
        renderResult.result.current.handleSetupTechnologyChange('agentless' as any);
      });

      await waitFor(() => {
        const { packagePolicy } = renderResult.result.current;
        const logfileInput = packagePolicy.inputs.find((input: any) => input.type === 'logfile');
        // Single agentless input should be auto-enabled so config fields are visible
        expect(logfileInput?.enabled).toBe(true);
        expect(logfileInput?.streams.every((s: any) => s.enabled)).toBe(true);
      });
    });

    it('should not auto-enable disabled inputs for multi-input agentless packages', async () => {
      // Multi-input package: the user should be able to choose which inputs to enable,
      // so we must not blindly enable everything when switching to agentless.
      const packageInfoMultiInput: PackageInfo = {
        ...packageInfo,
        data_streams: [
          {
            type: 'logs',
            dataset: 'test.access',
            path: 'access',
            release: 'ga',
            package: 'apache',
            ingest_pipeline: 'default',
            title: 'Apache access logs',
            streams: [{ input: 'logfile', enabled: false, vars: [] }],
          },
          {
            type: 'metrics',
            dataset: 'test.metrics',
            path: 'metrics',
            release: 'ga',
            package: 'apache',
            ingest_pipeline: 'default',
            title: 'Apache metrics',
            streams: [{ input: 'apache/metrics', enabled: false, vars: [] }],
          },
        ] as any,
        policy_templates: [
          {
            name: 'apache',
            title: 'Apache',
            description: 'Apache integration',
            deployment_modes: {
              default: { enabled: true },
              agentless: { enabled: true },
            },
            inputs: [
              {
                type: 'logfile',
                title: 'Log files',
                description: 'Collect Apache log files',
                deployment_modes: ['default', 'agentless'],
              },
              {
                type: 'apache/metrics',
                title: 'Metrics',
                description: 'Collect Apache metrics',
                deployment_modes: ['default', 'agentless'],
              },
            ],
          },
        ],
      };

      (useConfig as MockFn).mockReturnValue({
        agentless: { enabled: true },
      } as any);

      renderResult = testRenderer.renderHook(() =>
        useOnSubmit({
          agentCount: 0,
          packageInfo: packageInfoMultiInput,
          withSysMonitoring: false,
          selectedPolicyTab: SelectedPolicyTab.NEW,
          newAgentPolicy: { name: 'test', namespace: '', supports_agentless: true },
          queryParamsPolicyId: undefined,
          hasFleetAddAgentsPrivileges: true,
          setNewAgentPolicy: jest.fn(),
          setSelectedPolicyTab: jest.fn(),
        })
      );

      await waitFor(() => new Promise((resolve) => resolve(null)));

      act(() => {
        renderResult.result.current.handleSetupTechnologyChange('agentless' as any);
      });

      await waitFor(() => {
        const { packagePolicy } = renderResult.result.current;
        const logfileInput = packagePolicy.inputs.find((input: any) => input.type === 'logfile');
        const metricsInput = packagePolicy.inputs.find(
          (input: any) => input.type === 'apache/metrics'
        );
        // Multi-input packages are not auto-enabled; user must enable them explicitly
        expect(logfileInput?.enabled).toBe(false);
        expect(metricsInput?.enabled).toBe(false);
      });
    });
  });

  describe('updateAgentlessCloudConnectorConfig', () => {
    it('should update agentless cloud connector config when enabled and target CSP is aws', () => {
      const setNewAgentPolicy = jest.fn();
      const setPackagePolicy = jest.fn();

      const packagePolicy = {
        inputs: [
          {
            type: 'aws',
            enabled: true,
            streams: [
              {
                vars: {
                  'aws.supports_cloud_connectors': { value: true },
                },
              },
            ],
          },
        ],
        supports_cloud_connector: true,
      } as any;

      const newAgentPolicy = {
        supports_agentless: true,
        agentless: {
          cloud_connectors: {
            enabled: false,
            target_csp: 'azure',
          },
        },
      } as any;

      // Should update cloud_connectors to enabled: true, target_csp: 'aws'
      // and set supports_cloud_connector to true in packagePolicy
      updateAgentlessCloudConnectorConfig(
        packagePolicy,
        newAgentPolicy,
        setNewAgentPolicy,
        setPackagePolicy
      );

      expect(setNewAgentPolicy).toHaveBeenCalledWith({
        ...newAgentPolicy,
        agentless: {
          ...newAgentPolicy.agentless,
          cloud_connectors: {
            enabled: true,
            target_csp: 'aws',
          },
        },
      });
      expect(setPackagePolicy).toHaveBeenCalledWith({
        ...packagePolicy,
        supports_cloud_connector: true,
      });
    });

    it('should set cloud_connectors enabled to false and supports_cloud_connector to false for aws when cloud connector input var is false', () => {
      const setNewAgentPolicy = jest.fn();
      const setPackagePolicy = jest.fn();

      const packagePolicy = {
        inputs: [
          {
            type: 'aws',
            enabled: true,
            streams: [
              {
                vars: {
                  'aws.supports_cloud_connectors': { value: false },
                },
              },
            ],
          },
        ],
        supports_cloud_connector: false,
      } as any;

      const newAgentPolicy = {
        supports_agentless: true,
        agentless: {
          cloud_connectors: {
            enabled: true,
            target_csp: 'aws',
          },
        },
      } as any;

      updateAgentlessCloudConnectorConfig(
        packagePolicy,
        newAgentPolicy,
        setNewAgentPolicy,
        setPackagePolicy
      );

      expect(setNewAgentPolicy).toHaveBeenCalledWith({
        ...newAgentPolicy,
        agentless: {
          ...newAgentPolicy.agentless,
          cloud_connectors: {
            enabled: false,
            target_csp: 'aws',
          },
        },
      });
      expect(setPackagePolicy).toHaveBeenCalledWith({
        ...packagePolicy,
        supports_cloud_connector: false,
      });
    });

    it('should update agentless cloud connector config when enabled and target CSP is azure', () => {
      const setNewAgentPolicy = jest.fn();
      const setPackagePolicy = jest.fn();

      const packagePolicy = {
        inputs: [
          {
            type: 'azure',
            enabled: true,
            streams: [
              {
                vars: {
                  'azure.supports_cloud_connectors': { value: true },
                },
              },
            ],
          },
        ],
        supports_cloud_connector: true,
      } as any;

      const newAgentPolicy = {
        supports_agentless: true,
        agentless: {
          cloud_connectors: {
            enabled: false,
            target_csp: 'azure',
          },
        },
      } as any;

      // Should update cloud_connectors to enabled: true, target_csp: 'aws'
      // and set supports_cloud_connector to true in packagePolicy
      updateAgentlessCloudConnectorConfig(
        packagePolicy,
        newAgentPolicy,
        setNewAgentPolicy,
        setPackagePolicy
      );

      expect(setNewAgentPolicy).toHaveBeenCalledWith({
        ...newAgentPolicy,
        agentless: {
          ...newAgentPolicy.agentless,
          cloud_connectors: {
            enabled: true,
            target_csp: 'azure',
          },
        },
      });
      expect(setPackagePolicy).toHaveBeenCalledWith({
        ...packagePolicy,
        supports_cloud_connector: true,
      });
    });

    it('should set cloud_connectors enabled to false and supports_cloud_connector to false for azure when cloud connector input var is false', () => {
      const setNewAgentPolicy = jest.fn();
      const setPackagePolicy = jest.fn();

      const packagePolicy = {
        inputs: [
          {
            type: 'azure',
            enabled: true,
            streams: [
              {
                vars: {
                  'azure.supports_cloud_connectors': { value: false },
                },
              },
            ],
          },
        ],
        supports_cloud_connector: false,
      } as any;

      const newAgentPolicy = {
        supports_agentless: true,
        agentless: {
          cloud_connectors: {
            enabled: true,
            target_csp: 'azure',
          },
        },
      } as any;

      updateAgentlessCloudConnectorConfig(
        packagePolicy,
        newAgentPolicy,
        setNewAgentPolicy,
        setPackagePolicy
      );

      expect(setNewAgentPolicy).toHaveBeenCalledWith({
        ...newAgentPolicy,
        agentless: {
          ...newAgentPolicy.agentless,
          cloud_connectors: {
            enabled: false,
            target_csp: 'azure',
          },
        },
      });
      expect(setPackagePolicy).toHaveBeenCalledWith({
        ...packagePolicy,
        supports_cloud_connector: false,
      });
    });

    it('should update cloud_connectors with target_csp gcp and set supports_cloud_connector to false for gcp', () => {
      const setNewAgentPolicy = jest.fn();
      const setPackagePolicy = jest.fn();

      const packagePolicy = {
        inputs: [
          {
            type: 'gcp',
            enabled: true,
            streams: [
              {
                vars: {
                  'gcp.supports_cloud_connectors': { value: true },
                },
              },
            ],
          },
        ],
        supports_cloud_connector: true,
      } as any;

      const newAgentPolicy = {
        supports_agentless: true,
        agentless: {
          cloud_connectors: {
            enabled: false,
            target_csp: 'aws',
          },
        },
      } as any;

      updateAgentlessCloudConnectorConfig(
        packagePolicy,
        newAgentPolicy,
        setNewAgentPolicy,
        setPackagePolicy
      );

      expect(setNewAgentPolicy).toHaveBeenCalledWith({
        ...newAgentPolicy,
        agentless: {
          ...newAgentPolicy.agentless,
          cloud_connectors: {
            enabled: true,
            target_csp: 'gcp',
          },
        },
      });
      expect(setPackagePolicy).toHaveBeenCalledWith({
        ...packagePolicy,
        supports_cloud_connector: true,
      });
    });

    it('should set cloud_connectors enabled to false and supports_cloud_connector to false for gcp when cloud connector input var is false', () => {
      const setNewAgentPolicy = jest.fn();
      const setPackagePolicy = jest.fn();

      const packagePolicy = {
        inputs: [
          {
            type: 'gcp',
            enabled: true,
            streams: [
              {
                vars: {
                  'gcp.supports_cloud_connectors': { value: false },
                },
              },
            ],
          },
        ],
        supports_cloud_connector: false,
      } as any;

      const newAgentPolicy = {
        supports_agentless: true,
        agentless: {
          cloud_connectors: {
            enabled: true,
            target_csp: 'aws',
          },
        },
      } as any;

      updateAgentlessCloudConnectorConfig(
        packagePolicy,
        newAgentPolicy,
        setNewAgentPolicy,
        setPackagePolicy
      );

      expect(setNewAgentPolicy).toHaveBeenCalledWith({
        ...newAgentPolicy,
        agentless: {
          ...newAgentPolicy.agentless,
          cloud_connectors: {
            enabled: false,
            target_csp: 'gcp',
          },
        },
      });
      expect(setPackagePolicy).toHaveBeenCalledWith({
        ...packagePolicy,
        supports_cloud_connector: false,
      });
    });

    it('should not update agentless cloud connector config if nothing changed', () => {
      const setNewAgentPolicy = jest.fn();
      const setPackagePolicy = jest.fn();

      const packagePolicy = {
        inputs: [
          {
            type: 'aws',
            enabled: true,
            streams: [
              {
                vars: {
                  'aws.supports_cloud_connectors': { value: true },
                },
              },
            ],
          },
        ],
        supports_cloud_connector: true,
      } as any;

      const newAgentPolicy = {
        supports_agentless: true,
        agentless: {
          cloud_connectors: {
            enabled: true,
            target_csp: 'aws',
          },
        },
      } as any;

      updateAgentlessCloudConnectorConfig(
        packagePolicy,
        newAgentPolicy,
        setNewAgentPolicy,
        setPackagePolicy
      );

      expect(setNewAgentPolicy).not.toHaveBeenCalled();
      expect(setPackagePolicy).not.toHaveBeenCalled();
    });

    it('should not update if input is missing or not enabled', () => {
      const setNewAgentPolicy = jest.fn();
      const setPackagePolicy = jest.fn();

      const packagePolicy = {
        inputs: [
          {
            type: 'aws',
            enabled: false,
            streams: [
              {
                vars: {
                  'aws.supports_cloud_connectors': { value: true },
                },
              },
            ],
          },
        ],
        supports_cloud_connector: undefined,
      } as any;

      const newAgentPolicy = {
        supports_agentless: true,
        agentless: {},
      } as any;

      updateAgentlessCloudConnectorConfig(
        packagePolicy,
        newAgentPolicy,
        setNewAgentPolicy,
        setPackagePolicy
      );

      expect(setNewAgentPolicy).not.toHaveBeenCalled();
      expect(setPackagePolicy).not.toHaveBeenCalled();
    });
  });
});
