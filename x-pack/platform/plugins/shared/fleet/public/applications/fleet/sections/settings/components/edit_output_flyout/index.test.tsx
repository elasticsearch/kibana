/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react';

import type { Output } from '../../../../types';
import { createFleetTestRendererMock } from '../../../../../../mock';
import { useFleetStatus } from '../../../../../../hooks/use_fleet_status';
import { ExperimentalFeaturesService } from '../../../../../../services';
import { useStartServices, sendPutOutput, licenseService } from '../../../../hooks';

import { EditOutputFlyout } from '.';

// mock yaml code editor
jest.mock('@kbn/code-editor', () => ({
  CodeEditor: () => <>CODE EDITOR</>,
}));

jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  EuiIconTip: () => '',
  useGeneratedHtmlId: () => 'mocked-id',
}));

jest.mock('../../../../../../hooks/use_fleet_status', () => ({
  FleetStatusProvider: (props: any) => {
    return props.children;
  },
  useFleetStatus: jest.fn(),
}));

jest.mock('../../../../hooks', () => {
  return {
    ...jest.requireActual('../../../../hooks'),
    useBreadcrumbs: jest.fn(),
    useStartServices: jest.fn(),
    sendPutOutput: jest.fn(),
  };
});

jest.mock('./confirm_update', () => ({
  confirmUpdate: () => jest.fn().mockResolvedValue(true),
}));

const mockSendPutOutput = sendPutOutput as jest.MockedFunction<typeof sendPutOutput>;
const mockUseStartServices = useStartServices as jest.Mock;

const mockedUseFleetStatus = useFleetStatus as jest.MockedFunction<typeof useFleetStatus>;

function renderFlyout(output?: Output, defaultOutput?: Output) {
  const renderer = createFleetTestRendererMock();

  const utils = renderer.render(
    <EditOutputFlyout
      proxies={[]}
      output={output}
      defaultOutput={defaultOutput}
      onClose={() => {}}
    />
  );

  return { utils };
}

const sslInputsLabels = [
  'Client SSL certificate key',
  'Client SSL certificate',
  'Server SSL certificate authorities',
];

const kafkaInputsLabels = [
  'Partitioning strategy',
  'Number of events',
  'Default topic',
  'Key',
  'Value',
  'Broker timeout',
  'Broker reachability timeout',
  'ACK Reliability',
  'Key (optional)',
];

// leave out 'Authentication', is now present in all the outputs
const kafkaSectionsLabels = ['Partitioning', 'Topics', 'Headers', 'Compression', 'Broker settings'];

const remoteEsOutputLabels = ['Hosts', 'Service token'];

