/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';

import type { TestRenderer } from '../../../../../../mock';
import { createFleetTestRendererMock } from '../../../../../../mock';
import {
  sendCreateAgentPolicyForRq,
  sendGetEnrollmentAPIKeys,
  sendGetOneAgentPolicy,
  useGetFleetServerHosts,
  useFleetStatus,
  useStartServices,
} from '../../../../hooks';
import { usePollingAgentCount } from '../../../../components';
import { useGetCreateApiKey } from '../../../../../../components/agent_enrollment_flyout/hooks';

import { useManagedOtlp } from './use_managed_otlp';
import { AddCollectorFlyout } from './add_collector_flyout';

jest.mock('../../../../hooks', () => ({
  ...jest.requireActual('../../../../hooks'),
  sendGetOneAgentPolicy: jest.fn(),
  sendCreateAgentPolicyForRq: jest.fn(),
  sendGetEnrollmentAPIKeys: jest.fn(),
  useGetFleetServerHosts: jest.fn(),
  useFleetStatus: jest.fn(),
  useStartServices: jest.fn(),
}));
jest.mock('../../../../components', () => ({
  AgentEnrollmentConfirmationStep: () => ({
    title: 'Confirm enrollment',
    children: <div>Confirmation</div>,
  }),
  usePollingAgentCount: jest.fn(),
}));
jest.mock('../../../../../../components/agent_enrollment_flyout/hooks', () => ({
  useGetCreateApiKey: jest.fn(),
}));
jest.mock('./use_managed_otlp', () => ({
  useManagedOtlp: jest.fn(),
}));

const mockedSendGetOneAgentPolicy = jest.mocked(sendGetOneAgentPolicy);
const mockedSendCreateAgentPolicyForRq = jest.mocked(sendCreateAgentPolicyForRq);
const mockedSendGetEnrollmentAPIKeys = jest.mocked(sendGetEnrollmentAPIKeys);
const mockedUseGetFleetServerHosts = jest.mocked(useGetFleetServerHosts);
const mockedUsePollingAgentCount = jest.mocked(usePollingAgentCount);
const mockedUseFleetStatus = jest.mocked(useFleetStatus);
const mockedUseGetCreateApiKey = jest.mocked(useGetCreateApiKey);
const mockedUseStartServices = jest.mocked(useStartServices);
const mockedUseManagedOtlp = jest.mocked(useManagedOtlp);

