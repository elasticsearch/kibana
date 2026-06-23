/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react';

import { createFleetTestRendererMock } from '../../../../../../../../mock';
import type { TestRenderer } from '../../../../../../../../mock';
import { useAgentless } from '../../../single_page_layout/hooks/setup_technology';
import {
  DATASET_VAR_NAME,
  DATA_STREAM_TYPE_VAR_NAME,
} from '../../../../../../../../../common/constants';

import type {
  PackageInfo,
  RegistryStreamWithDataStream,
  NewPackagePolicyInputStream,
  RegistryVarGroup,
} from '../../../../../../types';

import { ExperimentalFeaturesService } from '../../../../../../services';

import { PackagePolicyInputStreamConfig } from './package_policy_input_stream';

jest.mock('../../../../../../../../hooks', () => ({
  ...jest.requireActual('../../../../../../../../hooks'),
  useStartServices: () => ({
    docLinks: {
      links: {
        fleet: {
          datastreamsNamingScheme: 'https://docs.elastic.co',
        },
      },
    },
  }),
  sendGetDataStreams: jest.fn(),
}));

jest.mock('../../datastream_hooks', () => ({
  useIndexTemplateExists: () => ({
    exists: true,
    isLoading: false,
  }),
}));
jest.mock('../../../single_page_layout/hooks/setup_technology', () => {
  return {
    useAgentless: jest.fn(),
  };
});

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useRouteMatch: () => ({
    params: {},
  }),
}));

const useAgentlessMock = useAgentless as jest.MockedFunction<typeof useAgentless>;

// Mock stream-level var_group
const mockStreamVarGroup: RegistryVarGroup = {
  name: 'auth_method',
  title: 'Authentication Method',
  selector_title: 'Choose authentication',
  description: 'Select how to authenticate to the service.',
  options: [
    {
      name: 'api_key',
      title: 'API Key',
      description: 'Authenticate using an API key.',
      vars: ['api_key'],
    },
    {
      name: 'oauth',
      title: 'OAuth',
      description: 'Authenticate using OAuth.',
      vars: ['client_id', 'client_secret'],
    },
    {
      name: 'cloud_connector',
      title: 'Cloud Connector',
      vars: ['connector_id'],
      hide_in_deployment_modes: ['default'],
    },
  ],
};

// Package input stream with stream-level var_groups
const mockPackageInputStreamWithVarGroups: RegistryStreamWithDataStream = {
  input: 'httpjson',
  title: 'Collect logs via API',
  template_path: 'stream.yml.hbs',
  var_groups: [mockStreamVarGroup],
  vars: [
    {
      name: 'api_key',
      type: 'password',
      title: 'API Key',
      required: true,
      show_user: true,
    },
    {
      name: 'client_id',
      type: 'text',
      title: 'Client ID',
      required: true,
      show_user: true,
    },
    {
      name: 'client_secret',
      type: 'password',
      title: 'Client Secret',
      required: true,
      show_user: true,
    },
    {
      name: 'connector_id',
      type: 'text',
      title: 'Connector ID',
      required: true,
      show_user: true,
    },
    {
      name: 'url',
      type: 'text',
      title: 'API URL',
      required: true,
      show_user: true,
    },
  ],
  description: 'Collect logs from an HTTP API',
  data_stream: {
    title: 'API Logs',
    release: 'ga',
    type: 'logs',
    package: 'test_package',
    dataset: 'test_package.api_logs',
    path: 'api_logs',
    elasticsearch: {},
    ingest_pipeline: 'default',
    streams: [],
  },
};

// Package policy input stream (what gets saved)
const mockPackagePolicyInputStream: NewPackagePolicyInputStream = {
  id: 'stream-1',
  enabled: true,
  data_stream: {
    type: 'logs',
    dataset: 'test_package.api_logs',
  },
  vars: {
    api_key: { type: 'password', value: '' },
    client_id: { type: 'text', value: '' },
    client_secret: { type: 'password', value: '' },
    connector_id: { type: 'text', value: '' },
    url: { type: 'text', value: 'https://api.example.com' },
  },
};