describe('EditOutputFlyout', () => {
  const mockStartServices = (isServerlessEnabled?: boolean) => {
    mockUseStartServices.mockReturnValue({
      notifications: {
        toasts: {
          addError: jest.fn(),
        },
      },
      docLinks: {
        links: {
          fleet: {},
          logstash: {},
          kibana: {},
          observability: {},
        },
      },
      cloud: {
        isServerlessEnabled,
      },
    });
  };

  beforeEach(() => {
    mockStartServices(false);
    jest.clearAllMocks();
    jest.spyOn(licenseService, 'isEnterprise').mockClear();

    mockedUseFleetStatus.mockReturnValue({} as any);
  });

  it('should render the flyout if there is not output provided', async () => {
    renderFlyout();
  });

  it('should render the flyout if the output provided is a ES output', async () => {
    const { utils } = renderFlyout({
      type: 'elasticsearch',
      name: 'elasticsearch output',
      id: 'output123',
      is_default: false,
      is_default_monitoring: false,
    });

    expect(utils.queryByTestId('advancedSSLOptionsButton')).not.toBeNull();
    fireEvent.click(utils.getByTestId('advancedSSLOptionsButton'));

    await waitFor(() => {
      // Shows SSL inputs
      sslInputsLabels.forEach((label) => {
        expect(utils.queryByLabelText(label)).not.toBeNull();
      });

      // Does not show kafka inputs nor sections
      kafkaInputsLabels.forEach((label) => {
        expect(utils.queryByLabelText(label)).toBeNull();
      });

      // 'Authentication' is now present in the main flyout, it shoul
      kafkaSectionsLabels.forEach((label) => {
        expect(utils.queryByText(label)).toBeNull();
      });
    });
  });

  it('should render the flyout if the output provided is a logstash output', async () => {
    const { utils } = renderFlyout({
      type: 'logstash',
      name: 'logstash output',
      id: 'output123',
      is_default: false,
      is_default_monitoring: false,
      ssl: {
        certificate: 'ssl-cert-value',
        key: 'ssl-key-value',
      },
    });
    expect(utils.queryByTestId('advancedSSLOptionsButton')).not.toBeNull();
    fireEvent.click(utils.getByTestId('advancedSSLOptionsButton'));

    await waitFor(() => {
      // Show SSL inputs
      sslInputsLabels.forEach((label) => {
        expect(utils.queryByLabelText(label)).not.toBeNull();
      });

      // Does not show kafka inputs nor sections
      kafkaInputsLabels.forEach((label) => {
        expect(utils.queryByLabelText(label)).toBeNull();
      });

      kafkaSectionsLabels.forEach((label) => {
        expect(utils.queryByText(label)).toBeNull();
      });

      // Show the Client certificate mTLS sub-section heading
      expect(utils.queryByText('Client certificate (mTLS)')).not.toBeNull();
    });
  });

  it('should render the flyout if the output provided is a kafka output', async () => {
    const { utils } = renderFlyout({
      type: 'kafka',
      name: 'kafka output',
      id: 'output123',
      is_default: false,
      is_default_monitoring: false,
    });

    // Show kafka inputs
    kafkaInputsLabels.forEach((label) => {
      expect(utils.queryByLabelText(label)).not.toBeNull();
    });

    kafkaSectionsLabels.forEach((label) => {
      expect(utils.queryByText(label)).not.toBeNull();
    });

    // Does not show logstash inputs
    ['Client SSL certificate key', 'Client SSL certificate'].forEach((label) => {
      expect(utils.queryByLabelText(label)).toBeNull();
    });
  });

  it('should populate secret input with plain text value when editing kafka output', async () => {
    jest.spyOn(ExperimentalFeaturesService, 'get').mockReturnValue({} as any);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: true,
    } as any);

    const { utils } = renderFlyout({
      type: 'kafka',
      name: 'kafka output',
      id: 'outputK',
      is_default: false,
      is_default_monitoring: false,
      hosts: ['kafka:443'],
      topic: 'topic',
      auth_type: 'ssl',
      version: '1.0.0',
      ssl: { certificate: 'cert', key: 'key', verification_mode: 'full' },
      compression: 'none',
    });

    expect((utils.getByTestId('kafkaSslKeySecretInput') as any).value).toEqual('key');

    fireEvent.click(utils.getByText('Save and apply settings'));

    await waitFor(() => {
      expect(mockSendPutOutput).toHaveBeenCalledWith(
        'outputK',
        expect.objectContaining({
          secrets: { ssl: { key: 'key' } },
          ssl: { certificate: 'cert', key: '', verification_mode: 'full' },
        })
      );
    });
  });

  it('should populate secret password input with plain text value when editing kafka output', async () => {
    jest.spyOn(ExperimentalFeaturesService, 'get').mockReturnValue({} as any);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: true,
    } as any);

    const { utils } = renderFlyout({
      type: 'kafka',
      name: 'kafka output',
      id: 'outputK',
      is_default: false,
      is_default_monitoring: false,
      hosts: ['kafka:443'],
      topic: 'topic',
      auth_type: 'user_pass',
      version: '1.0.0',
      username: 'user',
      password: 'pass',
      compression: 'none',
    });

    expect(
      (utils.getByTestId('settingsOutputsFlyout.kafkaPasswordSecretInput') as any).value
    ).toEqual('pass');

    fireEvent.click(utils.getByText('Save and apply settings'));

    await waitFor(() => {
      expect(mockSendPutOutput).toHaveBeenCalledWith(
        'outputK',
        expect.objectContaining({
          secrets: { password: 'pass' },
        })
      );
      expect((mockSendPutOutput.mock.calls[0][1] as any).password).toBeUndefined();
    });
  });

  it('should populate secret input with plain text value when editing logstash output', async () => {
    jest.spyOn(ExperimentalFeaturesService, 'get').mockReturnValue({} as any);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: true,
    } as any);

    const { utils } = renderFlyout({
      type: 'logstash',
      name: 'logstash output',
      id: 'outputL',
      is_default: false,
      is_default_monitoring: false,
      hosts: ['logstash'],
      ssl: { certificate: 'cert', key: 'key', certificate_authorities: [] },
    });

    expect((utils.getByTestId('sslKeySecretInput') as HTMLInputElement).value).toEqual('key');

    fireEvent.click(utils.getByText('Save and apply settings'));

    await waitFor(() => {
      expect(mockSendPutOutput).toHaveBeenCalledWith(
        'outputL',
        expect.objectContaining({
          secrets: { ssl: { key: 'key' } },
          ssl: { certificate: 'cert', certificate_authorities: [] },
        })
      );
    });
  });

  it('should save a logstash output with only server CA configured (no client cert or key)', async () => {
    // Regression test for https://github.com/elastic/kibana/issues/272243
    // Server-only TLS (one-way) must be saveable without a client certificate or key.
    jest.spyOn(ExperimentalFeaturesService, 'get').mockReturnValue({} as any);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: true,
    } as any);

    const { utils } = renderFlyout({
      type: 'logstash',
      name: 'logstash output',
      id: 'outputL',
      is_default: false,
      is_default_monitoring: false,
      hosts: ['logstash:5044'],
      ssl: {
        certificate: '',
        certificate_authorities: ['/etc/ssl/ca.pem'],
      },
    });

    // Trigger a change to mark the form as modified so the Save button becomes enabled
    fireEvent.change(utils.getByDisplayValue('logstash output'), {
      target: { value: 'logstash output updated' },
    });

    fireEvent.click(utils.getByText('Save and apply settings'));

    await waitFor(() => {
      expect(mockSendPutOutput).toHaveBeenCalledWith(
        'outputL',
        expect.objectContaining({
          ssl: expect.objectContaining({
            certificate_authorities: ['/etc/ssl/ca.pem'],
          }),
        })
      );
    });
  });

  it('should block saving a logstash output when client cert is set but key is missing', async () => {
    // Regression guard: cert without key must not save — mTLS requires both fields.
    jest.spyOn(ExperimentalFeaturesService, 'get').mockReturnValue({} as any);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: false,
    } as any);

    const { utils } = renderFlyout({
      type: 'logstash',
      name: 'logstash output',
      id: 'outputL',
      is_default: false,
      is_default_monitoring: false,
      hosts: ['logstash:5044'],
      ssl: {
        certificate: 'cert',
        certificate_authorities: [],
      },
    });

    fireEvent.change(utils.getByDisplayValue('logstash output'), {
      target: { value: 'logstash output updated' },
    });

    fireEvent.click(utils.getByText('Save and apply settings'));

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockSendPutOutput).not.toHaveBeenCalled();
  });

  it('should block saving a logstash output when key is set but client cert is missing', async () => {
    jest.spyOn(ExperimentalFeaturesService, 'get').mockReturnValue({} as any);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: false,
    } as any);

    const { utils } = renderFlyout({
      type: 'logstash',
      name: 'logstash output',
      id: 'outputL',
      is_default: false,
      is_default_monitoring: false,
      hosts: ['logstash:5044'],
      ssl: {
        key: 'key',
        certificate_authorities: [],
      },
    });

    fireEvent.change(utils.getByDisplayValue('logstash output'), {
      target: { value: 'logstash output updated' },
    });

    fireEvent.click(utils.getByText('Save and apply settings'));

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockSendPutOutput).not.toHaveBeenCalled();
  });

  it('should block saving an elasticsearch output when client cert is set but key is missing', async () => {
    jest.spyOn(ExperimentalFeaturesService, 'get').mockReturnValue({} as any);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: false,
    } as any);

    const { utils } = renderFlyout({
      type: 'elasticsearch',
      name: 'elasticsearch output',
      id: 'outputES',
      is_default: false,
      is_default_monitoring: false,
      hosts: ['http://localhost:9200'],
      ssl: {
        certificate: 'cert',
        certificate_authorities: [],
      },
    });

    fireEvent.change(utils.getByDisplayValue('elasticsearch output'), {
      target: { value: 'elasticsearch output updated' },
    });

    fireEvent.click(utils.getByText('Save and apply settings'));

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockSendPutOutput).not.toHaveBeenCalled();
  });

  it('should show a callout in the flyout if the selected output is logstash and no encrypted key is set', async () => {
    mockedUseFleetStatus.mockReturnValue({
      missingOptionalFeatures: ['encrypted_saved_object_encryption_key_required'],
    } as any);
    const { utils } = renderFlyout({
      type: 'logstash',
      name: 'logstash output',
      id: 'output123',
      is_default: false,
      is_default_monitoring: false,
    });

    // Show logstash SSL inputs
    expect(utils.getByText('Additional setup required')).not.toBeNull();
  });

  it('should render the flyout if the output provided is a remote ES output and license is at least enterprise', async () => {
    jest
      .spyOn(ExperimentalFeaturesService, 'get')
      .mockReturnValue({ enableSyncIntegrationsOnRemote: true } as any);
    jest.spyOn(licenseService, 'isEnterprise').mockReturnValue(true);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: true,
    } as any);

    const { utils } = renderFlyout({
      type: 'remote_elasticsearch',
      name: 'remote es output',
      id: 'outputR',
      is_default: false,
      is_default_monitoring: false,
      kibana_url: 'http://localhost',
      sync_integrations: true,
    });

    remoteEsOutputLabels.forEach((label) => {
      expect(utils.queryByLabelText(label)).not.toBeNull();
    });
    expect(utils.queryByTestId('serviceTokenCallout')).not.toBeNull();

    expect(utils.queryByTestId('settingsOutputsFlyout.typeInput')?.textContent).toContain(
      'Remote Elasticsearch'
    );

    expect(utils.queryByTestId('serviceTokenSecretInput')).not.toBeNull();

    expect(utils.queryByTestId('remoteClusterConfigurationCallout')).not.toBeNull();
    expect(utils.queryByTestId('kibanaAPIKeyCallout')).not.toBeNull();
    expect(
      (utils.getByTestId('settingsOutputsFlyout.kibanaURLInput') as HTMLInputElement).value
    ).toEqual('http://localhost');

    expect(utils.queryByTestId('advancedSSLOptionsButton')).not.toBeNull();
    fireEvent.click(utils.getByTestId('advancedSSLOptionsButton'));

    await waitFor(() => {
      // Show SSL inputs
      sslInputsLabels.forEach((label) => {
        expect(utils.queryByLabelText(label)).not.toBeNull();
      });

      // Does not show kafka inputs nor sections
      kafkaInputsLabels.forEach((label) => {
        expect(utils.queryByLabelText(label)).toBeNull();
      });

      kafkaSectionsLabels.forEach((label) => {
        expect(utils.queryByText(label)).toBeNull();
      });
    });
  });

  it('should not render the flyout if the output is a remote ES output and the license is not at least enterprise', async () => {
    jest
      .spyOn(ExperimentalFeaturesService, 'get')
      .mockReturnValue({ enableSyncIntegrationsOnRemote: true } as any);
    jest.spyOn(licenseService, 'isEnterprise').mockReturnValue(false);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: true,
    } as any);

    const { utils } = renderFlyout({
      type: 'remote_elasticsearch',
      name: 'remote es output',
      id: 'outputR',
      is_default: false,
      is_default_monitoring: false,
      kibana_url: 'http://localhost',
      sync_integrations: true,
    });

    remoteEsOutputLabels.forEach((label) => {
      expect(utils.queryByLabelText(label)).not.toBeNull();
    });
    expect(utils.queryByTestId('serviceTokenCallout')).not.toBeNull();

    expect(utils.queryByTestId('settingsOutputsFlyout.typeInput')?.textContent).toContain(
      'Remote Elasticsearch'
    );

    expect(utils.queryByTestId('serviceTokenSecretInput')).not.toBeNull();

    expect(utils.queryByTestId('remoteClusterConfigurationCallout')).not.toBeInTheDocument();
    expect(utils.queryByTestId('kibanaAPIKeyCallout')).not.toBeInTheDocument();
  });

  it('should populate secret service token input with plain text value when editing remote ES output', async () => {
    jest
      .spyOn(ExperimentalFeaturesService, 'get')
      .mockReturnValue({ enableSyncIntegrationsOnRemote: true } as any);
    jest.spyOn(licenseService, 'isEnterprise').mockReturnValue(true);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: true,
    } as any);

    const { utils } = renderFlyout({
      type: 'remote_elasticsearch',
      name: 'remote es output',
      id: 'outputR',
      is_default: false,
      is_default_monitoring: false,
      service_token: '1234',
      hosts: ['https://localhost:9200'],
      kibana_url: 'http://localhost:5601',
      kibana_api_key: 'key',
    });

    expect((utils.getByTestId('serviceTokenSecretInput') as HTMLInputElement).value).toEqual(
      '1234'
    );

    expect(utils.queryByTestId('settingsOutputsFlyout.kibanaURLInput')).toBeNull();

    fireEvent.click(utils.getByTestId('syncIntegrationsSwitch'));
    expect(
      (utils.getByTestId('settingsOutputsFlyout.kibanaURLInput') as HTMLInputElement).value
    ).toEqual('http://localhost:5601');

    fireEvent.click(utils.getByText('Save and apply settings'));

    await waitFor(() => {
      expect(mockSendPutOutput).toHaveBeenCalledWith(
        'outputR',
        expect.objectContaining({
          sync_integrations: true,
          secrets: { service_token: '1234' },
          service_token: undefined,
          kibana_api_key: 'key',
          kibana_url: 'http://localhost:5601',
        })
      );
    });
  });
  it('should not disable hosts input for remote ES output in serverless', async () => {
    mockStartServices(true);
    jest.spyOn(licenseService, 'isEnterprise').mockReturnValue(true);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: true,
    } as any);

    const { utils } = renderFlyout({
      type: 'remote_elasticsearch',
      name: 'remote es output',
      id: 'outputR',
      is_default: false,
      is_default_monitoring: false,
      hosts: ['https://remote-host:9200'],
    });

    await waitFor(() => {
      expect(utils.queryByDisplayValue('https://remote-host:9200')).not.toBeNull();
    });

    expect(utils.getByDisplayValue('https://remote-host:9200')).not.toBeDisabled();
  });

  it('should disable hosts input for ES output in serverless', async () => {
    mockStartServices(true);

    const { utils } = renderFlyout({
      type: 'elasticsearch',
      name: 'elasticsearch output',
      id: 'output123',
      is_default: false,
      is_default_monitoring: false,
      hosts: ['https://es-host:9200'],
    });

    await waitFor(() => {
      expect(utils.queryByDisplayValue('https://es-host:9200')).not.toBeNull();
    });

    expect(utils.getByDisplayValue('https://es-host:9200')).toBeDisabled();
  });

  it('should show default host when creating new ES output in serverless', async () => {
    mockStartServices(true);

    const { utils } = renderFlyout(undefined, {
      type: 'elasticsearch',
      name: 'default output',
      id: 'default-output',
      is_default: true,
      is_default_monitoring: true,
      hosts: ['https://default-es-host:443'],
    });

    await waitFor(() => {
      expect(utils.queryByDisplayValue('https://default-es-host:443')).not.toBeNull();
    });

    expect(utils.getByDisplayValue('https://default-es-host:443')).toBeDisabled();
  });

  it('should show default ES hosts when switching from remote ES to ES in serverless', async () => {
    mockStartServices(true);
    jest.spyOn(licenseService, 'isEnterprise').mockReturnValue(true);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: true,
    } as any);

    const { utils } = renderFlyout(
      {
        type: 'remote_elasticsearch',
        name: 'remote es output',
        id: 'outputR',
        is_default: false,
        is_default_monitoring: false,
        hosts: ['https://remote-host:9200'],
      },
      {
        type: 'elasticsearch',
        name: 'default output',
        id: 'default-output',
        is_default: true,
        is_default_monitoring: true,
        hosts: ['https://default-es-host:443'],
      }
    );

    await waitFor(() => {
      expect(utils.queryByDisplayValue('https://remote-host:9200')).not.toBeNull();
    });

    // Switch type from remote ES to ES
    const typeSelect = utils.getByTestId('settingsOutputsFlyout.typeInput');
    fireEvent.change(typeSelect, { target: { value: 'elasticsearch' } });

    await waitFor(() => {
      expect(utils.queryByDisplayValue('https://default-es-host:443')).not.toBeNull();
    });
  });

  it('should show empty hosts when switching from ES to remote ES in serverless', async () => {
    mockStartServices(true);
    jest.spyOn(licenseService, 'isEnterprise').mockReturnValue(true);

    mockedUseFleetStatus.mockReturnValue({
      isLoading: false,
      isReady: true,
      isSecretsStorageEnabled: true,
    } as any);

    const { utils } = renderFlyout(
      {
        type: 'elasticsearch',
        name: 'es output',
        id: 'output1',
        is_default: false,
        is_default_monitoring: false,
        hosts: ['https://es-host:9200'],
      },
      {
        type: 'elasticsearch',
        name: 'default output',
        id: 'default-output',
        is_default: true,
        is_default_monitoring: true,
        hosts: ['https://default-es-host:443'],
      }
    );

    await waitFor(() => {
      expect(utils.queryByDisplayValue('https://es-host:9200')).not.toBeNull();
    });

    // Switch type from ES to remote ES
    const typeSelect = utils.getByTestId('settingsOutputsFlyout.typeInput');
    fireEvent.change(typeSelect, { target: { value: 'remote_elasticsearch' } });

    // The old ES host should be gone — hosts should be empty for fresh remote ES entry
    await waitFor(() => {
      expect(utils.queryByDisplayValue('https://es-host:9200')).toBeNull();
    });
  });

  describe('OpenTelemetry Exporter section', () => {
    it('should show the OTel exporter configuration section for ES output', async () => {
      const { utils } = renderFlyout({
        type: 'elasticsearch',
        name: 'elasticsearch output',
        id: 'output123',
        is_default: false,
        is_default_monitoring: false,
      });

      expect(utils.queryByText('OpenTelemetry exporter')).not.toBeNull();

      // Expand the accordion to reveal the YAML editor
      fireEvent.click(utils.getByText('OpenTelemetry exporter'));
      expect(utils.queryByLabelText('Advanced YAML configuration')).not.toBeNull();
    });

    it('should not show the OTel exporter section for logstash output', async () => {
      const { utils } = renderFlyout({
        type: 'logstash',
        name: 'logstash output',
        id: 'output123',
        is_default: false,
        is_default_monitoring: false,
      });

      expect(utils.queryByText('OpenTelemetry exporter')).toBeNull();
      expect(utils.queryByLabelText('Advanced YAML Configuration')).toBeNull();
    });

    it('should not show the OTel exporter section for kafka output', async () => {
      const { utils } = renderFlyout({
        type: 'kafka',
        name: 'kafka output',
        id: 'output123',
        is_default: false,
        is_default_monitoring: false,
      });

      expect(utils.queryByText('OpenTelemetry exporter')).toBeNull();
      expect(utils.queryByLabelText('Advanced YAML Configuration')).toBeNull();
    });

    it('should show the OTel exporter configuration section for remote ES output', async () => {
      jest.spyOn(licenseService, 'isEnterprise').mockReturnValue(true);
      jest
        .spyOn(ExperimentalFeaturesService, 'get')
        .mockReturnValue({ enableSyncIntegrationsOnRemote: true } as any);

      const { utils } = renderFlyout({
        type: 'remote_elasticsearch',
        name: 'remote es output',
        id: 'outputR',
        is_default: false,
        is_default_monitoring: false,
      });

      expect(utils.queryByText('OpenTelemetry exporter')).not.toBeNull();

      fireEvent.click(utils.getByText('OpenTelemetry exporter'));
      expect(utils.queryByLabelText('Advanced YAML configuration')).not.toBeNull();
    });

    it('should include otel_exporter_config_yaml in the save payload when creating an ES output', async () => {
      jest.spyOn(ExperimentalFeaturesService, 'get').mockReturnValue({} as any);
      mockedUseFleetStatus.mockReturnValue({
        isLoading: false,
        isReady: true,
        isSecretsStorageEnabled: true,
      } as any);

      const { utils } = renderFlyout({
        type: 'elasticsearch',
        name: 'elasticsearch output',
        id: 'output123',
        is_default: false,
        is_default_monitoring: false,
        hosts: ['http://localhost:9200'],
        otel_exporter_config_yaml: 'flush_interval: 10s',
      });

      // Change a field so the Save button becomes enabled
      fireEvent.change(utils.getByDisplayValue('elasticsearch output'), {
        target: { value: 'updated output name' },
      });

      fireEvent.click(utils.getByText('Save and apply settings'));

      await waitFor(() => {
        expect(mockSendPutOutput).toHaveBeenCalledWith(
          'output123',
          expect.objectContaining({
            otel_exporter_config_yaml: 'flush_interval: 10s',
          })
        );
      });
    });

    it('should send null otel_exporter_config_yaml when the field is empty', async () => {
      jest.spyOn(ExperimentalFeaturesService, 'get').mockReturnValue({} as any);
      mockedUseFleetStatus.mockReturnValue({
        isLoading: false,
        isReady: true,
        isSecretsStorageEnabled: true,
      } as any);

      const { utils } = renderFlyout({
        type: 'elasticsearch',
        name: 'elasticsearch output',
        id: 'output123',
        is_default: false,
        is_default_monitoring: false,
        hosts: ['http://localhost:9200'],
      });

      // Change a field so the Save button becomes enabled
      fireEvent.change(utils.getByDisplayValue('elasticsearch output'), {
        target: { value: 'updated output name' },
      });

      fireEvent.click(utils.getByText('Save and apply settings'));

      await waitFor(() => {
        expect(mockSendPutOutput).toHaveBeenCalledWith(
          'output123',
          expect.objectContaining({
            otel_exporter_config_yaml: null,
          })
        );
      });
    });

    it.each([
      {
        type: 'elasticsearch' as const,
        outputId: 'outputE',
        outputName: 'elasticsearch output',
        extra: { hosts: ['http://localhost:9200'] },
      },
      {
        type: 'remote_elasticsearch' as const,
        outputId: 'outputR',
        outputName: 'remote es output',
        extra: { hosts: ['https://remote-es:9200'], service_token: 'remote-token' },
      },
    ])(
      'should block saving a $type output when otel_exporter_config_yaml is invalid YAML',
      async ({ type, outputId, outputName, extra }) => {
        jest.spyOn(licenseService, 'isEnterprise').mockReturnValue(true);
        jest
          .spyOn(ExperimentalFeaturesService, 'get')
          .mockReturnValue({ enableSyncIntegrationsOnRemote: true } as any);
        mockedUseFleetStatus.mockReturnValue({
          isLoading: false,
          isReady: true,
          isSecretsStorageEnabled: true,
        } as any);

        const { utils } = renderFlyout({
          type,
          name: outputName,
          id: outputId,
          is_default: false,
          is_default_monitoring: false,
          // Invalid YAML — unbalanced brackets cause the parser to throw
          otel_exporter_config_yaml: 'foo: [bar',
          ...extra,
        } as Output);

        // The yaml parser used by validators is loaded asynchronously via
        // useYaml — wait until it has been picked up so that
        // createValidateYamlConfig is wired to the real parser before save.
        await waitFor(() => {
          expect(utils.queryByText('OpenTelemetry exporter')).not.toBeNull();
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        fireEvent.change(utils.getByDisplayValue(outputName), {
          target: { value: `${outputName} updated` },
        });

        fireEvent.click(utils.getByText('Save and apply settings'));

        // Submit must NOT be called because invalid OTel exporter YAML must
        // block save for both ES and remote ES outputs.
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(mockSendPutOutput).not.toHaveBeenCalled();
      }
    );

    it('should include otel_exporter_config_yaml in the save payload when editing a remote ES output', async () => {
      jest.spyOn(licenseService, 'isEnterprise').mockReturnValue(true);
      jest
        .spyOn(ExperimentalFeaturesService, 'get')
        .mockReturnValue({ enableSyncIntegrationsOnRemote: true } as any);
      mockedUseFleetStatus.mockReturnValue({
        isLoading: false,
        isReady: true,
        isSecretsStorageEnabled: true,
      } as any);

      const { utils } = renderFlyout({
        type: 'remote_elasticsearch',
        name: 'remote es output',
        id: 'outputR',
        is_default: false,
        is_default_monitoring: false,
        hosts: ['https://remote-es:9200'],
        service_token: 'remote-token',
        otel_exporter_config_yaml: 'flush_interval: 10s',
      });

      // Change a field so the Save button becomes enabled
      fireEvent.change(utils.getByDisplayValue('remote es output'), {
        target: { value: 'updated remote output name' },
      });

      fireEvent.click(utils.getByText('Save and apply settings'));

      await waitFor(() => {
        expect(mockSendPutOutput).toHaveBeenCalledWith(
          'outputR',
          expect.objectContaining({
            otel_exporter_config_yaml: 'flush_interval: 10s',
          })
        );
      });
    });
  });
});