describe('AddCollectorFlyout', () => {
  let renderer: TestRenderer;

  const renderFlyout = () =>
    renderer.render(<AddCollectorFlyout onClose={jest.fn()} onClickViewAgents={jest.fn()} />);

  beforeEach(() => {
    renderer = createFleetTestRendererMock();
    jest.clearAllMocks();

    mockedUseGetFleetServerHosts.mockReturnValue({
      data: {
        items: [
          {
            is_default: true,
            host_urls: ['https://fleet.example:8220'],
          },
        ],
      },
      isLoading: false,
      isError: false,
      resendRequest: jest.fn(),
    } as any);

    mockedUsePollingAgentCount.mockReturnValue({
      enrolledAgentIds: [],
      total: 0,
    } as any);

    mockedUseFleetStatus.mockReturnValue({ spaceId: 'default' } as any);
    mockedUseStartServices.mockReturnValue({
      cloud: { isCloudEnabled: false },
      docLinks: { links: { fleet: { managedOtlp: 'https://example.test/motlp' } } },
    } as any);
    mockedUseGetCreateApiKey.mockReturnValue({
      apiKey: undefined,
      apiKeyEncoded: undefined,
      isLoading: false,
      onCreateApiKey: jest.fn(),
    });
    mockedUseManagedOtlp.mockReturnValue({
      available: false,
      endpoint: undefined,
      apiKeyEncoded: undefined,
      isCreatingApiKey: false,
      onCreateApiKey: jest.fn(),
    });
  });

  it('uses existing OpAMP policy and renders generated configuration', async () => {
    mockedSendGetOneAgentPolicy.mockResolvedValue({
      data: { item: { id: 'opamp' } },
    } as any);
    mockedSendGetEnrollmentAPIKeys.mockResolvedValue({
      data: { items: [{ api_key: 'existing-token' }] },
    } as any);

    const component = renderFlyout();

    await waitFor(() => {
      expect(mockedSendGetOneAgentPolicy).toHaveBeenCalledWith('opamp');
      expect(mockedSendCreateAgentPolicyForRq).not.toHaveBeenCalled();
      expect(mockedSendGetEnrollmentAPIKeys).toHaveBeenCalledWith({
        page: 1,
        perPage: 1,
        kuery: 'policy_id:"opamp"',
      });
    });

    const configYaml = component.getByTestId('opampConfigYaml').textContent;
    expect(configYaml).toContain('Authorization: "ApiKey existing-token"');
    expect(configYaml).toContain('endpoint: "https://fleet.example:8220/v1/opamp"');
  });

  it('creates OpAMP policy when missing and then fetches enrollment token', async () => {
    mockedSendGetOneAgentPolicy.mockResolvedValue({
      error: { statusCode: 404 },
    } as any);
    mockedSendCreateAgentPolicyForRq.mockResolvedValue({
      item: { id: 'opamp' },
    } as any);
    mockedSendGetEnrollmentAPIKeys.mockResolvedValue({
      data: { items: [{ api_key: 'created-token' }] },
    } as any);

    const component = renderFlyout();

    await waitFor(() => {
      expect(mockedSendCreateAgentPolicyForRq).toHaveBeenCalledWith({
        name: 'OpAMP',
        id: 'opamp',
        namespace: 'default',
        description: 'Agent policy for OpAMP collectors',
        is_managed: true,
        inactivity_timeout: 86400,
      });
    });

    const configYaml = component.getByTestId('opampConfigYaml').textContent;
    expect(configYaml).toContain('Authorization: "ApiKey created-token"');
  });

  it('uses space-prefixed policy ID when spaceId is non-default', async () => {
    mockedUseFleetStatus.mockReturnValue({ spaceId: 'my-space' } as any);

    mockedSendGetOneAgentPolicy.mockResolvedValue({
      data: { item: { id: 'my-space-opamp' } },
    } as any);
    mockedSendGetEnrollmentAPIKeys.mockResolvedValue({
      data: { items: [{ api_key: 'space-token' }] },
    } as any);

    const component = renderFlyout();

    await waitFor(() => {
      expect(mockedSendGetOneAgentPolicy).toHaveBeenCalledWith('my-space-opamp');
      expect(mockedSendGetEnrollmentAPIKeys).toHaveBeenCalledWith({
        page: 1,
        perPage: 1,
        kuery: 'policy_id:"my-space-opamp"',
      });
    });

    const configYaml = component.getByTestId('opampConfigYaml').textContent;
    expect(configYaml).toContain('Authorization: "ApiKey space-token"');
  });

  it('creates space-prefixed policy when missing in non-default space', async () => {
    mockedUseFleetStatus.mockReturnValue({ spaceId: 'my-space' } as any);

    mockedSendGetOneAgentPolicy.mockResolvedValue({
      error: { statusCode: 404 },
    } as any);
    mockedSendCreateAgentPolicyForRq.mockResolvedValue({
      item: { id: 'my-space-opamp' },
    } as any);
    mockedSendGetEnrollmentAPIKeys.mockResolvedValue({
      data: { items: [{ api_key: 'space-created-token' }] },
    } as any);

    const component = renderFlyout();

    await waitFor(() => {
      expect(mockedSendCreateAgentPolicyForRq).toHaveBeenCalledWith({
        name: 'OpAMP',
        id: 'my-space-opamp',
        namespace: 'default',
        description: 'Agent policy for OpAMP collectors',
        is_managed: true,
        inactivity_timeout: 86400,
      });
    });

    const configYaml = component.getByTestId('opampConfigYaml').textContent;
    expect(configYaml).toContain('Authorization: "ApiKey space-created-token"');
  });

  it('does not fetch OpAMP policy/token until spaceId is resolved (prevents Default-space mis-enrollment)', async () => {
    // Start with spaceId undefined (simulates the async resolution race on first render)
    mockedUseFleetStatus.mockReturnValue({ spaceId: undefined } as any);

    mockedSendGetOneAgentPolicy.mockResolvedValue({
      data: { item: { id: 'my-space-opamp' } },
    } as any);
    mockedSendGetEnrollmentAPIKeys.mockResolvedValue({
      data: { items: [{ api_key: 'space-token' }] },
    } as any);

    renderFlyout();

    // Give React a tick to flush any immediate effects
    await new Promise((r) => setTimeout(r, 50));

    // Neither the lookup nor the create should have fired while space is unknown
    expect(mockedSendGetOneAgentPolicy).not.toHaveBeenCalled();
    expect(mockedSendCreateAgentPolicyForRq).not.toHaveBeenCalled();
    expect(mockedSendGetEnrollmentAPIKeys).not.toHaveBeenCalled();
  });

  it('renders a user-facing error when policy/token setup fails', async () => {
    mockedSendGetOneAgentPolicy.mockRejectedValue(new Error('setup failed'));

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <renderer.AppWrapper>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </renderer.AppWrapper>
    );

    const component = renderer.render(
      <AddCollectorFlyout onClose={jest.fn()} onClickViewAgents={jest.fn()} />,
      { wrapper }
    );

    await waitFor(() => {
      expect(component.getByText('setup failed')).toBeInTheDocument();
    });
  });

  describe('ES API key', () => {
    beforeEach(() => {
      mockedSendGetOneAgentPolicy.mockResolvedValue({
        data: { item: { id: 'opamp' } },
      } as any);
      mockedSendGetEnrollmentAPIKeys.mockResolvedValue({
        data: { items: [{ api_key: 'test-token' }] },
      } as any);
    });

    it('shows ${API_KEY} placeholder in YAML before key is created', async () => {
      const component = renderFlyout();

      await waitFor(() => {
        const yaml = component.getByTestId('opampConfigYaml').textContent ?? '';
        expect(yaml).toContain('api_key: "${API_KEY}"');
      });
    });

    it('replaces placeholder with real key once created', async () => {
      mockedUseGetCreateApiKey.mockReturnValue({
        apiKey: undefined,
        apiKeyEncoded: 'my-real-es-api-key',
        isLoading: false,
        onCreateApiKey: jest.fn(),
      });

      const component = renderFlyout();

      await waitFor(() => {
        const yaml = component.getByTestId('opampConfigYaml').textContent ?? '';
        expect(yaml).toContain('api_key: "my-real-es-api-key"');
        expect(yaml).not.toContain('${API_KEY}');
      });
    });

    it('calls onCreateApiKey when the button is clicked', async () => {
      const onCreateApiKey = jest.fn();
      mockedUseGetCreateApiKey.mockReturnValue({
        apiKey: undefined,
        apiKeyEncoded: undefined,
        isLoading: false,
        onCreateApiKey,
      });

      const component = renderFlyout();

      await waitFor(() => component.getByTestId('opampConfigYaml'));

      fireEvent.click(component.getByText('Create API key'));
      expect(onCreateApiKey).toHaveBeenCalledTimes(1);
    });

    it('disables the Create API key button once a key exists', async () => {
      mockedUseGetCreateApiKey.mockReturnValue({
        apiKey: undefined,
        apiKeyEncoded: 'existing-key',
        isLoading: false,
        onCreateApiKey: jest.fn(),
      });

      const component = renderFlyout();

      await waitFor(() => {
        expect(component.getByText('Create API key').closest('button')).toBeDisabled();
      });
    });
  });

  describe('TLS configuration', () => {
    beforeEach(() => {
      mockedSendGetOneAgentPolicy.mockResolvedValue({ data: { item: { id: 'opamp' } } } as any);
      mockedSendGetEnrollmentAPIKeys.mockResolvedValue({
        data: { items: [{ api_key: 'test-token' }] },
      } as any);
    });

    it('includes insecure_skip_verify when not on cloud', async () => {
      mockedUseStartServices.mockReturnValue({
        cloud: { isCloudEnabled: false },
        docLinks: { links: { fleet: { managedOtlp: 'https://example.test/motlp' } } },
      } as any);

      const component = renderFlyout();

      await waitFor(() => {
        const yaml = component.getByTestId('opampConfigYaml').textContent ?? '';
        expect(yaml).toContain('insecure_skip_verify: true');
      });
    });

    it('omits insecure_skip_verify when on cloud', async () => {
      mockedUseStartServices.mockReturnValue({
        cloud: { isCloudEnabled: true },
        docLinks: { links: { fleet: { managedOtlp: 'https://example.test/motlp' } } },
      } as any);

      const component = renderFlyout();

      await waitFor(() => {
        const yaml = component.getByTestId('opampConfigYaml').textContent ?? '';
        expect(yaml).not.toContain('insecure_skip_verify');
      });
    });
  });

  describe('form auto-derivation', () => {
    beforeEach(() => {
      mockedSendGetOneAgentPolicy.mockResolvedValue({
        data: { item: { id: 'opamp' } },
      } as any);
      mockedSendGetEnrollmentAPIKeys.mockResolvedValue({
        data: { items: [{ api_key: 'test-token' }] },
      } as any);
    });

    it('auto-populates collector group and service name from group display name', async () => {
      const component = renderFlyout();

      await waitFor(() => component.getByTestId('collectorGroupDisplayNameInput'));

      fireEvent.change(component.getByTestId('collectorGroupDisplayNameInput'), {
        target: { value: 'My Collector Group 1' },
      });

      expect((component.getByTestId('collectorGroupInput') as HTMLInputElement).value).toBe(
        'my-collector-group-1'
      );
      expect((component.getByTestId('serviceNameInput') as HTMLInputElement).value).toBe(
        'my-collector-group-1'
      );
    });

    it('manual override of collector group prevents auto-derivation on subsequent display name changes', async () => {
      const component = renderFlyout();

      await waitFor(() => component.getByTestId('collectorGroupDisplayNameInput'));

      // Set initial display name
      fireEvent.change(component.getByTestId('collectorGroupDisplayNameInput'), {
        target: { value: 'First Group' },
      });

      // Manually override collector group
      fireEvent.change(component.getByTestId('collectorGroupInput'), {
        target: { value: 'my-custom-group' },
      });

      // Change display name again
      fireEvent.change(component.getByTestId('collectorGroupDisplayNameInput'), {
        target: { value: 'Second Group' },
      });

      // Collector group should remain the manually overridden value
      expect((component.getByTestId('collectorGroupInput') as HTMLInputElement).value).toBe(
        'my-custom-group'
      );
      // Service name should still auto-update (not overridden)
      expect((component.getByTestId('serviceNameInput') as HTMLInputElement).value).toBe(
        'second-group'
      );
    });

    it('manual override of service name prevents auto-derivation on subsequent display name changes', async () => {
      const component = renderFlyout();

      await waitFor(() => component.getByTestId('collectorGroupDisplayNameInput'));

      fireEvent.change(component.getByTestId('collectorGroupDisplayNameInput'), {
        target: { value: 'First Group' },
      });

      // Manually override service name
      fireEvent.change(component.getByTestId('serviceNameInput'), {
        target: { value: 'my-custom-service' },
      });

      // Change display name again
      fireEvent.change(component.getByTestId('collectorGroupDisplayNameInput'), {
        target: { value: 'Second Group' },
      });

      // Service name should remain the manually overridden value
      expect((component.getByTestId('serviceNameInput') as HTMLInputElement).value).toBe(
        'my-custom-service'
      );
      // Collector group should still auto-update
      expect((component.getByTestId('collectorGroupInput') as HTMLInputElement).value).toBe(
        'second-group'
      );
    });

    it('shows slug format error when collector group contains invalid characters', async () => {
      const component = renderFlyout();

      await waitFor(() => component.getByTestId('collectorGroupInput'));

      fireEvent.change(component.getByTestId('collectorGroupInput'), {
        target: { value: 'My Invalid Group!' },
      });
      fireEvent.blur(component.getByTestId('collectorGroupInput'));

      await waitFor(() => {
        expect(
          component.getByText(
            'Must contain only lowercase letters, numbers, and hyphens, with no leading or trailing hyphens.'
          )
        ).toBeInTheDocument();
      });
    });

    it('shows slug format error when service name contains invalid characters', async () => {
      const component = renderFlyout();

      await waitFor(() => component.getByTestId('serviceNameInput'));

      fireEvent.change(component.getByTestId('serviceNameInput'), {
        target: { value: 'My Service Name' },
      });
      fireEvent.blur(component.getByTestId('serviceNameInput'));

      await waitFor(() => {
        expect(
          component.getByText(
            'Must contain only lowercase letters, numbers, and hyphens, with no leading or trailing hyphens.'
          )
        ).toBeInTheDocument();
      });
    });

    it('hides YAML config when a slug field has an invalid value', async () => {
      const component = renderFlyout();

      await waitFor(() => component.getByTestId('opampConfigYaml'));

      fireEvent.change(component.getByTestId('collectorGroupInput'), {
        target: { value: 'invalid value with spaces' },
      });

      expect(component.queryByTestId('opampConfigYaml')).not.toBeInTheDocument();
    });

    it('shows required field validation errors after blur on empty required fields', async () => {
      const component = renderFlyout();

      await waitFor(() => component.getByTestId('collectorGroupInput'));

      // Clear a required field then blur to trigger validation
      fireEvent.change(component.getByTestId('collectorGroupInput'), { target: { value: '' } });
      fireEvent.blur(component.getByTestId('collectorGroupInput'));

      await waitFor(() => {
        expect(component.getAllByText('This field is required.').length).toBeGreaterThan(0);
      });
    });

    it('includes form field values in the generated YAML', async () => {
      const component = renderFlyout();

      await waitFor(() => component.getByTestId('opampConfigYaml'));

      fireEvent.change(component.getByTestId('collectorGroupDisplayNameInput'), {
        target: { value: 'My Group' },
      });
      fireEvent.change(component.getByTestId('collectorDisplayNameInput'), {
        target: { value: 'My Collector' },
      });
      fireEvent.change(component.getByTestId('environmentInput'), {
        target: { value: 'production' },
      });

      await waitFor(() => {
        const yaml = component.getByTestId('opampConfigYaml').textContent ?? '';
        expect(yaml).toContain('group_name: "My Group"');
        expect(yaml).toContain('group: "my-group"');
        expect(yaml).toContain('name: "my-group"');
        expect(yaml).toContain('id: "My Collector"');
        expect(yaml).toContain('name: "production"');
      });
    });

    it('omits optional fields from YAML when cleared', async () => {
      const component = renderFlyout();

      await waitFor(() => component.getByTestId('opampConfigYaml'));

      // Clear optional fields
      fireEvent.change(component.getByTestId('configDescriptionInput'), {
        target: { value: '' },
      });
      fireEvent.change(component.getByTestId('tagsInput'), { target: { value: '' } });
      fireEvent.change(component.getByTestId('environmentInput'), { target: { value: '' } });

      await waitFor(() => {
        const yaml = component.getByTestId('opampConfigYaml').textContent ?? '';
        // 'config:' only appears when configDescription is filled in
        expect(yaml).not.toContain('config:');
        expect(yaml).not.toContain('tags:');
        expect(yaml).not.toContain('deployment:');
      });
    });
  });

  describe('Managed OTLP', () => {
    beforeEach(() => {
      mockedSendGetOneAgentPolicy.mockResolvedValue({
        data: { item: { id: 'opamp' } },
      } as any);
      mockedSendGetEnrollmentAPIKeys.mockResolvedValue({
        data: { items: [{ api_key: 'test-token' }] },
      } as any);
    });

    it('uses the elasticsearch/otel exporter when MOTLP is unavailable', async () => {
      const component = renderFlyout();

      await waitFor(() => {
        const yaml = component.getByTestId('opampConfigYaml').textContent ?? '';
        expect(yaml).toContain('elasticsearch/otel:');
        expect(yaml).toContain('api_key: "${API_KEY}"');
        expect(yaml).not.toContain('otlp/managed');
      });
      expect(component.queryByTestId('addCollectorManagedOtlpDocsLink')).not.toBeInTheDocument();
    });

    it('uses the otlp/managed exporter and inlines the managed OTLP docs link when MOTLP is available', async () => {
      mockedUseManagedOtlp.mockReturnValue({
        available: true,
        endpoint: 'https://motlp.example.com:443',
        apiKeyEncoded: undefined,
        isCreatingApiKey: false,
        onCreateApiKey: jest.fn(),
      });

      const component = renderFlyout();

      await waitFor(() => {
        const yaml = component.getByTestId('opampConfigYaml').textContent ?? '';
        expect(yaml).toContain('otlp/managed:');
        expect(yaml).toContain('endpoint: "https://motlp.example.com:443"');
        expect(yaml).toContain('Authorization: "ApiKey ${API_KEY}"');
        expect(yaml).not.toContain('elasticsearch/otel');
      });
      expect(component.getByTestId('addCollectorManagedOtlpDocsLink')).toBeInTheDocument();
    });

    it('inlines the created APM API key into the Authorization header', async () => {
      mockedUseManagedOtlp.mockReturnValue({
        available: true,
        endpoint: 'https://motlp.example.com:443',
        apiKeyEncoded: 'my-apm-key',
        isCreatingApiKey: false,
        onCreateApiKey: jest.fn(),
      });

      const component = renderFlyout();

      await waitFor(() => {
        const yaml = component.getByTestId('opampConfigYaml').textContent ?? '';
        expect(yaml).toContain('Authorization: "ApiKey my-apm-key"');
        expect(yaml).not.toContain('${API_KEY}');
      });
    });

    it('routes the Create API key button to the MOTLP creator when available', async () => {
      const onCreateMotlpApiKey = jest.fn();
      mockedUseManagedOtlp.mockReturnValue({
        available: true,
        endpoint: 'https://motlp.example.com:443',
        apiKeyEncoded: undefined,
        isCreatingApiKey: false,
        onCreateApiKey: onCreateMotlpApiKey,
      });
      const onCreateEsApiKey = jest.fn();
      mockedUseGetCreateApiKey.mockReturnValue({
        apiKey: undefined,
        apiKeyEncoded: undefined,
        isLoading: false,
        onCreateApiKey: onCreateEsApiKey,
      });

      const component = renderFlyout();

      await waitFor(() => component.getByTestId('opampConfigYaml'));

      fireEvent.click(component.getByText('Create API key'));
      expect(onCreateMotlpApiKey).toHaveBeenCalledTimes(1);
      expect(onCreateEsApiKey).not.toHaveBeenCalled();
    });
  });
});