const mockPackageInfo: PackageInfo = {
  name: 'test_package',
  version: '1.0.0',
  title: 'Test Package',
  description: 'A test package for var_groups',
  type: 'integration',
  format_version: '3.0.0',
  owner: { github: 'elastic/integrations', type: 'elastic' },
  categories: ['custom'],
  data_streams: [],
  policy_templates: [],
  assets: { kibana: {} },
  status: 'installed',
} as unknown as PackageInfo;

describe('PackagePolicyInputStreamConfig', () => {
  let testRenderer: TestRenderer;
  let renderResult: ReturnType<typeof testRenderer.render>;
  let mockUpdatePackagePolicyInputStream: jest.Mock;

  beforeEach(() => {
    jest.spyOn(ExperimentalFeaturesService, 'get').mockReturnValue({
      enableVarGroups: true,
    } as any);
    testRenderer = createFleetTestRendererMock();
    mockUpdatePackagePolicyInputStream = jest.fn();

    useAgentlessMock.mockReturnValue({
      isAgentlessEnabled: false,
      isAgentlessDefault: false,
      isAgentlessAgentPolicy: jest.fn(),
      getAgentlessStatusForPackage: jest
        .fn()
        .mockReturnValue({ isAgentless: false, isDefaultDeploymentMode: false }),
      isServerless: false,
      isCloud: false,
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  /**
   * Renders `PackagePolicyInputStreamConfig`. Pass `inputPolicyTemplate` (parent input’s
   * `policy_template`) for composable multi-template packages so `dynamic_signal_types` matches
   * the correct template.
   */
  const render = (
    packageInputStream: RegistryStreamWithDataStream = mockPackageInputStreamWithVarGroups,
    packagePolicyInputStream: NewPackagePolicyInputStream = mockPackagePolicyInputStream,
    packageInfo: PackageInfo = mockPackageInfo,
    inputPolicyTemplate?: string
  ) => {
    renderResult = testRenderer.render(
      <PackagePolicyInputStreamConfig
        packageInputStream={packageInputStream}
        packageInfo={packageInfo}
        packagePolicyInputStream={packagePolicyInputStream}
        updatePackagePolicyInputStream={mockUpdatePackagePolicyInputStream}
        inputStreamValidationResults={{ vars: {} }}
        forceShowErrors={false}
        hasStreamToggle={true}
        inputPolicyTemplate={inputPolicyTemplate}
      />
    );
  };

  describe('stream-level var_groups', () => {
    it('test data has var_groups defined', () => {
      // Sanity check that our test data is correctly structured
      expect(mockPackageInputStreamWithVarGroups.var_groups).toBeDefined();
      expect(mockPackageInputStreamWithVarGroups.var_groups).toHaveLength(1);
      expect(mockPackageInputStreamWithVarGroups.var_groups![0].name).toBe('auth_method');
      expect(mockPackageInputStreamWithVarGroups.var_groups![0].options).toHaveLength(3);
    });

    it('should render VarGroupSelector when stream has var_groups', async () => {
      render();

      await waitFor(() => {
        expect(renderResult.getByText('Authentication Method')).toBeInTheDocument();
        expect(renderResult.getByText('Choose authentication')).toBeInTheDocument();
        expect(
          renderResult.getByText('Select how to authenticate to the service.')
        ).toBeInTheDocument();
      });
    });

    it('should show only vars for the selected option (api_key by default)', async () => {
      render();

      await waitFor(() => {
        // API Key var should be visible (first option is selected by default)
        // Use test-subj which is more reliable than text matching for input fields
        expect(renderResult.getByTestId('passwordInput-api-key')).toBeInTheDocument();

        // OAuth vars should be hidden
        expect(renderResult.queryByTestId('textInput-client-id')).not.toBeInTheDocument();
        expect(renderResult.queryByTestId('passwordInput-client-secret')).not.toBeInTheDocument();

        // Common var (url) should always be visible
        expect(renderResult.getByTestId('textInput-api-url')).toBeInTheDocument();
      });
    });

    it('should show OAuth vars when oauth option is selected', async () => {
      render();

      await waitFor(() => {
        expect(renderResult.getByTestId('varGroupSelector-auth_method')).toBeInTheDocument();
      });

      const select = renderResult.getByTestId('varGroupSelector-auth_method');
      fireEvent.change(select, { target: { value: 'oauth' } });

      // Verify callback was called with new selection
      await waitFor(() => {
        expect(mockUpdatePackagePolicyInputStream).toHaveBeenCalledWith({
          var_group_selections: { auth_method: 'oauth' },
        });
      });

      // Re-render with updated props (simulating what parent component would do)
      const updatedPolicyInputStream: NewPackagePolicyInputStream = {
        ...mockPackagePolicyInputStream,
        var_group_selections: { auth_method: 'oauth' },
      };
      renderResult.rerender(
        <PackagePolicyInputStreamConfig
          packageInputStream={mockPackageInputStreamWithVarGroups}
          packageInfo={mockPackageInfo}
          packagePolicyInputStream={updatedPolicyInputStream}
          updatePackagePolicyInputStream={mockUpdatePackagePolicyInputStream}
          inputStreamValidationResults={{ vars: {} }}
          forceShowErrors={false}
          hasStreamToggle={true}
        />
      );

      await waitFor(() => {
        // OAuth vars should now be visible
        expect(renderResult.getByTestId('textInput-client-id')).toBeInTheDocument();
        expect(renderResult.getByTestId('passwordInput-client-secret')).toBeInTheDocument();

        // API Key should be hidden
        expect(renderResult.queryByTestId('passwordInput-api-key')).not.toBeInTheDocument();
      });
    });

    it('should persist var_group_selections to the policy when selection changes', async () => {
      render();

      await waitFor(() => {
        expect(renderResult.getByTestId('varGroupSelector-auth_method')).toBeInTheDocument();
      });

      const select = renderResult.getByTestId('varGroupSelector-auth_method');
      fireEvent.change(select, { target: { value: 'oauth' } });

      await waitFor(() => {
        expect(mockUpdatePackagePolicyInputStream).toHaveBeenCalledWith({
          var_group_selections: { auth_method: 'oauth' },
        });
      });
    });

    it('should use saved var_group_selections from policy', async () => {
      const policyWithSavedSelections: NewPackagePolicyInputStream = {
        ...mockPackagePolicyInputStream,
        var_group_selections: { auth_method: 'oauth' },
      };

      render(mockPackageInputStreamWithVarGroups, policyWithSavedSelections);

      await waitFor(() => {
        // OAuth vars should be visible (saved selection)
        expect(renderResult.getByTestId('textInput-client-id')).toBeInTheDocument();
        expect(renderResult.getByTestId('passwordInput-client-secret')).toBeInTheDocument();

        // API Key should be hidden
        expect(renderResult.queryByTestId('passwordInput-api-key')).not.toBeInTheDocument();
      });
    });

    it('should filter options based on deployment mode (agentless)', async () => {
      useAgentlessMock.mockReturnValue({
        isAgentlessEnabled: true,
        isAgentlessDefault: false,
        isAgentlessAgentPolicy: jest.fn(),
        getAgentlessStatusForPackage: jest
          .fn()
          .mockReturnValue({ isAgentless: false, isDefaultDeploymentMode: false }),
        isServerless: false,
        isCloud: true,
      });

      render();

      await waitFor(() => {
        const select = renderResult.getByTestId('varGroupSelector-auth_method');
        const options = Array.from(select.querySelectorAll('option'));

        // cloud_connector should be visible in agentless mode
        expect(options.find((o) => o.value === 'cloud_connector')).toBeDefined();
      });
    });

    it('should filter options based on deployment mode (default)', async () => {
      useAgentlessMock.mockReturnValue({
        isAgentlessEnabled: false,
        isAgentlessDefault: false,
        isAgentlessAgentPolicy: jest.fn(),
        getAgentlessStatusForPackage: jest
          .fn()
          .mockReturnValue({ isAgentless: false, isDefaultDeploymentMode: false }),
        isServerless: false,
        isCloud: false,
      });

      render();

      await waitFor(() => {
        const select = renderResult.getByTestId('varGroupSelector-auth_method');
        const options = Array.from(select.querySelectorAll('option'));

        // cloud_connector should be filtered out in default mode
        expect(options.find((o) => o.value === 'cloud_connector')).toBeUndefined();
      });
    });

    it('should not render VarGroupSelector when stream has no var_groups', async () => {
      const streamWithoutVarGroups: RegistryStreamWithDataStream = {
        ...mockPackageInputStreamWithVarGroups,
        var_groups: undefined,
      };

      render(streamWithoutVarGroups);

      await waitFor(() => {
        // No var group selector should be rendered
        expect(renderResult.queryByText('Authentication Method')).not.toBeInTheDocument();

        // All vars should be visible since there's no var_group filtering
        expect(renderResult.getByTestId('passwordInput-api-key')).toBeInTheDocument();
        expect(renderResult.getByTestId('textInput-client-id')).toBeInTheDocument();
        expect(renderResult.getByTestId('passwordInput-client-secret')).toBeInTheDocument();
      });
    });

    it('should use package-level var_groups when stream has none but package has them', async () => {
      const packageInfoWithVarGroups: PackageInfo = {
        ...mockPackageInfo,
        var_groups: [mockStreamVarGroup],
      };

      const streamWithoutVarGroups: RegistryStreamWithDataStream = {
        ...mockPackageInputStreamWithVarGroups,
        var_groups: undefined,
      };

      // When stream has no var_groups but package does, the component uses the varGroupSelections prop
      // Since we're not passing varGroupSelections, it defaults to {}, so NO filtering should occur
      // (vars not controlled by any var_group are shown, vars controlled without selection are hidden)
      render(streamWithoutVarGroups, mockPackagePolicyInputStream, packageInfoWithVarGroups);

      await waitFor(() => {
        // Without varGroupSelections prop, package-level filtering hides all controlled vars
        // Only the uncontrolled var (url) should be visible
        expect(renderResult.getByTestId('textInput-api-url')).toBeInTheDocument();

        // Controlled vars are hidden because no selection is provided
        expect(renderResult.queryByTestId('passwordInput-api-key')).not.toBeInTheDocument();
      });
    });
  });

  describe('condition field', () => {
    const minimalInputStream: RegistryStreamWithDataStream = {
      input: 'httpjson',
      title: 'Collect logs',
      template_path: 'stream.yml.hbs',
      vars: [],
      description: 'Minimal stream for condition tests',
      data_stream: {
        title: 'Test Logs',
        release: 'ga',
        type: 'logs',
        package: 'test_package',
        dataset: 'test_package.test',
        path: 'test',
        elasticsearch: {},
        ingest_pipeline: 'default',
        streams: [],
      },
    };

    const minimalPolicyInputStream: NewPackagePolicyInputStream = {
      id: 'stream-cond',
      enabled: true,
      data_stream: { type: 'logs', dataset: 'test_package.test' },
      vars: {},
    };

    const renderCondition = (
      policyOverrides: Partial<NewPackagePolicyInputStream> = {},
      showConditionField = true
    ) => {
      renderResult = testRenderer.render(
        <PackagePolicyInputStreamConfig
          packageInputStream={minimalInputStream}
          packageInfo={mockPackageInfo}
          packagePolicyInputStream={{ ...minimalPolicyInputStream, ...policyOverrides }}
          updatePackagePolicyInputStream={mockUpdatePackagePolicyInputStream}
          inputStreamValidationResults={{ vars: {} }}
          forceShowErrors={false}
          hasStreamToggle={true}
          showConditionField={showConditionField}
        />
      );
    };

    it('shows condition field in advanced options when showConditionField is true', async () => {
      renderCondition();
      fireEvent.click(renderResult.getByText('Advanced options'));
      await waitFor(() => {
        expect(renderResult.getByTestId('packagePolicyStreamConditionInput')).toBeInTheDocument();
      });
    });

    it('hides condition field when showConditionField is false', async () => {
      renderCondition({}, false);
      expect(
        renderResult.queryByTestId('packagePolicyStreamConditionInput')
      ).not.toBeInTheDocument();
    });

    it('calls updatePackagePolicyInputStream with condition value on change', async () => {
      renderCondition();
      fireEvent.click(renderResult.getByText('Advanced options'));
      await waitFor(() => {
        expect(renderResult.getByTestId('packagePolicyStreamConditionInput')).toBeInTheDocument();
      });
      fireEvent.change(renderResult.getByTestId('packagePolicyStreamConditionInput'), {
        target: { value: "${host.os.type} == 'linux'" },
      });
      expect(mockUpdatePackagePolicyInputStream).toHaveBeenCalledWith({
        condition: "${host.os.type} == 'linux'",
      });
    });

    it('calls updatePackagePolicyInputStream with null when field is cleared', async () => {
      renderCondition({ condition: "${host.os.type} == 'linux'" });
      fireEvent.click(renderResult.getByText('Advanced options'));
      await waitFor(() => {
        expect(renderResult.getByTestId('packagePolicyStreamConditionInput')).toBeInTheDocument();
      });
      fireEvent.change(renderResult.getByTestId('packagePolicyStreamConditionInput'), {
        target: { value: '' },
      });
      expect(mockUpdatePackagePolicyInputStream).toHaveBeenCalledWith({ condition: null });
    });
  });

  describe('dynamic_signal_types behavior', () => {
    // Data Stream Type UI applies only to `packageInfo.type === 'input'` (see dev_docs/input_packages.md).
    // Input packages are documented with a single policy template; composable multi-template behavior
    // for `dynamic_signal_types` / `policy_template` is covered in policy_template.test.ts
    // (`packagePolicyInputAllowsUndefinedDataStreamType`).
    const mockOtelInputStream: RegistryStreamWithDataStream = {
      input: 'otelcol',
      title: 'OTel Collector',
      template_path: 'stream.yml.hbs',
      vars: [],
      description: 'Collect telemetry via OpenTelemetry',
      data_stream: {
        title: 'OTel Data',
        release: 'ga',
        type: 'logs',
        package: 'otel_package',
        dataset: 'otel_package.data',
        path: 'otel_data',
        elasticsearch: {},
        ingest_pipeline: 'default',
        streams: [],
      },
    };

    const mockOtelPolicyInputStream: NewPackagePolicyInputStream = {
      id: 'otel-stream-1',
      enabled: true,
      data_stream: {
        type: 'logs',
        dataset: 'otel_package.data',
      },
      vars: {},
    };

    it('should hide Data Stream Type selector when dynamic_signal_types is true', async () => {
      const packageInfoWithDynamicTypes: PackageInfo = {
        ...mockPackageInfo,
        type: 'input',
        policy_templates: [
          {
            name: 'otel_template',
            title: 'OTel Template',
            description: 'OpenTelemetry template',
            input: 'otelcol',
            type: 'logs',
            template_path: 'input.yml.hbs',
            dynamic_signal_types: true,
            vars: [],
          },
        ],
      } as unknown as PackageInfo;

      render(mockOtelInputStream, mockOtelPolicyInputStream, packageInfoWithDynamicTypes);

      // Click to show advanced options
      const advancedButton = renderResult.getByText('Advanced options');
      fireEvent.click(advancedButton);

      await waitFor(() => {
        // Data Stream Type selector should NOT be visible
        expect(renderResult.queryByText('Data Stream Type')).not.toBeInTheDocument();
        expect(renderResult.queryByTestId('packagePolicyDataStreamType')).not.toBeInTheDocument();
      });
    });

    it('should show Data Stream Type selector when dynamic_signal_types is false', async () => {
      const packageInfoWithoutDynamicTypes: PackageInfo = {
        ...mockPackageInfo,
        type: 'input',
        policy_templates: [
          {
            name: 'otel_template',
            title: 'OTel Template',
            description: 'OpenTelemetry template',
            input: 'otelcol',
            type: 'logs',
            template_path: 'input.yml.hbs',
            dynamic_signal_types: false,
            vars: [],
          },
        ],
      } as unknown as PackageInfo;

      render(mockOtelInputStream, mockOtelPolicyInputStream, packageInfoWithoutDynamicTypes);

      // Click to show advanced options
      const advancedButton = renderResult.getByText('Advanced options');
      fireEvent.click(advancedButton);

      await waitFor(() => {
        // Data Stream Type selector SHOULD be visible
        expect(renderResult.getByText('Data Stream Type')).toBeInTheDocument();
        expect(renderResult.getByTestId('packagePolicyDataStreamType')).toBeInTheDocument();
      });
    });

    it('should show Data Stream Type selector when dynamic_signal_types is not defined', async () => {
      const packageInfoWithoutDynamicTypes: PackageInfo = {
        ...mockPackageInfo,
        type: 'input',
        policy_templates: [
          {
            name: 'otel_template',
            title: 'OTel Template',
            description: 'OpenTelemetry template',
            input: 'otelcol',
            type: 'logs',
            template_path: 'input.yml.hbs',
            // dynamic_signal_types not defined
            vars: [],
          },
        ],
      } as unknown as PackageInfo;

      render(mockOtelInputStream, mockOtelPolicyInputStream, packageInfoWithoutDynamicTypes);

      // Click to show advanced options
      const advancedButton = renderResult.getByText('Advanced options');
      fireEvent.click(advancedButton);

      await waitFor(() => {
        // Data Stream Type selector SHOULD be visible (backward compatibility)
        expect(renderResult.getByText('Data Stream Type')).toBeInTheDocument();
        expect(renderResult.getByTestId('packagePolicyDataStreamType')).toBeInTheDocument();
      });
    });

    it('should not affect non-otelcol input types', async () => {
      const regularPackageInfo: PackageInfo = {
        ...mockPackageInfo,
        type: 'input',
        policy_templates: [
          {
            name: 'regular_template',
            title: 'Regular Template',
            description: 'Regular template',
            input: 'httpjson',
            type: 'logs',
            template_path: 'input.yml.hbs',
            vars: [],
          },
        ],
      } as unknown as PackageInfo;

      const regularInputStream: RegistryStreamWithDataStream = {
        ...mockOtelInputStream,
        input: 'httpjson',
      };

      render(regularInputStream, mockOtelPolicyInputStream, regularPackageInfo);

      // Click to show advanced options
      const advancedButton = renderResult.getByText('Advanced options');
      fireEvent.click(advancedButton);

      await waitFor(() => {
        // Data Stream Type selector SHOULD be visible for non-otelcol inputs
        expect(renderResult.getByText('Data Stream Type')).toBeInTheDocument();
        expect(renderResult.getByTestId('packagePolicyDataStreamType')).toBeInTheDocument();
      });
    });

    it('should show all signal type options (logs, metrics, traces)', async () => {
      const packageInfoWithDynamicTypes: PackageInfo = {
        ...mockPackageInfo,
        type: 'input',
        policy_templates: [
          {
            name: 'otel_template',
            title: 'OTel Template',
            description: 'OpenTelemetry template',
            input: 'otelcol',
            type: 'logs',
            template_path: 'input.yml.hbs',
            dynamic_signal_types: false,
            vars: [],
          },
        ],
      } as unknown as PackageInfo;

      render(mockOtelInputStream, mockOtelPolicyInputStream, packageInfoWithDynamicTypes);

      // Click to show advanced options
      const advancedButton = renderResult.getByText('Advanced options');
      fireEvent.click(advancedButton);

      await waitFor(() => {
        const radioGroup = renderResult.getByTestId('packagePolicyDataStreamType');
        expect(radioGroup).toBeInTheDocument();

        // Check that all three signal types are available
        expect(
          Array.from(radioGroup.children).find((child) => child.textContent === 'Logs')
        ).toBeInTheDocument();
        expect(
          Array.from(radioGroup.children).find((child) => child.textContent === 'Metrics')
        ).toBeInTheDocument();
        expect(
          Array.from(radioGroup.children).find((child) => child.textContent === 'Traces')
        ).toBeInTheDocument();
      });
    });

    it('should show use_apm toggle when data_stream.type is traces for non-dynamic otelcol input', async () => {
      const packageInfoNonDynamic: PackageInfo = {
        ...mockPackageInfo,
        type: 'input',
        policy_templates: [
          {
            name: 'otel_template',
            title: 'OTel Template',
            description: 'OTel',
            input: 'otelcol',
            type: 'logs',
            template_path: 'input.yml.hbs',
            dynamic_signal_types: false,
            vars: [],
          },
        ],
      } as unknown as PackageInfo;

      const tracesInputStream: NewPackagePolicyInputStream = {
        ...mockOtelPolicyInputStream,
        vars: {
          [DATA_STREAM_TYPE_VAR_NAME]: { type: 'string', value: 'traces' },
        },
      };

      render(mockOtelInputStream, tracesInputStream, packageInfoNonDynamic);

      await waitFor(() => {
        expect(renderResult.getByText('Enable Elastic APM Enrichment')).toBeInTheDocument();
      });
    });

    it('should not show use_apm toggle when data_stream.type is not traces', async () => {
      const packageInfoNonDynamic: PackageInfo = {
        ...mockPackageInfo,
        type: 'input',
        policy_templates: [
          {
            name: 'otel_template',
            title: 'OTel Template',
            description: 'OTel',
            input: 'otelcol',
            type: 'logs',
            template_path: 'input.yml.hbs',
            dynamic_signal_types: false,
            vars: [],
          },
        ],
      } as unknown as PackageInfo;

      render(mockOtelInputStream, mockOtelPolicyInputStream, packageInfoNonDynamic);

      await waitFor(() => {
        expect(renderResult.queryByText('Enable Elastic APM Enrichment')).not.toBeInTheDocument();
      });
    });
  });

  describe('Fleet-unmanaged signal types (e.g. profiles)', () => {
    // For profiles the type is fixed and the dataset has no effect; both fields are hidden
    // via FLEET_UNMANAGED_DATA_STREAM_TYPES for both OTel and non-OTel packages.
    const datasetVar = {
      name: DATASET_VAR_NAME,
      type: 'text',
      title: 'Dataset name',
      show_user: true,
    };

    const makeInputPackageInfo = (input: string, type: string): PackageInfo =>
      ({
        ...mockPackageInfo,
        type: 'input',
        policy_templates: [
          {
            name: 'profiling_template',
            title: 'Profiling Template',
            description: 'Profiling',
            input,
            type,
            template_path: 'input.yml.hbs',
            dynamic_signal_types: false,
            vars: [],
          },
        ],
      } as unknown as PackageInfo);

    const makeInputStream = (
      input: string,
      type: string,
      vars: RegistryStreamWithDataStream['vars'] = []
    ): RegistryStreamWithDataStream => ({
      input,
      title: 'Profiling',
      template_path: 'stream.yml.hbs',
      vars,
      description: 'Collect profiling data',
      data_stream: {
        title: 'Profiling Data',
        release: 'ga',
        type,
        package: 'profiling_package',
        dataset: 'profiling_package.data',
        path: 'profiling_data',
        elasticsearch: {},
        ingest_pipeline: 'default',
        streams: [],
      },
    });

    const makePolicyInputStream = (type: string): NewPackagePolicyInputStream => ({
      id: 'profiling-stream-1',
      enabled: true,
      data_stream: { type, dataset: 'profiling_package.data' },
      vars: {},
    });

    // Same behavior for OTel and non-OTel input packages: hiding keys off the signal type.
    it.each(['otelcol', 'pf-elastic-collector'])(
      'hides the Data Stream Type selector for the profiles signal (%s input)',
      async (input) => {
        render(
          makeInputStream(input, 'profiles'),
          makePolicyInputStream('profiles'),
          makeInputPackageInfo(input, 'profiles')
        );

        fireEvent.click(renderResult.getByText('Advanced options'));

        await waitFor(() => {
          expect(renderResult.queryByText('Data Stream Type')).not.toBeInTheDocument();
          expect(renderResult.queryByTestId('packagePolicyDataStreamType')).not.toBeInTheDocument();
        });
      }
    );

    it('hides the dataset field for the profiles signal', async () => {
      render(
        makeInputStream('otelcol', 'profiles', [datasetVar] as any),
        makePolicyInputStream('profiles'),
        makeInputPackageInfo('otelcol', 'profiles')
      );

      await waitFor(() => {
        expect(renderResult.queryByTestId('datasetComboBox')).not.toBeInTheDocument();
      });
    });

    it('keeps the dataset field for managed signal types (e.g. logs)', async () => {
      render(
        makeInputStream('otelcol', 'logs', [datasetVar] as any),
        makePolicyInputStream('logs'),
        makeInputPackageInfo('otelcol', 'logs')
      );

      await waitFor(() => {
        expect(renderResult.getByTestId('datasetComboBox')).toBeInTheDocument();
      });
    });
  });
});
