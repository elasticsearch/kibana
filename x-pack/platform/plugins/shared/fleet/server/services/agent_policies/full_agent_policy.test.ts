/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import omit from 'lodash/omit';

import type { AgentPolicy, Output, DownloadSource, PackageInfo } from '../../types';
import {
  ECH_AGENTLESS_MANAGED_BULK_OUTPUT_ID,
  SERVERLESS_AGENTLESS_MANAGED_BULK_OUTPUT_ID,
} from '../../../common/constants';
import {
  createAppContextStartContractMock,
  createMessageSigningServiceMock,
  createSavedObjectClientMock,
} from '../../mocks';

import { agentPolicyService } from '../agent_policy';
import { agentPolicyUpdateEventHandler } from '../agent_policy_update';
import { appContextService } from '../app_context';
import { getPackageInfo } from '../epm/packages';
import { getFleetServerHostsForAgentPolicy } from '../fleet_server_host';

import {
  generateFleetConfig,
  getBinarySourceSettings,
  getFullAgentPolicy,
  getFullMonitoringSettings,
  transformOutputToFullPolicyOutput,
  generateFleetServerOutputSSLConfig,
} from './full_agent_policy';
import { getMonitoringPermissions } from './monitoring_permissions';
import { generateOtelcolConfig } from './otel_collector';
import { fetchRelatedSavedObjects } from './related_saved_objects';

jest.mock('../epm/packages');
jest.mock('../fleet_server_host');
jest.mock('./otel_collector');
jest.mock('./related_saved_objects');

const mockedGetElasticAgentMonitoringPermissions = getMonitoringPermissions as jest.Mock<
  ReturnType<typeof getMonitoringPermissions>
>;
const mockedAgentPolicyService = agentPolicyService as jest.Mocked<typeof agentPolicyService>;
const mockedGenerateOtelcolConfig = generateOtelcolConfig as jest.Mock<
  ReturnType<typeof generateOtelcolConfig>
>;
const mockedFetchRelatedSavedObjects = fetchRelatedSavedObjects as jest.Mock<
  ReturnType<typeof fetchRelatedSavedObjects>
>;

const soClientMock = createSavedObjectClientMock();
const mockedGetPackageInfo = getPackageInfo as jest.Mock<ReturnType<typeof getPackageInfo>>;
const mockedGetFleetServerHostsForAgentPolicy = getFleetServerHostsForAgentPolicy as jest.Mock<
  ReturnType<typeof getFleetServerHostsForAgentPolicy>
>;

function mockAgentPolicy(data: Partial<AgentPolicy>) {
  mockedAgentPolicyService.get.mockResolvedValue({
    id: 'agent-policy',
    status: 'active',
    package_policies: [],
    is_managed: false,
    namespace: 'default',
    revision: 1,
    name: 'Policy',
    updated_at: '2020-01-01',
    updated_by: 'qwerty',
    is_protected: false,
    ...data,
  });
}

jest.mock('../agent_policy');

jest.mock('../output', () => {
  const OUTPUTS: { [k: string]: Output } = {
    'data-output-id': {
      id: 'data-output-id',
      is_default: false,
      is_default_monitoring: false,
      name: 'Data output',
      // @ts-ignore
      type: 'elasticsearch',
      hosts: ['http://es-data.co:9201'],
    },
    'monitoring-output-id': {
      id: 'monitoring-output-id',
      is_default: false,
      is_default_monitoring: false,
      name: 'Monitoring output',
      // @ts-ignore
      type: 'elasticsearch',
      hosts: ['http://es-monitoring.co:9201'],
    },
    'test-id': {
      id: 'test-id',
      is_default: true,
      is_default_monitoring: true,
      name: 'default',
      // @ts-ignore
      type: 'elasticsearch',
      hosts: ['http://127.0.0.1:9201'],
    },
    'test-remote-id': {
      id: 'test-remote-id',
      is_default: true,
      is_default_monitoring: true,
      name: 'default',
      // @ts-ignore
      type: 'remote_elasticsearch',
      hosts: ['http://127.0.0.1:9201'],
    },
    'test-streams-id': {
      id: 'test-streams-id',
      is_default: false,
      is_default_monitoring: false,
      name: 'streams output',
      // @ts-ignore
      type: 'elasticsearch',
      hosts: ['http://127.0.0.1:9201'],
      write_to_logs_streams: true,
    },
    'es-managed-bulk-agentless-output': {
      id: 'es-managed-bulk-agentless-output',
      is_default: false,
      is_default_monitoring: false,
      name: 'Bulk output for managed integrations',
      // @ts-ignore
      type: 'elasticsearch',
      hosts: ['https://managed-otlp.example.invalid:443/_es'],
      is_internal: true,
      is_preconfigured: true,
    },
    'es-managed-bulk-agentless-output-internal': {
      id: 'es-managed-bulk-agentless-output-internal',
      is_default: false,
      is_default_monitoring: false,
      name: 'Bulk output for managed integrations (serverless)',
      // @ts-ignore
      type: 'elasticsearch',
      hosts: ['https://managed-otlp-internal.example.invalid:443/_es'],
      is_internal: true,
      is_preconfigured: true,
    },
  };
  return {
    outputService: {
      getDefaultDataOutputId: async () => 'test-id',
      getDefaultMonitoringOutputId: async () => 'test-id',
      get: (soClient: any, id: string): Output => OUTPUTS[id] || OUTPUTS['test-id'],
      bulkGet: async (ids: string[]): Promise<Output[]> => {
        return ids.map((id) => OUTPUTS[id] || OUTPUTS['test-id']);
      },
    },
  };
});

jest.mock('../agent_policy_update');
jest.mock('../agents');
jest.mock('../package_policy');

jest.mock('./monitoring_permissions');
jest.mock('./otel_collector');
jest.mock('./related_saved_objects');

jest.mock('../download_source', () => {
  return {
    downloadSourceService: {
      getDefaultDownloadSourceId: async () => 'default-download-source-id',
      get: async (id: string): Promise<DownloadSource> => {
        if (id === 'test-ds-1') {
          return {
            id: 'test-ds-1',
            is_default: false,
            name: 'Test',
            host: 'http://custom-registry-test',
            ssl: {
              certificate: 'cert',
              certificate_authorities: ['ca'],
              key: 'KEY1',
            },
          };
        } else if (id === 'test-ds-secrets') {
          return {
            id: 'test-ds-1',
            is_default: false,
            name: 'Test',
            host: 'http://custom-registry-test',
            secrets: {
              ssl: {
                key: 'KEY1',
              },
            },
          };
        }
        return {
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        };
      },
    },
  };
});

function getAgentPolicyUpdateMock() {
  return agentPolicyUpdateEventHandler as unknown as jest.Mock<
    typeof agentPolicyUpdateEventHandler
  >;
}

describe('getFullAgentPolicy', () => {
  beforeEach(() => {
    appContextService.start(createAppContextStartContractMock());
    jest.spyOn(appContextService, 'getMessageSigningService').mockReturnValue(undefined);
    jest.spyOn(appContextService, 'getExperimentalFeatures').mockReturnValue({
      enableOtelIntegrations: true,
      enableAgentPolicyMultipleDownloadSources: true,
    } as any);

    mockedGetFleetServerHostsForAgentPolicy.mockResolvedValue({
      name: 'default Fleet Server',
      id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
      is_default: true,
      host_urls: ['http://fleetserver:8220'],
      is_preconfigured: false,
    });

    mockedGenerateOtelcolConfig.mockReturnValue({});

    getAgentPolicyUpdateMock().mockClear();
    mockedAgentPolicyService.get.mockReset();
    mockedGetElasticAgentMonitoringPermissions.mockReset();
    mockedGenerateOtelcolConfig.mockReset();
    mockedFetchRelatedSavedObjects.mockReset();
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [
        {
          id: 'test-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      ],
      proxies: [],
      dataOutput: {
        id: 'test-id',
        is_default: true,
        is_default_monitoring: true,
        name: 'default',
        type: 'elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
      },
      monitoringOutput: {
        id: 'test-id',
        is_default: true,
        is_default_monitoring: true,
        name: 'default',
        type: 'elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
      },
      downloadSources: [
        {
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: {
        name: 'default Fleet Server',
        id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
        is_default: true,
        host_urls: ['http://fleetserver:8220'],
        is_preconfigured: false,
      },
    });
    mockedGetElasticAgentMonitoringPermissions.mockImplementation(
      async (soClient, { logs, metrics }, namespace) => {
        const names: string[] = [];
        if (logs) {
          names.push(`logs-${namespace}`);
        }
        if (metrics) {
          names.push(`metrics-${namespace}`);
        }

        return {
          _elastic_agent_monitoring: {
            indices: [
              {
                names,
                privileges: [],
              },
            ],
          },
        };
      }
    );
    soClientMock.find.mockResolvedValue({
      saved_objects: [
        {
          id: 'default-download-source-id',
          is_default: true,
          attributes: {
            download_source_id: 'test-source-id',
          },
        },
        {
          id: 'test-ds-1',
          attributes: {
            download_source_id: 'test-ds-1',
          },
        },
      ],
    } as any);
  });

  it('should return a policy without monitoring if monitoring is not enabled', async () => {
    mockAgentPolicy({
      revision: 1,
    });
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchObject({
      id: 'agent-policy',
      outputs: {
        default: {
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      },
      inputs: [],
      revision: 1,
      fleet: {
        hosts: ['http://fleetserver:8220'],
      },
      agent: {
        monitoring: {
          enabled: false,
          logs: false,
          metrics: false,
          traces: false,
        },
      },
    });
  });

  it('should return a policy with monitoring if monitoring is enabled for logs', async () => {
    mockAgentPolicy({
      namespace: 'default',
      revision: 1,
      monitoring_enabled: ['logs'],
    });
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchObject({
      id: 'agent-policy',
      outputs: {
        default: {
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      },
      inputs: [],
      revision: 1,
      fleet: {
        hosts: ['http://fleetserver:8220'],
      },
      agent: {
        download: {
          sourceURI: 'http://default-registry.co',
        },
        monitoring: {
          namespace: 'default',
          use_output: 'default',
          enabled: true,
          logs: true,
          metrics: false,
          traces: false,
        },
      },
    });
  });

  it('should return a policy with monitoring if monitoring is enabled for metrics', async () => {
    mockAgentPolicy({
      namespace: 'default',
      revision: 1,
      monitoring_enabled: ['metrics'],
    });
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchObject({
      id: 'agent-policy',
      outputs: {
        default: {
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      },
      inputs: [],
      revision: 1,
      fleet: {
        hosts: ['http://fleetserver:8220'],
      },
      agent: {
        download: {
          sourceURI: 'http://default-registry.co',
        },
        monitoring: {
          namespace: 'default',
          use_output: 'default',
          enabled: true,
          logs: false,
          metrics: true,
          traces: false,
        },
      },
    });
  });

  it('should return a policy with monitoring if monitoring is enabled for traces', async () => {
    mockAgentPolicy({
      namespace: 'default',
      revision: 1,
      monitoring_enabled: ['traces'],
    });
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchObject({
      id: 'agent-policy',
      outputs: {
        default: {
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      },
      inputs: [],
      revision: 1,
      fleet: {
        hosts: ['http://fleetserver:8220'],
      },
      agent: {
        download: {
          sourceURI: 'http://default-registry.co',
        },
        monitoring: {
          namespace: 'default',
          use_output: 'default',
          enabled: true,
          logs: false,
          metrics: false,
          traces: true,
        },
      },
    });
  });

  it('should return a policy with monitoring enabled but no logs/metrics/traces if keep_monitoring_alive is true', async () => {
    mockAgentPolicy({
      keep_monitoring_alive: true,
    });

    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy?.agent?.monitoring).toEqual({
      enabled: true,
      logs: false,
      metrics: false,
      traces: false,
    });
  });

  it('should get the permissions for monitoring', async () => {
    mockAgentPolicy({
      namespace: 'testnamespace',
      revision: 1,
      monitoring_enabled: ['metrics'],
    });
    await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(mockedGetElasticAgentMonitoringPermissions).toHaveBeenCalledWith(
      expect.anything(),
      {
        logs: false,
        metrics: true,
        traces: false,
      },
      'testnamespace'
    );
  });

  it('should support a different monitoring output', async () => {
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [
        {
          id: 'test-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
        {
          id: 'monitoring-output-id',
          is_default: false,
          is_default_monitoring: false,
          name: 'Monitoring output',
          type: 'elasticsearch',
          hosts: ['http://es-monitoring.co:9201'],
        },
      ],
      proxies: [],
      dataOutput: {
        id: 'test-id',
        is_default: true,
        is_default_monitoring: true,
        name: 'default',
        type: 'elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
      },
      monitoringOutput: {
        id: 'monitoring-output-id',
        is_default: false,
        is_default_monitoring: false,
        name: 'Monitoring output',
        type: 'elasticsearch',
        hosts: ['http://es-monitoring.co:9201'],
      },
      downloadSources: [
        {
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: {
        name: 'default Fleet Server',
        id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
        is_default: true,
        host_urls: ['http://fleetserver:8220'],
        is_preconfigured: false,
      },
    });
    mockAgentPolicy({
      namespace: 'default',
      revision: 1,
      monitoring_enabled: ['metrics'],
      monitoring_output_id: 'monitoring-output-id',
    });
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchSnapshot();
  });

  it('should support a different data output', async () => {
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [
        {
          id: 'data-output-id',
          is_default: false,
          is_default_monitoring: false,
          name: 'Data output',
          type: 'elasticsearch',
          hosts: ['http://es-data.co:9201'],
        },
      ],
      proxies: [],
      dataOutput: {
        id: 'data-output-id',
        is_default: false,
        is_default_monitoring: false,
        name: 'Data output',
        type: 'elasticsearch',
        hosts: ['http://es-data.co:9201'],
      },
      monitoringOutput: {
        id: 'data-output-id',
        is_default: false,
        is_default_monitoring: false,
        name: 'Data output',
        type: 'elasticsearch',
        hosts: ['http://es-data.co:9201'],
      },
      downloadSources: [
        {
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: {
        name: 'default Fleet Server',
        id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
        is_default: true,
        host_urls: ['http://fleetserver:8220'],
        is_preconfigured: false,
      },
    });
    mockAgentPolicy({
      namespace: 'default',
      revision: 1,
      monitoring_enabled: ['metrics'],
      data_output_id: 'data-output-id',
    });
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchSnapshot();
  });

  it('should support both different outputs for data and monitoring ', async () => {
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [
        {
          id: 'data-output-id',
          is_default: false,
          is_default_monitoring: false,
          name: 'Data output',
          type: 'elasticsearch',
          hosts: ['http://es-data.co:9201'],
        },
        {
          id: 'monitoring-output-id',
          is_default: false,
          is_default_monitoring: false,
          name: 'Monitoring output',
          type: 'elasticsearch',
          hosts: ['http://es-monitoring.co:9201'],
        },
      ],
      proxies: [],
      dataOutput: {
        id: 'data-output-id',
        is_default: false,
        is_default_monitoring: false,
        name: 'Data output',
        type: 'elasticsearch',
        hosts: ['http://es-data.co:9201'],
      },
      monitoringOutput: {
        id: 'monitoring-output-id',
        is_default: false,
        is_default_monitoring: false,
        name: 'Monitoring output',
        type: 'elasticsearch',
        hosts: ['http://es-monitoring.co:9201'],
      },
      downloadSources: [
        {
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: {
        name: 'default Fleet Server',
        id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
        is_default: true,
        host_urls: ['http://fleetserver:8220'],
        is_preconfigured: false,
      },
    });
    mockAgentPolicy({
      namespace: 'default',
      revision: 1,
      monitoring_enabled: ['metrics'],
      data_output_id: 'data-output-id',
      monitoring_output_id: 'monitoring-output-id',
    });
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchSnapshot();
  });

  it('should use "default" as the default policy id', async () => {
    mockAgentPolicy({
      id: 'policy',
      status: 'active',
      package_policies: [],
      is_managed: false,
      namespace: 'default',
      revision: 1,
      data_output_id: 'test-id',
      monitoring_output_id: 'test-id',
    });

    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy?.outputs.default).toBeDefined();
  });

  it('should use output id as the default policy id when remote elasticsearch', async () => {
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [
        {
          id: 'test-remote-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'remote_elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      ],
      proxies: [],
      dataOutput: {
        id: 'test-remote-id',
        is_default: true,
        is_default_monitoring: true,
        name: 'default',
        type: 'remote_elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
      },
      monitoringOutput: {
        id: 'test-remote-id',
        is_default: true,
        is_default_monitoring: true,
        name: 'default',
        type: 'remote_elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
      },
      downloadSources: [
        {
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: {
        name: 'default Fleet Server',
        id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
        is_default: true,
        host_urls: ['http://fleetserver:8220'],
        is_preconfigured: false,
      },
    });
    mockAgentPolicy({
      id: 'policy',
      status: 'active',
      package_policies: [],
      is_managed: false,
      namespace: 'default',
      revision: 1,
      data_output_id: 'test-remote-id',
      monitoring_output_id: 'test-remote-id',
    });

    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy?.outputs['test-remote-id']).toBeDefined();
  });

  it('should return the right outputs and permissions when package policies use their own outputs', async () => {
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [
        {
          id: 'data-output-id',
          is_default: false,
          is_default_monitoring: false,
          name: 'Data output',
          type: 'elasticsearch',
          hosts: ['http://es-data.co:9201'],
        },
        {
          id: 'test-remote-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'remote_elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      ],
      proxies: [],
      dataOutput: {
        id: 'data-output-id',
        is_default: false,
        is_default_monitoring: false,
        name: 'Data output',
        type: 'elasticsearch',
        hosts: ['http://es-data.co:9201'],
      },
      monitoringOutput: {
        id: 'data-output-id',
        is_default: false,
        is_default_monitoring: false,
        name: 'Data output',
        type: 'elasticsearch',
        hosts: ['http://es-data.co:9201'],
      },
      downloadSources: [
        {
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: {
        name: 'default Fleet Server',
        id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
        is_default: true,
        host_urls: ['http://fleetserver:8220'],
        is_preconfigured: false,
      },
    });
    mockedGetPackageInfo.mockResolvedValue({
      data_streams: [
        {
          type: 'logs',
          dataset: 'elastic_agent.metricbeat',
        },
        {
          type: 'metrics',
          dataset: 'elastic_agent.metricbeat',
        },
        {
          type: 'logs',
          dataset: 'elastic_agent.filebeat',
        },
        {
          type: 'metrics',
          dataset: 'elastic_agent.filebeat',
        },
      ],
    } as PackageInfo);
    mockAgentPolicy({
      id: 'integration-output-policy',
      status: 'active',
      package_policies: [
        {
          id: 'package-policy-using-output',
          name: 'test-policy-1',
          namespace: 'policyspace',
          enabled: true,
          package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
          output_id: 'test-remote-id',
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
        {
          id: 'package-policy-no-output',
          name: 'test-policy-2',
          namespace: '',
          enabled: true,
          package: { name: 'system', version: '1.0.0', title: 'System' },
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
      ],
      is_managed: false,
      namespace: 'defaultspace',
      revision: 1,
      name: 'Policy',
      updated_at: '2020-01-01',
      updated_by: 'qwerty',
      is_protected: false,
      data_output_id: 'data-output-id',
    });

    const agentPolicy = await getFullAgentPolicy(
      createSavedObjectClientMock(),
      'integration-output-policy'
    );
    expect(agentPolicy).toMatchSnapshot();
  });

  it('should return the right outputs and permissions when package policies use their own outputs (with default output)', async () => {
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [
        {
          id: 'data-output-id',
          is_default: false,
          is_default_monitoring: false,
          name: 'Data output',
          type: 'elasticsearch',
          hosts: ['http://es-data.co:9201'],
        },
        {
          id: 'test-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      ],
      proxies: [],
      dataOutput: {
        id: 'data-output-id',
        is_default: false,
        is_default_monitoring: false,
        name: 'Data output',
        type: 'elasticsearch',
        hosts: ['http://es-data.co:9201'],
      },
      monitoringOutput: {
        id: 'data-output-id',
        is_default: false,
        is_default_monitoring: false,
        name: 'Data output',
        type: 'elasticsearch',
        hosts: ['http://es-data.co:9201'],
      },
      downloadSources: [
        {
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: {
        name: 'default Fleet Server',
        id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
        is_default: true,
        host_urls: ['http://fleetserver:8220'],
        is_preconfigured: false,
      },
    });
    mockedGetPackageInfo.mockResolvedValue({
      data_streams: [
        {
          type: 'logs',
          dataset: 'elastic_agent.metricbeat',
        },
        {
          type: 'metrics',
          dataset: 'elastic_agent.metricbeat',
        },
        {
          type: 'logs',
          dataset: 'elastic_agent.filebeat',
        },
        {
          type: 'metrics',
          dataset: 'elastic_agent.filebeat',
        },
      ],
    } as PackageInfo);
    mockAgentPolicy({
      id: 'integration-output-policy',
      status: 'active',
      package_policies: [
        {
          id: 'package-policy-using-output',
          name: 'test-policy-1',
          namespace: 'policyspace',
          enabled: true,
          package: { name: 'test_package', version: '0.0.0', title: 'Test Package' },
          output_id: 'test-id',
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
        {
          id: 'package-policy-no-output',
          name: 'test-policy-2',
          namespace: '',
          enabled: true,
          package: { name: 'system', version: '1.0.0', title: 'System' },
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
      ],
      is_managed: false,
      namespace: 'defaultspace',
      revision: 1,
      name: 'Policy',
      updated_at: '2020-01-01',
      updated_by: 'qwerty',
      is_protected: false,
      data_output_id: 'data-output-id',
    });

    const agentPolicy = await getFullAgentPolicy(
      createSavedObjectClientMock(),
      'integration-output-policy'
    );
    expect(agentPolicy).toMatchSnapshot();
  });

  it('should return agent binary sourceURI and ssl options from the agent policy', async () => {
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [
        {
          id: 'test-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      ],
      proxies: [],
      dataOutput: {
        id: 'test-id',
        is_default: true,
        is_default_monitoring: true,
        name: 'default',
        type: 'elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
      },
      monitoringOutput: {
        id: 'test-id',
        is_default: true,
        is_default_monitoring: true,
        name: 'default',
        type: 'elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
      },
      downloadSources: [
        {
          id: 'test-ds-1',
          is_default: false,
          name: 'Test',
          host: 'http://custom-registry-test',
          ssl: {
            certificate: 'cert',
            certificate_authorities: ['ca'],
            key: 'KEY1',
          },
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: {
        name: 'default Fleet Server',
        id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
        is_default: true,
        host_urls: ['http://fleetserver:8220'],
        is_preconfigured: false,
      },
    });
    mockAgentPolicy({
      namespace: 'default',
      revision: 1,
      monitoring_enabled: ['metrics'],
      download_source_id: 'test-ds-1',
    });
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchObject({
      id: 'agent-policy',
      outputs: {
        default: {
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      },
      inputs: [],
      revision: 1,
      fleet: {
        hosts: ['http://fleetserver:8220'],
      },
      agent: {
        download: {
          sourceURI: 'http://custom-registry-test',
          sources: ['http://custom-registry-test'],
          ssl: {
            certificate: 'cert',
            certificate_authorities: ['ca'],
            key: 'KEY1',
          },
        },
        monitoring: {
          namespace: 'default',
          use_output: 'default',
          enabled: true,
          logs: false,
          metrics: true,
          traces: false,
        },
      },
    });
  });

  it('should return agent binary with secrets if there are any present', async () => {
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [
        {
          id: 'test-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      ],
      proxies: [],
      dataOutput: {
        id: 'test-id',
        is_default: true,
        is_default_monitoring: true,
        name: 'default',
        type: 'elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
      },
      monitoringOutput: {
        id: 'test-id',
        is_default: true,
        is_default_monitoring: true,
        name: 'default',
        type: 'elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
      },
      downloadSources: [
        {
          id: 'test-ds-1',
          is_default: false,
          name: 'Test',
          host: 'http://custom-registry-test',
          secrets: {
            ssl: {
              key: 'KEY1',
            },
          },
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: {
        name: 'default Fleet Server',
        id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
        is_default: true,
        host_urls: ['http://fleetserver:8220'],
        is_preconfigured: false,
      },
    });
    mockAgentPolicy({
      namespace: 'default',
      revision: 1,
      monitoring_enabled: ['metrics'],
      download_source_id: 'test-ds-secrets',
    });
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchObject({
      id: 'agent-policy',
      outputs: {
        default: {
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      },
      inputs: [],
      revision: 1,
      fleet: {
        hosts: ['http://fleetserver:8220'],
      },
      agent: {
        download: {
          sourceURI: 'http://custom-registry-test',
          sources: ['http://custom-registry-test'],
          secrets: {
            ssl: {
              key: 'KEY1',
            },
          },
        },
        monitoring: {
          namespace: 'default',
          use_output: 'default',
          enabled: true,
          logs: false,
          metrics: true,
          traces: false,
        },
      },
    });
  });

  it('should add + transform agent features', async () => {
    mockAgentPolicy({
      namespace: 'default',
      revision: 1,
      monitoring_enabled: ['metrics'],
      agent_features: [
        { name: 'fqdn', enabled: true },
        { name: 'feature2', enabled: true },
      ],
    });
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchObject({
      id: 'agent-policy',
      outputs: {
        default: {
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      },
      inputs: [],
      revision: 1,
      fleet: {
        hosts: ['http://fleetserver:8220'],
      },
      agent: {
        monitoring: {
          namespace: 'default',
          use_output: 'default',
          enabled: true,
          logs: false,
          metrics: true,
          traces: false,
        },
        features: {
          fqdn: {
            enabled: true,
          },
          feature2: {
            enabled: true,
          },
        },
      },
    });
  });

  it('should populate agent.protection and signed properties if encryption is available', async () => {
    (appContextService.getMessageSigningService as jest.Mock).mockReturnValue(
      createMessageSigningServiceMock()
    );
    mockAgentPolicy({});
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy!.agent!.protection).toMatchObject({
      enabled: false,
      uninstall_token_hash: '',
      signing_key: 'thisisapublickey',
    });
    expect(agentPolicy!.signed).toMatchObject({
      data: 'eyJpZCI6ImFnZW50LXBvbGljeSIsImFnZW50Ijp7ImZlYXR1cmVzIjp7fSwicHJvdGVjdGlvbiI6eyJlbmFibGVkIjpmYWxzZSwidW5pbnN0YWxsX3Rva2VuX2hhc2giOiIiLCJzaWduaW5nX2tleSI6InRoaXNpc2FwdWJsaWNrZXkifX0sImlucHV0cyI6W119',
      signature: 'thisisasignature',
    });
  });

  it('should not populate agent.protection and signed properties for standalone policies', async () => {
    mockAgentPolicy({});
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy', {
      standalone: true,
    });

    expect(agentPolicy!.agent!.protection).toBeUndefined();
    expect(agentPolicy!.signed).toBeUndefined();
  });

  it('should compile full policy with correct namespaces', async () => {
    mockedGetPackageInfo.mockResolvedValue({
      data_streams: [
        {
          type: 'logs',
          dataset: 'elastic_agent.metricbeat',
        },
        {
          type: 'metrics',
          dataset: 'elastic_agent.metricbeat',
        },
        {
          type: 'logs',
          dataset: 'elastic_agent.filebeat',
        },
        {
          type: 'metrics',
          dataset: 'elastic_agent.filebeat',
        },
      ],
    } as PackageInfo);
    mockAgentPolicy({
      id: 'agent-policy',
      status: 'active',
      package_policies: [
        {
          id: 'package-policy-uuid-test-123',
          name: 'test-policy-1',
          namespace: 'policyspace',
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
        {
          id: 'package-policy-uuid-test-123',
          name: 'test-policy-2',
          namespace: '',
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
      ],
      is_managed: false,
      namespace: 'defaultspace',
      revision: 1,
      name: 'Policy',
      updated_at: '2020-01-01',
      updated_by: 'qwerty',
      is_protected: false,
    });

    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(omit(agentPolicy, 'signed', 'secret_references', 'agent.protection')).toEqual({
      agent: {
        download: {
          sourceURI: 'http://default-registry.co',
          sources: ['http://default-registry.co'],
        },
        features: {},
        monitoring: {
          enabled: false,
          logs: false,
          metrics: false,
          traces: false,
        },
      },
      fleet: {
        hosts: ['http://fleetserver:8220'],
      },
      id: 'agent-policy',
      inputs: [
        {
          data_stream: {
            namespace: 'policyspace',
          },
          id: 'test-logs-package-policy-uuid-test-123',
          meta: {
            package: {
              name: 'test_package',
              version: '0.0.0',
            },
          },
          name: 'test-policy-1',
          package_policy_id: 'package-policy-uuid-test-123',
          revision: 1,
          streams: [
            {
              data_stream: {
                dataset: 'some-logs',
                type: 'logs',
              },
              id: 'test-logs',
            },
          ],
          type: 'test-logs',
          use_output: 'default',
        },
        {
          data_stream: {
            namespace: 'defaultspace',
          },
          id: 'test-logs-package-policy-uuid-test-123',
          meta: {
            package: {
              name: 'test_package',
              version: '0.0.0',
            },
          },
          name: 'test-policy-2',
          package_policy_id: 'package-policy-uuid-test-123',
          revision: 1,
          streams: [
            {
              data_stream: {
                dataset: 'some-logs',
                type: 'logs',
              },
              id: 'test-logs',
            },
          ],
          type: 'test-logs',
          use_output: 'default',
        },
      ],
      output_permissions: {
        default: {
          _elastic_agent_checks: {
            cluster: ['monitor'],
          },
          _elastic_agent_monitoring: {
            indices: [
              {
                names: [],
                privileges: [],
              },
            ],
          },
          'package-policy-uuid-test-123': {
            indices: [
              {
                names: ['logs-some-logs-defaultspace'],
                privileges: ['auto_configure', 'create_doc'],
              },
            ],
          },
        },
      },
      outputs: {
        default: {
          hosts: ['http://127.0.0.1:9201'],
          preset: 'balanced',
          type: 'elasticsearch',
        },
      },
      revision: 1,
    });
  });

  it('should return a policy with logs permissions when write_to_logs_streams is enabled', async () => {
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [
        {
          id: 'test-streams-id',
          is_default: false,
          is_default_monitoring: false,
          name: 'streams output',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
          write_to_logs_streams: true,
        },
      ],
      proxies: [],
      dataOutput: {
        id: 'test-streams-id',
        is_default: false,
        is_default_monitoring: false,
        name: 'streams output',
        type: 'elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
        write_to_logs_streams: true,
      },
      monitoringOutput: {
        id: 'test-streams-id',
        is_default: false,
        is_default_monitoring: false,
        name: 'streams output',
        type: 'elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
        write_to_logs_streams: true,
      },
      downloadSources: [
        {
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: {
        name: 'default Fleet Server',
        id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
        is_default: true,
        host_urls: ['http://fleetserver:8220'],
        is_preconfigured: false,
      },
    });
    mockedGetPackageInfo.mockResolvedValue({
      data_streams: [
        {
          type: 'logs',
          dataset: 'somelogs.log',
        },
      ],
    } as PackageInfo);
    mockAgentPolicy({
      data_output_id: 'test-streams-id',
      package_policies: [
        {
          name: 'test-policy',
          namespace: 'defaultspace',
          id: 'package-policy-uuid-test-123',
          enabled: true,
          policy_ids: ['agent-policy'],
          package: {
            name: 'somelogs',
            title: 'Some logs',
            version: '0.0.1',
          },
          inputs: [
            {
              type: 'logfile',
              enabled: true,
              streams: [
                {
                  id: 'logfile-somelogs.log',
                  enabled: true,
                  data_stream: {
                    dataset: 'somelogs.log',
                    type: 'logs',
                  },
                },
              ],
            },
          ],
          revision: 1,
          created_at: '2020-01-01',
          created_by: '',
          updated_at: '2020-01-01',
          updated_by: '',
        },
      ],
    });

    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchObject({
      output_permissions: {
        'test-streams-id': {
          _elastic_agent_checks: {
            cluster: ['monitor'],
          },
          'package-policy-uuid-test-123': {
            indices: [
              {
                names: ['logs-somelogs.log-defaultspace'],
                privileges: ['auto_configure', 'create_doc'],
              },
            ],
          },
          _write_to_logs_streams: {
            indices: [
              {
                names: ['logs', 'logs.*'],
                privileges: ['auto_configure', 'create_doc'],
              },
            ],
          },
        },
      },
    });
  });

  it('should emit only the apm applications block for the ECH managed bulk output', async () => {
    jest.spyOn(appContextService, 'getCloud').mockReturnValue({
      managedOtlp: { url: 'https://managed-otlp.example.invalid' },
    } as any);
    jest.spyOn(appContextService, 'getConfig').mockReturnValue({
      agents: { enabled: true, elasticsearch: {} },
      enabled: true,
      agentless: { managedBulk: { enabled: true } },
    } as any);

    const bulkOutput = {
      id: ECH_AGENTLESS_MANAGED_BULK_OUTPUT_ID,
      is_default: false,
      is_default_monitoring: false,
      name: 'Bulk output for managed integrations',
      type: 'elasticsearch' as const,
      hosts: ['https://managed-otlp.example.invalid:443/_es'],
    };
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [bulkOutput],
      proxies: [],
      dataOutput: bulkOutput,
      monitoringOutput: bulkOutput,
      downloadSources: [
        {
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: {
        name: 'default Fleet Server',
        id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
        is_default: true,
        host_urls: ['http://fleetserver:8220'],
        is_preconfigured: false,
      },
    });
    mockAgentPolicy({
      supports_agentless: true,
      data_output_id: ECH_AGENTLESS_MANAGED_BULK_OUTPUT_ID,
    });

    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy?.output_permissions).toEqual({
      [ECH_AGENTLESS_MANAGED_BULK_OUTPUT_ID]: {
        _managed_bulk_apm: {
          applications: [{ application: 'apm', privileges: ['event:write'], resources: ['*'] }],
        },
      },
    });
    expect(
      agentPolicy?.output_permissions?.[ECH_AGENTLESS_MANAGED_BULK_OUTPUT_ID]?._managed_bulk_apm
    ).not.toHaveProperty('indices');
  });

  it('should emit only the apm applications block for the serverless managed bulk output, matched via the config-injected endpoint', async () => {
    jest.spyOn(appContextService, 'getConfig').mockReturnValue({
      agents: { enabled: true, elasticsearch: {} },
      enabled: true,
      outputs: [
        {
          id: SERVERLESS_AGENTLESS_MANAGED_BULK_OUTPUT_ID,
          name: 'Bulk output for managed integrations (serverless)',
          type: 'elasticsearch' as const,
          hosts: ['https://managed-otlp-internal.example.invalid:443/_es'],
          is_default: false,
          is_default_monitoring: false,
          is_preconfigured: true,
        },
      ],
    } as any);

    const bulkOutput = {
      id: SERVERLESS_AGENTLESS_MANAGED_BULK_OUTPUT_ID,
      is_default: false,
      is_default_monitoring: false,
      name: 'Bulk output for managed integrations (serverless)',
      type: 'elasticsearch' as const,
      hosts: ['https://managed-otlp-internal.example.invalid:443/_es'],
    };
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [bulkOutput],
      proxies: [],
      dataOutput: bulkOutput,
      monitoringOutput: bulkOutput,
      downloadSources: [
        {
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: {
        name: 'default Fleet Server',
        id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
        is_default: true,
        host_urls: ['http://fleetserver:8220'],
        is_preconfigured: false,
      },
    });
    mockAgentPolicy({
      supports_agentless: true,
      data_output_id: SERVERLESS_AGENTLESS_MANAGED_BULK_OUTPUT_ID,
    });

    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy?.output_permissions).toEqual({
      [SERVERLESS_AGENTLESS_MANAGED_BULK_OUTPUT_ID]: {
        _managed_bulk_apm: {
          applications: [{ application: 'apm', privileges: ['event:write'], resources: ['*'] }],
        },
      },
    });
    expect(
      agentPolicy?.output_permissions?.[SERVERLESS_AGENTLESS_MANAGED_BULK_OUTPUT_ID]
        ?._managed_bulk_apm
    ).not.toHaveProperty('indices');
  });

  it('should return a policy with advanced settings', async () => {
    mockAgentPolicy({
      advanced_settings: {
        agent_limits_go_max_procs: 2,
        agent_logging_level: 'debug',
        agent_logging_to_files: true,
        agent_logging_files_rotateeverybytes: 10000,
        agent_logging_files_keepfiles: 10,
        agent_logging_files_interval: '7h',
      },
    });
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchObject({
      id: 'agent-policy',
      agent: {
        limits: { go_max_procs: 2 },
        logging: {
          level: 'debug',
          to_files: true,
          files: { rotateeverybytes: 10000, keepfiles: 10, interval: '7h' },
        },
      },
    });
  });

  it('should set agent.features.include_tags_in_events.enabled from advanced_settings', async () => {
    mockAgentPolicy({
      advanced_settings: {
        agent_features_include_tags_in_events_enabled: true,
      },
    });
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

    expect(agentPolicy).toMatchObject({
      agent: {
        features: {
          include_tags_in_events: {
            enabled: true,
          },
        },
      },
    });
  });

  it('should have ssl options in outputs when fleet server host has es ssl options', async () => {
    const fleetServerHostWithSSL = {
      name: 'default Fleet Server',
      id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
      is_default: true,
      host_urls: ['http://fleetserver:8220'],
      is_preconfigured: false,
      ssl: {
        certificate_authorities: ['/tmp/ssl/ca.crt'],
        certificate: 'my-cert',
        key: 'my-key',
        es_certificate_authorities: ['/tmp/ssl/es-ca.crt'],
        es_certificate: 'my-es-cert',
        es_key: 'my-es-key',
      },
    };
    mockedGetFleetServerHostsForAgentPolicy.mockResolvedValue(fleetServerHostWithSSL);
    mockedFetchRelatedSavedObjects.mockResolvedValue({
      outputs: [
        {
          id: 'test-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
      ],
      proxies: [],
      dataOutput: {
        id: 'test-id',
        is_default: true,
        is_default_monitoring: true,
        name: 'default',
        type: 'elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
      },
      monitoringOutput: {
        id: 'test-id',
        is_default: true,
        is_default_monitoring: true,
        name: 'default',
        type: 'elasticsearch',
        hosts: ['http://127.0.0.1:9201'],
      },
      downloadSources: [
        {
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        },
      ],
      downloadSourceProxy: undefined,
      fleetServerHost: fleetServerHostWithSSL,
    });

    mockAgentPolicy({});
    const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');
    expect(agentPolicy?.outputs).toMatchObject({
      default: {
        hosts: ['http://127.0.0.1:9201'],
        preset: 'balanced',
        type: 'elasticsearch',
      },
      'fleetserver-output-93f74c0-e876-11ea-b7d3-8b2acec6f75c': {
        ssl: {
          certificate: 'my-es-cert',
          certificate_authorities: ['/tmp/ssl/es-ca.crt'],
          key: 'my-es-key',
        },
        type: 'elasticsearch',
      },
    });
  });

  describe('OTel config generation', () => {
    it('should call generateOtelcolConfig with packageInfoCache when enableOtelIntegrations is true', async () => {
      const packageInfo: PackageInfo = {
        name: 'otelpackage',
        version: '1.0.0',
        type: 'input',
        policy_templates: [
          {
            name: 'template1',
            title: 'OTel Template',
            input: 'otelcol',
            type: 'logs',
            template_path: 'input.yml.hbs',
            dynamic_signal_types: true,
            vars: [],
          },
        ],
      } as any;

      mockedGetPackageInfo.mockResolvedValue(packageInfo);
      mockedGenerateOtelcolConfig.mockReturnValue({
        receivers: {},
        processors: {},
        service: {
          pipelines: {},
        },
      });

      mockAgentPolicy({
        package_policies: [
          {
            id: 'package-policy-1',
            name: 'otel-policy',
            namespace: 'default',
            enabled: true,
            package: { name: 'otelpackage', version: '1.0.0', title: 'OTel Package' },
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
        ],
      });

      await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(mockedGenerateOtelcolConfig).toHaveBeenCalled();
      const callArgs = mockedGenerateOtelcolConfig.mock.calls[0][0];
      expect(callArgs).toBeDefined();
      expect(callArgs.packageInfoCache).toBeInstanceOf(Map);
      const packageInfoCache = callArgs.packageInfoCache as Map<string, PackageInfo>;
      expect(packageInfoCache.has('otelpackage-1.0.0')).toBe(true);
      expect(packageInfoCache.get('otelpackage-1.0.0')).toEqual(packageInfo);
    });

    it('should include otelcolConfig in full agent policy when generated', async () => {
      const mockOtelConfig = {
        receivers: {
          otlp: {
            protocols: {
              grpc: {
                endpoint: '0.0.0.0:4317',
              },
            },
          },
        },
        processors: {
          'transform/test-routing': {
            log_statements: [
              {
                context: 'log',
                statements: [
                  'set(attributes["data_stream.type"], "logs")',
                  'set(attributes["data_stream.dataset"], "test.dataset")',
                  'set(attributes["data_stream.namespace"], "default")',
                ],
              },
            ],
          },
        },
        service: {
          pipelines: {
            logs: {
              receivers: ['otlp'],
              processors: ['transform/test-routing'],
              exporters: ['elasticsearch'],
            },
          },
        },
      };

      mockedGenerateOtelcolConfig.mockReturnValue(mockOtelConfig);
      mockedGetPackageInfo.mockResolvedValue({
        name: 'otelpackage',
        version: '1.0.0',
        type: 'input',
        policy_templates: [],
      } as any);

      mockAgentPolicy({
        package_policies: [
          {
            id: 'package-policy-1',
            name: 'otel-policy',
            namespace: 'default',
            enabled: true,
            package: { name: 'otelpackage', version: '1.0.0', title: 'OTel Package' },
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
        ],
      });

      const agentPolicy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(agentPolicy).toMatchObject({
        receivers: mockOtelConfig.receivers,
        processors: mockOtelConfig.processors,
        service: mockOtelConfig.service,
      });
    });

    it('should not call generateOtelcolConfig when enableOtelIntegrations is false', async () => {
      jest.spyOn(appContextService, 'getExperimentalFeatures').mockReturnValue({
        enableOtelIntegrations: false,
      } as any);

      mockAgentPolicy({
        package_policies: [
          {
            id: 'package-policy-1',
            name: 'otel-policy',
            namespace: 'default',
            enabled: true,
            package: { name: 'otelpackage', version: '1.0.0', title: 'OTel Package' },
            inputs: [
              {
                type: 'otelcol',
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
        ],
      });

      await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(mockedGenerateOtelcolConfig).not.toHaveBeenCalled();
    });

    it('should pass the resolved proxy to generateOtelcolConfig when dataOutput has a proxy_id', async () => {
      const proxy = {
        id: 'proxy-1',
        name: 'my-proxy',
        url: 'http://proxy.example.com:3128',
        proxy_headers: { 'X-Custom': 'value' },
        is_preconfigured: false,
      };

      mockedFetchRelatedSavedObjects.mockResolvedValue({
        outputs: [
          {
            id: 'test-id',
            is_default: true,
            is_default_monitoring: true,
            name: 'default',
            type: 'elasticsearch',
            hosts: ['http://127.0.0.1:9201'],
            proxy_id: 'proxy-1',
          },
        ],
        proxies: [proxy],
        dataOutput: {
          id: 'test-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
          proxy_id: 'proxy-1',
        },
        monitoringOutput: {
          id: 'test-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
        downloadSources: [
          {
            id: 'default-download-source-id',
            is_default: true,
            name: 'Default host',
            host: 'http://default-registry.co',
          },
        ],
        downloadSourceProxy: undefined,
        fleetServerHost: {
          name: 'default Fleet Server',
          id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
          is_default: true,
          host_urls: ['http://fleetserver:8220'],
          is_preconfigured: false,
        },
      });

      mockAgentPolicy({ package_policies: [] });

      await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(mockedGenerateOtelcolConfig).toHaveBeenCalled();
      const callArgs = mockedGenerateOtelcolConfig.mock.calls[0][0];
      // proxy should be the resolved proxy
      expect(callArgs.proxy).toEqual(proxy);
    });

    it('should pass undefined proxy to generateOtelcolConfig when dataOutput has no proxy_id', async () => {
      mockAgentPolicy({ package_policies: [] });

      await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(mockedGenerateOtelcolConfig).toHaveBeenCalled();
      const callArgs = mockedGenerateOtelcolConfig.mock.calls[0][0];
      // proxy should be undefined when no proxy_id
      expect(callArgs.proxy).toBeUndefined();
    });

    it('should pass undefined proxy to generateOtelcolConfig when proxy_id does not match any proxy', async () => {
      mockedFetchRelatedSavedObjects.mockResolvedValue({
        outputs: [
          {
            id: 'test-id',
            is_default: true,
            is_default_monitoring: true,
            name: 'default',
            type: 'elasticsearch',
            hosts: ['http://127.0.0.1:9201'],
            proxy_id: 'nonexistent-proxy',
          },
        ],
        proxies: [],
        dataOutput: {
          id: 'test-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
          proxy_id: 'nonexistent-proxy',
        },
        monitoringOutput: {
          id: 'test-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
        downloadSources: [
          {
            id: 'default-download-source-id',
            is_default: true,
            name: 'Default host',
            host: 'http://default-registry.co',
          },
        ],
        downloadSourceProxy: undefined,
        fleetServerHost: {
          name: 'default Fleet Server',
          id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
          is_default: true,
          host_urls: ['http://fleetserver:8220'],
          is_preconfigured: false,
        },
      });

      mockAgentPolicy({ package_policies: [] });

      await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(mockedGenerateOtelcolConfig).toHaveBeenCalled();
      const callArgs = mockedGenerateOtelcolConfig.mock.calls[0][0];
      // proxy should be undefined when proxy_id doesn't match
      expect(callArgs.proxy).toBeUndefined();
    });

    it('should pass remote_elasticsearch dataOutput to generateOtelcolConfig', async () => {
      mockedFetchRelatedSavedObjects.mockResolvedValue({
        outputs: [
          {
            id: 'remote-output-id',
            is_default: true,
            is_default_monitoring: true,
            name: 'remote-output',
            type: 'remote_elasticsearch',
            hosts: ['https://remote-es.example.com:9200'],
          },
        ],
        proxies: [],
        dataOutput: {
          id: 'remote-output-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'remote-output',
          type: 'remote_elasticsearch',
          hosts: ['https://remote-es.example.com:9200'],
        },
        monitoringOutput: {
          id: 'remote-output-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'remote-output',
          type: 'remote_elasticsearch',
          hosts: ['https://remote-es.example.com:9200'],
        },
        downloadSources: [
          {
            id: 'default-download-source-id',
            is_default: true,
            name: 'Default host',
            host: 'http://default-registry.co',
          },
        ],
        downloadSourceProxy: undefined,
        fleetServerHost: {
          name: 'default Fleet Server',
          id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
          is_default: true,
          host_urls: ['http://fleetserver:8220'],
          is_preconfigured: false,
        },
      });

      mockAgentPolicy({ package_policies: [] });

      await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(mockedGenerateOtelcolConfig).toHaveBeenCalled();
      const callArgs = mockedGenerateOtelcolConfig.mock.calls[0][0];
      expect(callArgs.dataOutput).toMatchObject({
        type: 'remote_elasticsearch',
        hosts: ['https://remote-es.example.com:9200'],
      });
    });

    it('should pass packageOutputs with override entry when package policy has output_id', async () => {
      const overrideOutputId = 'override-output-id';
      mockedFetchRelatedSavedObjects.mockResolvedValue({
        outputs: [
          {
            id: 'test-id',
            is_default: true,
            is_default_monitoring: true,
            name: 'default',
            type: 'elasticsearch',
            hosts: ['http://127.0.0.1:9201'],
          },
          {
            id: overrideOutputId,
            is_default: false,
            is_default_monitoring: false,
            name: 'override',
            type: 'elasticsearch',
            hosts: ['http://override-es:9201'],
          },
        ],
        proxies: [],
        dataOutput: {
          id: 'test-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
        monitoringOutput: {
          id: 'test-id',
          is_default: true,
          is_default_monitoring: true,
          name: 'default',
          type: 'elasticsearch',
          hosts: ['http://127.0.0.1:9201'],
        },
        downloadSources: [
          {
            id: 'default-download-source-id',
            is_default: true,
            name: 'Default host',
            host: 'http://default-registry.co',
          },
        ],
        downloadSourceProxy: undefined,
        fleetServerHost: {
          name: 'default Fleet Server',
          id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
          is_default: true,
          host_urls: ['http://fleetserver:8220'],
          is_preconfigured: false,
        },
      });

      mockAgentPolicy({
        package_policies: [
          {
            id: 'pkg-policy-1',
            name: 'otel-policy',
            namespace: 'default',
            enabled: true,
            output_id: overrideOutputId,
            package: { name: 'otelpackage', version: '1.0.0', title: 'OTel Package' },
            inputs: [{ type: 'otelcol', enabled: true, streams: [] }],
            created_at: '',
            updated_at: '',
            created_by: '',
            updated_by: '',
            revision: 1,
            policy_id: '',
            policy_ids: [''],
          },
        ],
      });

      await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(mockedGenerateOtelcolConfig).toHaveBeenCalled();
      const callArgs = mockedGenerateOtelcolConfig.mock.calls[0][0];
      expect(callArgs.packageOutputs).toBeInstanceOf(Map);
      const packageOutputs = callArgs.packageOutputs as Map<string, Output>;
      expect(packageOutputs.size).toBe(1);
      expect(packageOutputs.get('pkg-policy-1')).toBeDefined();
      expect(packageOutputs.get('pkg-policy-1')!.id).toBe(overrideOutputId);
    });

    it('should pass empty packageOutputs when no package policies have output_id', async () => {
      mockAgentPolicy({
        package_policies: [
          {
            id: 'pkg-policy-1',
            name: 'otel-policy',
            namespace: 'default',
            enabled: true,
            package: { name: 'otelpackage', version: '1.0.0', title: 'OTel Package' },
            inputs: [{ type: 'otelcol', enabled: true, streams: [] }],
            created_at: '',
            updated_at: '',
            created_by: '',
            updated_by: '',
            revision: 1,
            policy_id: '',
            policy_ids: [''],
          },
        ],
      });

      await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(mockedGenerateOtelcolConfig).toHaveBeenCalled();
      const callArgs = mockedGenerateOtelcolConfig.mock.calls[0][0];
      expect(callArgs.packageOutputs).toBeInstanceOf(Map);
      expect((callArgs.packageOutputs as Map<string, Output>).size).toBe(0);
    });

    it('should omit a packageOutputs entry when the output_id references a non-existent output', async () => {
      mockAgentPolicy({
        package_policies: [
          {
            id: 'pkg-policy-1',
            name: 'otel-policy',
            namespace: 'default',
            enabled: true,
            output_id: 'nonexistent-output-id',
            package: { name: 'otelpackage', version: '1.0.0', title: 'OTel Package' },
            inputs: [{ type: 'otelcol', enabled: true, streams: [] }],
            created_at: '',
            updated_at: '',
            created_by: '',
            updated_by: '',
            revision: 1,
            policy_id: '',
            policy_ids: [''],
          },
        ],
      });

      await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(mockedGenerateOtelcolConfig).toHaveBeenCalled();
      const callArgs = mockedGenerateOtelcolConfig.mock.calls[0][0];
      expect(callArgs.packageOutputs).toBeInstanceOf(Map);
      expect((callArgs.packageOutputs as Map<string, Output>).size).toBe(0);
    });
  });

  describe('secret_references reconciliation', () => {
    const buildPolicyWithSecretRef = (id: string, compiledInputValue: string | null) => ({
      id: `pp-${id}`,
      name: `policy-${id}`,
      namespace: 'default',
      enabled: true,
      package: { name: 'test', version: '1.0.0', title: 'Test' },
      secret_references: [{ id }],
      inputs: compiledInputValue
        ? [
            {
              id: `input-${id}`,
              type: 'logfile',
              enabled: true,
              streams: [
                {
                  id: `stream-${id}`,
                  enabled: true,
                  compiled_stream: { paths: [`$co.elastic.secret{${id}}`] },
                  data_stream: { type: 'logs', dataset: 'test' },
                },
              ],
            },
          ]
        : [{ id: `input-${id}`, type: 'logfile', enabled: true, streams: [] }],
      created_at: '',
      updated_at: '',
      created_by: '',
      updated_by: '',
      revision: 1,
      policy_id: '',
      policy_ids: ['agent-policy'],
    });

    it('prunes a package policy secret reference not present in any compiled input', async () => {
      mockAgentPolicy({ package_policies: [buildPolicyWithSecretRef('stale-id', null)] });

      const policy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(policy!.secret_references).toEqual([]);
    });

    it('keeps a reference whose placeholder appears in a compiled stream', async () => {
      mockAgentPolicy({ package_policies: [buildPolicyWithSecretRef('live-id', 'present')] });

      const policy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(policy!.secret_references).toEqual([{ id: 'live-id' }]);
    });

    it('keeps a reference whose placeholder appears only in otelcolConfig', async () => {
      jest.spyOn(appContextService, 'getExperimentalFeatures').mockReturnValue({
        enableOtelIntegrations: true,
      } as any);

      mockAgentPolicy({
        package_policies: [
          {
            ...buildPolicyWithSecretRef('otel-id', null),
            inputs: [],
          },
        ],
      });

      mockedGenerateOtelcolConfig.mockReturnValue({
        receivers: { 'otlp/test': { endpoint: `$co.elastic.secret{otel-id}` } },
      } as any);

      const policy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(policy!.secret_references).toEqual([{ id: 'otel-id' }]);
    });

    it('deduplicates an id shared by two package policies', async () => {
      mockAgentPolicy({
        package_policies: [
          buildPolicyWithSecretRef('shared-id', 'present'),
          buildPolicyWithSecretRef('shared-id', 'present'),
        ],
      });

      const policy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(policy!.secret_references).toEqual([{ id: 'shared-id' }]);
    });

    it('keeps every reference when the compiled policy cannot be serialized (fail open)', async () => {
      mockAgentPolicy({
        package_policies: [
          {
            ...buildPolicyWithSecretRef('safe-id', null),
            // BigInt in compiled_stream makes JSON.stringify throw
            inputs: [
              {
                id: 'input-1',
                type: 'logfile',
                enabled: true,
                streams: [
                  {
                    id: 's1',
                    enabled: true,
                    compiled_stream: { val: BigInt(1) as any },
                    data_stream: { type: 'logs', dataset: 'test' },
                  },
                ],
              },
            ],
          },
        ],
      });

      const policy = await getFullAgentPolicy(createSavedObjectClientMock(), 'agent-policy');

      expect(policy!.secret_references).toEqual([{ id: 'safe-id' }]);
    });
  });
});

describe('getFullMonitoringSettings', () => {
  it('should return the correct settings when all values are present', async () => {
    const monitoringSettings = getFullMonitoringSettings(
      {
        namespace: 'default',
        monitoring_enabled: ['metrics', 'logs', 'traces'],
        monitoring_pprof_enabled: true,
        monitoring_http: {
          enabled: true,
          host: 'localhost',
          port: 1111,
        },
        monitoring_diagnostics: {
          limit: {
            interval: '1m',
            burst: 10,
          },
          uploader: {
            max_retries: 3,
            init_dur: '1m',
            max_dur: '10m',
          },
        },
      },
      {
        id: 'some-output',
        is_default: false,
        type: 'elasticsearch',
      }
    );

    expect(monitoringSettings).toEqual({
      enabled: true,
      logs: true,
      metrics: true,
      traces: true,
      namespace: 'default',
      use_output: 'some-output',
      pprof: { enabled: true },
      http: {
        enabled: true,
        host: 'localhost',
        port: 1111,
      },
      diagnostics: {
        limit: {
          interval: '1m',
          burst: 10,
        },
        uploader: {
          max_retries: 3,
          init_dur: '1m',
          max_dur: '10m',
        },
      },
    });
  });

  it('should return the correct settings when some values are present', async () => {
    const monitoringSettings = getFullMonitoringSettings(
      {
        namespace: 'default',
        monitoring_enabled: ['metrics'],
        monitoring_pprof_enabled: false,
        monitoring_http: {
          enabled: true,
          host: 'localhost',
        },
        monitoring_diagnostics: {
          limit: {
            interval: '1m',
          },
          uploader: {
            max_dur: '10m',
          },
        },
      },
      {
        id: 'some-output',
        is_default: true,
        type: 'elasticsearch',
      }
    );

    expect(monitoringSettings).toEqual({
      enabled: true,
      logs: false,
      metrics: true,
      traces: false,
      namespace: 'default',
      use_output: 'default',
      pprof: { enabled: false },
      http: {
        enabled: true,
        host: 'localhost',
      },
      diagnostics: {
        limit: {
          interval: '1m',
        },
        uploader: {
          max_dur: '10m',
        },
      },
    });
  });

  it('should return the correct settings when beats monitoring is disabled and minimal values are present', async () => {
    const monitoringSettings = getFullMonitoringSettings(
      {
        namespace: 'default',
        monitoring_enabled: [],
        monitoring_http: {
          enabled: true,
        },
        monitoring_diagnostics: {},
      },
      {
        id: 'some-output',
        is_default: true,
        type: 'elasticsearch',
      }
    );

    expect(monitoringSettings).toEqual({
      enabled: true,
      logs: false,
      metrics: false,
      traces: false,
      http: {
        enabled: true,
      },
    });
  });

  it('should disable monitoring if beats and http monitoring are disabled', async () => {
    const monitoringSettings = getFullMonitoringSettings(
      {
        namespace: 'default',
        monitoring_enabled: [],
        monitoring_http: {
          enabled: false,
        },
        monitoring_diagnostics: {},
      },
      {
        id: 'some-output',
        is_default: true,
        type: 'elasticsearch',
      }
    );

    expect(monitoringSettings).toEqual({
      enabled: false,
      logs: false,
      metrics: false,
      traces: false,
    });
  });
});

describe('transformOutputToFullPolicyOutput', () => {
  it('should works with only required field on a output', () => {
    const policyOutput = transformOutputToFullPolicyOutput({
      id: 'id123',
      hosts: ['http://host.fr'],
      is_default: false,
      is_default_monitoring: false,
      name: 'test output',
      type: 'elasticsearch',
    });

    expect(policyOutput).toMatchInlineSnapshot(`
      Object {
        "hosts": Array [
          "http://host.fr",
        ],
        "preset": "balanced",
        "type": "elasticsearch",
      }
    `);
  });
  it('should support ca_trusted_fingerprint field on a output', () => {
    const policyOutput = transformOutputToFullPolicyOutput({
      id: 'id123',
      hosts: ['http://host.fr'],
      is_default: false,
      is_default_monitoring: false,
      name: 'test output',
      type: 'elasticsearch',
      ca_trusted_fingerprint: 'fingerprint123',
      config_yaml: `
test: 1234
ssl.test: 123
      `,
    });

    expect(policyOutput).toMatchInlineSnapshot(`
      Object {
        "hosts": Array [
          "http://host.fr",
        ],
        "preset": "balanced",
        "ssl.ca_trusted_fingerprint": "fingerprint123",
        "ssl.test": 123,
        "test": 1234,
        "type": "elasticsearch",
      }
    `);
  });

  it('should keep ssl fields for es output type', () => {
    const policyOutput = transformOutputToFullPolicyOutput(
      {
        id: 'id123',
        hosts: ['http://host.fr'],
        is_default: false,
        is_default_monitoring: false,
        name: 'test output',
        type: 'elasticsearch',
        ssl: {
          certificate: '',
          certificate_authorities: [],
        },
      },
      undefined,
      false
    );

    expect(policyOutput).toMatchInlineSnapshot(`
      Object {
        "hosts": Array [
          "http://host.fr",
        ],
        "preset": "balanced",
        "ssl": Object {
          "certificate": "",
          "certificate_authorities": Array [],
        },
        "type": "elasticsearch",
      }
    `);
  });

  it('should works with proxy', () => {
    const policyOutput = transformOutputToFullPolicyOutput(
      {
        id: 'id123',
        hosts: ['http://host.fr'],
        is_default: false,
        is_default_monitoring: false,
        name: 'test output',
        type: 'elasticsearch',
        proxy_id: 'proxy-1',
      },
      {
        id: 'proxy-1',
        name: 'Proxy 1',
        url: 'https://proxy1.fr',
        is_preconfigured: false,
      }
    );

    expect(policyOutput).toMatchInlineSnapshot(`
      Object {
        "hosts": Array [
          "http://host.fr",
        ],
        "preset": "balanced",
        "proxy_url": "https://proxy1.fr",
        "type": "elasticsearch",
      }
    `);
  });

  it('should return placeholder API_KEY for elasticsearch output type in standalone ', () => {
    const policyOutput = transformOutputToFullPolicyOutput(
      {
        id: 'id123',
        hosts: ['http://host.fr'],
        is_default: false,
        is_default_monitoring: false,
        name: 'test output',
        type: 'elasticsearch',
      },
      undefined,
      true
    );

    expect(policyOutput).toMatchInlineSnapshot(`
      Object {
        "api_key": "\${API_KEY}",
        "hosts": Array [
          "http://host.fr",
        ],
        "preset": "balanced",
        "type": "elasticsearch",
      }
    `);
  });

  it('should not return placeholder API_KEY for logstash output type in standalone ', () => {
    const policyOutput = transformOutputToFullPolicyOutput(
      {
        id: 'id123',
        hosts: ['host.fr:3332'],
        is_default: false,
        is_default_monitoring: false,
        name: 'test output',
        type: 'logstash',
      },
      undefined,
      false
    );

    expect(policyOutput).toMatchInlineSnapshot(`
      Object {
        "hosts": Array [
          "host.fr:3332",
        ],
        "type": "logstash",
      }
    `);
  });

  it('should not override advanced yaml ssl fields for logstash output type', () => {
    const policyOutput = transformOutputToFullPolicyOutput(
      {
        id: 'id123',
        hosts: ['host.fr:3332'],
        is_default: false,
        is_default_monitoring: false,
        name: 'test output',
        type: 'logstash',
        config_yaml: 'ssl:\n  verification_mode: "none" ',
        ssl: {
          certificate: '',
          certificate_authorities: [],
        },
      },
      undefined,
      false
    );

    expect(policyOutput).toMatchInlineSnapshot(`
      Object {
        "hosts": Array [
          "host.fr:3332",
        ],
        "ssl": Object {
          "certificate": "",
          "certificate_authorities": Array [],
          "verification_mode": "none",
        },
        "type": "logstash",
      }
    `);
  });

  it('should not override advanced yaml ssl fields for elasticsearch output type', () => {
    const policyOutput = transformOutputToFullPolicyOutput(
      {
        id: 'id123',
        hosts: ['http://host.fr'],
        is_default: false,
        is_default_monitoring: false,
        name: 'test output',
        type: 'elasticsearch',
        config_yaml:
          'ssl:\n  verification_mode: "none"\n  certificate_authorities: ["/tmp/ssl/ca.crt"] ',
        ssl: {
          certificate: '',
          certificate_authorities: [],
        },
      },
      undefined,
      false
    );

    expect(policyOutput).toMatchInlineSnapshot(`
      Object {
        "hosts": Array [
          "http://host.fr",
        ],
        "preset": "balanced",
        "ssl": Object {
          "certificate": "",
          "certificate_authorities": Array [
            "/tmp/ssl/ca.crt",
          ],
          "verification_mode": "none",
        },
        "type": "elasticsearch",
      }
    `);
  });

  it('should work with kafka output', () => {
    const policyOutput = transformOutputToFullPolicyOutput({
      id: 'id123',
      hosts: ['test:9999'],
      topic: 'test',
      is_default: false,
      is_default_monitoring: false,
      name: 'test output',
      type: 'kafka',
      config_yaml: '',
      client_id: 'Elastic',
      version: '1.0.0',
      compression: 'none',
      auth_type: 'none',
      connection_type: 'plaintext',
      partition: 'random',
      random: {
        group_events: 1,
      },
      headers: [
        {
          key: '',
          value: '',
        },
      ],
      timeout: 30,
      broker_timeout: 30,
      required_acks: 1,
    });

    expect(policyOutput).toMatchInlineSnapshot(`
      Object {
        "broker_timeout": 30,
        "client_id": "Elastic",
        "compression": "none",
        "headers": Array [],
        "hosts": Array [
          "test:9999",
        ],
        "key": undefined,
        "partition": Object {
          "random": Object {
            "group_events": 1,
          },
        },
        "required_acks": 1,
        "timeout": 30,
        "topic": "test",
        "type": "kafka",
        "version": "1.0.0",
      }
    `);
  });

  it('should not write proxy fields into kafka output even when a proxy is provided', () => {
    const proxy = {
      id: 'proxy-1',
      name: 'Proxy 1',
      url: 'https://proxy1.fr',
      certificate_authorities: '/tmp/ssl/ca.crt',
      proxy_headers: { Authorization: 'Bearer SECRET' },
      certificate: 'my-cert',
      certificate_key: 'PRIVATE_KEY',
      is_preconfigured: false,
    } as any;

    const policyOutput = transformOutputToFullPolicyOutput(
      {
        id: 'id123',
        hosts: ['test:9999'],
        topic: 'test',
        is_default: false,
        is_default_monitoring: false,
        name: 'test output',
        type: 'kafka',
        config_yaml: '',
        client_id: 'Elastic',
        version: '1.0.0',
        compression: 'none',
        auth_type: 'none',
        connection_type: 'plaintext',
        partition: 'random',
        random: { group_events: 1 },
        headers: [],
        timeout: 30,
        broker_timeout: 30,
        required_acks: 1,
        proxy_id: 'proxy-1',
      },
      proxy
    );

    expect(policyOutput).not.toHaveProperty('proxy_url');
    expect(policyOutput).not.toHaveProperty('proxy_headers');
    // proxy-sourced SSL entries must not appear
    expect((policyOutput as any).ssl?.certificate_authorities).toBeUndefined();
    expect((policyOutput as any).ssl?.certificate).toBeUndefined();
    expect((policyOutput as any).ssl?.key).toBeUndefined();
  });

  it('should redact proxy_headers and ssl.key when redactProxySecrets=true', () => {
    const proxy = {
      id: 'proxy-1',
      name: 'proxy1',
      url: 'https://proxy.fr',
      certificate_authorities: '/tmp/ssl/ca.crt',
      proxy_headers: { Authorization: 'Bearer SECRET' },
      certificate: 'my-cert',
      certificate_key: 'PRIVATE_KEY',
      is_preconfigured: false,
    } as any;

    const policyOutput = transformOutputToFullPolicyOutput(
      {
        id: 'id123',
        proxy_id: 'proxy-1',
        hosts: ['http://host.fr'],
        is_default: false,
        is_default_monitoring: false,
        name: 'test output',
        type: 'elasticsearch',
      } as any,
      proxy,
      false,
      true // redactProxySecrets
    );

    expect(policyOutput.proxy_url).toBe('https://proxy.fr');
    expect(policyOutput).not.toHaveProperty('proxy_headers');
    expect(policyOutput.ssl?.certificate).toBe('my-cert');
    expect(policyOutput.ssl).not.toHaveProperty('key');
  });

  it('should throw for OTLP outputs because compilation is not yet implemented', () => {
    expect(() =>
      transformOutputToFullPolicyOutput({
        id: 'otlp-id',
        is_default: false,
        is_default_monitoring: false,
        name: 'test otlp output',
        type: 'otlp',
        otlp_exporter: { endpoint: 'https://otlp.example.com:4317', protocol: 'grpc' },
      } as any)
    ).toThrow('OTLP output "otlp-id" cannot be compiled into an agent policy output');
  });
});

describe('generateFleetConfig', () => {
  it('should work without proxy', () => {
    const res = generateFleetConfig(
      {
        host_urls: ['https://test.fr'],
      } as any,
      []
    );

    expect(res).toMatchInlineSnapshot(`
      Object {
        "hosts": Array [
          "https://test.fr",
        ],
      }
    `);
  });

  it('should work with proxy', () => {
    const res = generateFleetConfig(
      {
        host_urls: ['https://test.fr'],
        proxy_id: 'proxy-1',
      } as any,
      [
        {
          id: 'proxy-1',
          url: 'https://proxy.fr',
        } as any,
      ]
    );

    expect(res).toMatchInlineSnapshot(`
      Object {
        "hosts": Array [
          "https://test.fr",
        ],
        "proxy_url": "https://proxy.fr",
      }
    `);
  });

  it('should work with proxy with headers and certificate authorities', () => {
    const res = generateFleetConfig(
      {
        host_urls: ['https://test.fr'],
        proxy_id: 'proxy-1',
      } as any,
      [
        {
          id: 'proxy-1',
          url: 'https://proxy.fr',
          certificate_authorities: ['/tmp/ssl/ca.crt'],
          proxy_headers: { Authorization: 'xxx' },
        } as any,
      ]
    );

    expect(res).toMatchInlineSnapshot(`
      Object {
        "hosts": Array [
          "https://test.fr",
        ],
        "proxy_headers": Object {
          "Authorization": "xxx",
        },
        "proxy_url": "https://proxy.fr",
        "ssl": Object {
          "certificate_authorities": Array [
            Array [
              "/tmp/ssl/ca.crt",
            ],
          ],
          "renegotiation": "never",
          "verification_mode": "",
        },
      }
    `);
  });

  it('should work with proxy with headers and certificate authorities and certificate and key', () => {
    const res = generateFleetConfig(
      {
        host_urls: ['https://test.fr'],
        proxy_id: 'proxy-1',
      } as any,
      [
        {
          id: 'proxy-1',
          url: 'https://proxy.fr',
          certificate_authorities: ['/tmp/ssl/ca.crt'],
          proxy_headers: { Authorization: 'xxx' },
          certificate: 'my-cert',
          certificate_key: 'my-key',
        } as any,
      ]
    );

    expect(res).toMatchInlineSnapshot(`
    Object {
      "hosts": Array [
        "https://test.fr",
      ],
      "proxy_headers": Object {
        "Authorization": "xxx",
      },
      "proxy_url": "https://proxy.fr",
      "ssl": Object {
        "certificate": "my-cert",
        "certificate_authorities": Array [
          Array [
            "/tmp/ssl/ca.crt",
          ],
        ],
        "key": "my-key",
        "renegotiation": "never",
        "verification_mode": "",
      },
    }
  `);
  });

  it('should generate ssl config when a default ES output has ssl options', () => {
    const res = generateFleetConfig(
      {
        host_urls: ['https://test.fr'],
        ssl: {
          agent_certificate_authorities: ['/tmp/ssl/ca.crt'],
          agent_certificate: 'my-cert',
        },
        secrets: {
          ssl: {
            agent_key: 'my-key',
          },
        },
      } as any,
      []
    );

    expect(res).toEqual({
      hosts: ['https://test.fr'],
      ssl: {
        certificate: 'my-cert',
        certificate_authorities: ['/tmp/ssl/ca.crt'],
      },
      secrets: {
        ssl: {
          key: 'my-key',
        },
      },
    });
  });

  it('should redact proxy_headers and ssl.key when redactProxySecrets=true', () => {
    const res = generateFleetConfig(
      {
        host_urls: ['https://test.fr'],
        proxy_id: 'proxy-1',
      } as any,
      [
        {
          id: 'proxy-1',
          url: 'https://proxy.fr',
          certificate_authorities: ['/tmp/ssl/ca.crt'],
          proxy_headers: { Authorization: 'Bearer SECRET' },
          certificate: 'my-cert',
          certificate_key: 'PRIVATE_KEY',
        } as any,
      ],
      true // redactProxySecrets
    );

    expect(res).toMatchInlineSnapshot(`
      Object {
        "hosts": Array [
          "https://test.fr",
        ],
        "proxy_url": "https://proxy.fr",
        "ssl": Object {
          "certificate": "my-cert",
          "certificate_authorities": Array [
            Array [
              "/tmp/ssl/ca.crt",
            ],
          ],
          "renegotiation": "never",
          "verification_mode": "",
        },
      }
    `);
    expect(res).not.toHaveProperty('proxy_headers');
    if (res && 'hosts' in res) {
      expect(res.ssl).not.toHaveProperty('key');
    }
  });
});

describe('generateFleetServerOutputSSLConfig', () => {
  const baseFleetServerHost = {
    name: 'default Fleet Server',
    id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
    is_default: true,
    host_urls: ['http://fleetserver:8220'],
    is_preconfigured: false,
  } as any;

  it('should return undefined if no fleetServerHost is passed', () => {
    const res = generateFleetServerOutputSSLConfig(undefined);
    expect(res).toEqual(undefined);
  });

  it('should return undefined if fleetServerHost has no ssl and no secrets', () => {
    const res = generateFleetServerOutputSSLConfig(baseFleetServerHost);
    expect(res).toEqual(undefined);
  });

  it('should generate a bootstrap output if there are ES ssl fields', () => {
    const fleetServerHost = {
      ...baseFleetServerHost,
      ssl: {
        certificate_authorities: ['/tmp/ssl/ca.crt'],
        certificate: 'my-cert',
        key: 'my-key',
        es_certificate_authorities: ['/tmp/ssl/es-ca.crt'],
        es_certificate: 'my-es-cert',
        es_key: 'my-es-key',
      },
    };
    const res = generateFleetServerOutputSSLConfig(fleetServerHost);
    expect(res).toEqual({
      'fleetserver-output-93f74c0-e876-11ea-b7d3-8b2acec6f75c': {
        ssl: {
          certificate: 'my-es-cert',
          certificate_authorities: ['/tmp/ssl/es-ca.crt'],
          key: 'my-es-key',
        },
        type: 'elasticsearch',
      },
    });
  });

  it('should generate a bootstrap output if there are ES secrets fields', () => {
    const fleetServerHost = {
      ...baseFleetServerHost,
      secrets: {
        ssl: {
          key: 'my-key',
          es_key: 'my-es-key',
        },
      },
    };
    const res = generateFleetServerOutputSSLConfig(fleetServerHost);
    expect(res).toEqual({
      'fleetserver-output-93f74c0-e876-11ea-b7d3-8b2acec6f75c': {
        secrets: {
          ssl: {
            key: 'my-es-key',
          },
        },
        type: 'elasticsearch',
      },
    });
  });

  it('should generate a bootstrap output if there are both secrets and ES ssl fields', () => {
    const fleetServerHost = {
      ...baseFleetServerHost,
      ssl: {
        es_certificate_authorities: ['/tmp/ssl/es-ca.crt'],
        es_certificate: 'my-es-cert',
      },
      secrets: {
        ssl: {
          key: { id: 'my-key' },
          es_key: { id: 'my-es-key' },
        },
      },
    };
    const res = generateFleetServerOutputSSLConfig(fleetServerHost);
    expect(res).toEqual({
      'fleetserver-output-93f74c0-e876-11ea-b7d3-8b2acec6f75c': {
        ssl: {
          certificate_authorities: ['/tmp/ssl/es-ca.crt'],
          certificate: 'my-es-cert',
        },
        secrets: {
          ssl: {
            key: { id: 'my-es-key' },
          },
        },
        type: 'elasticsearch',
      },
    });
  });
  it('should use secrets key if the key is present in both ways', () => {
    const fleetServerHost = {
      ...baseFleetServerHost,
      ssl: {
        es_certificate_authorities: ['/tmp/ssl/es-ca.crt'],
        es_certificate: 'my-es-cert',
        es_key: { id: 'my-es-key' },
      },
      secrets: {
        ssl: {
          key: { id: 'my-key' },
          es_key: { id: 'my-secret-es-key' },
        },
      },
    };
    const res = generateFleetServerOutputSSLConfig(fleetServerHost);
    expect(res).toEqual({
      'fleetserver-output-93f74c0-e876-11ea-b7d3-8b2acec6f75c': {
        ssl: {
          certificate_authorities: ['/tmp/ssl/es-ca.crt'],
          certificate: 'my-es-cert',
        },
        secrets: {
          ssl: {
            key: { id: 'my-secret-es-key' },
          },
        },
        type: 'elasticsearch',
      },
    });
  });
});

describe('getBinarySourceSettings', () => {
  const downloadSource = {
    id: 'test-ds-1',
    is_default: false,
    name: 'Test',
    host: 'http://custom-registry-test',
  } as any;

  beforeEach(() => {
    jest.spyOn(appContextService, 'getExperimentalFeatures').mockReturnValue({
      enableAgentPolicyMultipleDownloadSources: true,
    } as any);
  });

  it('should not emit sources when enableAgentPolicyMultipleDownloadSources is disabled', () => {
    jest.spyOn(appContextService, 'getExperimentalFeatures').mockReturnValue({
      enableAgentPolicyMultipleDownloadSources: false,
    } as any);

    const secondaryDownloadSource = {
      ...downloadSource,
      id: 'test-ds-2',
      host: 'http://custom-registry-test-2',
    };

    expect(getBinarySourceSettings([downloadSource, secondaryDownloadSource], undefined)).toEqual({
      sourceURI: 'http://custom-registry-test',
    });
  });

  it('should return sourceURI for agent download config', () => {
    expect(getBinarySourceSettings([downloadSource], undefined)).toEqual({
      sourceURI: 'http://custom-registry-test',
      sources: ['http://custom-registry-test'],
    });
  });

  it('should return agent download config with ssl options if present', () => {
    const downloadSourceSSL = {
      ...downloadSource,
      ssl: {
        certificate: 'cert',
        certificate_authorities: ['ca'],
        key: 'KEY1',
      },
    };
    expect(getBinarySourceSettings([downloadSourceSSL], undefined)).toEqual({
      sourceURI: 'http://custom-registry-test',
      sources: ['http://custom-registry-test'],
      ssl: {
        certificate: 'cert',
        certificate_authorities: ['ca'],
        key: 'KEY1',
      },
    });
  });

  it('should return agent download config with secrets if present', () => {
    const downloadSourceSecrets = {
      ...downloadSource,
      secrets: {
        ssl: {
          key: { id: 'keyid' },
        },
      },
    };
    expect(getBinarySourceSettings([downloadSourceSecrets], undefined)).toEqual({
      sourceURI: 'http://custom-registry-test',
      sources: ['http://custom-registry-test'],
      secrets: {
        ssl: {
          key: { id: 'keyid' },
        },
      },
    });
  });

  it('should return agent download config with secrets and ssl if present', () => {
    const downloadSourceSecrets = {
      ...downloadSource,
      ssl: {
        certificate: 'cert',
        certificate_authorities: ['ca'],
      },
      secrets: {
        ssl: {
          key: { id: 'keyid' },
        },
      },
    };
    expect(getBinarySourceSettings([downloadSourceSecrets], undefined)).toEqual({
      sourceURI: 'http://custom-registry-test',
      sources: ['http://custom-registry-test'],
      ssl: {
        certificate: 'cert',
        certificate_authorities: ['ca'],
      },
      secrets: {
        ssl: {
          key: { id: 'keyid' },
        },
      },
    });
  });

  it('should return agent download config using secrets key if both keys are present', () => {
    const downloadSourceSecrets = {
      ...downloadSource,
      ssl: {
        certificate: 'cert',
        certificate_authorities: ['ca'],
        key: { id: 'keyid' },
      },
      secrets: {
        ssl: {
          key: { id: 'secretkeyid' },
        },
      },
    };
    expect(getBinarySourceSettings([downloadSourceSecrets], undefined)).toEqual({
      sourceURI: 'http://custom-registry-test',
      sources: ['http://custom-registry-test'],
      ssl: {
        certificate: 'cert',
        certificate_authorities: ['ca'],
      },
      secrets: {
        ssl: {
          key: { id: 'secretkeyid' },
        },
      },
    });
  });

  describe('with proxy', () => {
    const proxy = {
      id: 'proxy_1',
      name: 'proxy1',
      url: 'http://proxy_uri.it',
      certificate: 'proxy_cert',
      certificate_authorities: 'PROXY_CA',
      certificate_key: 'PROXY_KEY1',
      proxy_headers: { ProxyHeader1: 'Test' },
      is_preconfigured: false,
    };

    it('should return config with ssl options coming from the proxy', () => {
      expect(getBinarySourceSettings([downloadSource], proxy)).toEqual({
        proxy_url: 'http://proxy_uri.it',
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        proxy_headers: { ProxyHeader1: 'Test' },
        ssl: {
          certificate: 'proxy_cert',
          certificate_authorities: ['PROXY_CA'],
          key: 'PROXY_KEY1',
        },
      });
    });

    it('should return no proxy_headers if they are not present in proxy', () => {
      const proxyWithNoHeaders = {
        id: 'proxy_1',
        name: 'proxy1',
        url: 'http://proxy_uri.it',
        certificate: 'proxy_cert',
        certificate_authorities: 'PROXY_CA',
        certificate_key: 'PROXY_KEY1',
        is_preconfigured: false,
      };
      expect(getBinarySourceSettings([downloadSource], proxyWithNoHeaders)).toEqual({
        proxy_url: 'http://proxy_uri.it',
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        ssl: {
          certificate: 'proxy_cert',
          certificate_authorities: ['PROXY_CA'],
          key: 'PROXY_KEY1',
        },
      });
    });

    it('should use proxy SSL options when present', () => {
      expect(getBinarySourceSettings([downloadSource], proxy)).toEqual({
        proxy_url: 'http://proxy_uri.it',
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        proxy_headers: { ProxyHeader1: 'Test' },
        ssl: {
          certificate: 'proxy_cert',
          certificate_authorities: ['PROXY_CA'],
          key: 'PROXY_KEY1',
        },
      });
    });

    it('should keep SSL secrets when present', () => {
      const downloadSourceSecrets = {
        ...downloadSource,
        secrets: {
          ssl: {
            key: { id: 'keyid' },
          },
        },
      };
      expect(getBinarySourceSettings([downloadSourceSecrets], proxy)).toEqual({
        proxy_url: 'http://proxy_uri.it',
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        secrets: {
          ssl: {
            key: {
              id: 'keyid',
            },
          },
        },
        proxy_headers: { ProxyHeader1: 'Test' },
        ssl: {
          certificate: 'proxy_cert',
          certificate_authorities: ['PROXY_CA'],
          key: 'PROXY_KEY1',
        },
      });
    });

    it('should redact proxy_headers and ssl.key when redactProxySecrets=true', () => {
      const result = getBinarySourceSettings([downloadSource], proxy, true);
      expect(result).toEqual({
        proxy_url: 'http://proxy_uri.it',
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        ssl: {
          certificate: 'proxy_cert',
          certificate_authorities: ['PROXY_CA'],
        },
      });
      expect(result).not.toHaveProperty('proxy_headers');
      expect(result.ssl).not.toHaveProperty('key');
    });
  });

  describe('with auth', () => {
    it('should return agent download config with plain text auth (username/password)', () => {
      const downloadSourceWithAuth = {
        ...downloadSource,
        auth: {
          username: 'user1',
          password: 'pass1',
        },
      };
      expect(getBinarySourceSettings([downloadSourceWithAuth], undefined)).toEqual({
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        auth: {
          username: 'user1',
          password: 'pass1',
        },
      });
    });

    it('should return agent download config with plain text auth (api_key)', () => {
      const downloadSourceWithApiKey = {
        ...downloadSource,
        auth: {
          api_key: 'my-api-key',
        },
      };
      expect(getBinarySourceSettings([downloadSourceWithApiKey], undefined)).toEqual({
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        auth: {
          api_key: 'my-api-key',
        },
      });
    });

    it('should return agent download config with secrets.auth.password', () => {
      const downloadSourceWithSecretPassword = {
        ...downloadSource,
        auth: {
          username: 'user1',
        },
        secrets: {
          auth: {
            password: { id: 'password-secret-id' },
          },
        },
      };
      expect(getBinarySourceSettings([downloadSourceWithSecretPassword], undefined)).toEqual({
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        auth: {
          username: 'user1',
        },
        secrets: {
          auth: {
            password: { id: 'password-secret-id' },
          },
        },
      });
    });

    it('should return agent download config with secrets.auth.api_key', () => {
      const downloadSourceWithSecretApiKey = {
        ...downloadSource,
        secrets: {
          auth: {
            api_key: { id: 'api-key-secret-id' },
          },
        },
      };
      expect(getBinarySourceSettings([downloadSourceWithSecretApiKey], undefined)).toEqual({
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        secrets: {
          auth: {
            api_key: { id: 'api-key-secret-id' },
          },
        },
      });
    });

    it('should use secret password over plain text password when both are present', () => {
      const downloadSourceWithBoth = {
        ...downloadSource,
        auth: {
          username: 'user1',
          password: 'plain-text-password',
        },
        secrets: {
          auth: {
            password: { id: 'secret-password-id' },
          },
        },
      };
      expect(getBinarySourceSettings([downloadSourceWithBoth], undefined)).toEqual({
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        auth: {
          username: 'user1',
          // password should NOT be included here since it's in secrets
        },
        secrets: {
          auth: {
            password: { id: 'secret-password-id' },
          },
        },
      });
    });

    it('should use secret api_key over plain text api_key when both are present', () => {
      const downloadSourceWithBoth = {
        ...downloadSource,
        auth: {
          api_key: 'plain-text-api-key',
        },
        secrets: {
          auth: {
            api_key: { id: 'secret-api-key-id' },
          },
        },
      };
      expect(getBinarySourceSettings([downloadSourceWithBoth], undefined)).toEqual({
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        // auth should NOT be included since api_key is in secrets
        secrets: {
          auth: {
            api_key: { id: 'secret-api-key-id' },
          },
        },
      });
    });

    it('should return config with both SSL and auth secrets', () => {
      const downloadSourceWithAllSecrets = {
        ...downloadSource,
        auth: {
          username: 'user1',
        },
        secrets: {
          ssl: {
            key: { id: 'ssl-key-id' },
          },
          auth: {
            password: { id: 'password-secret-id' },
          },
        },
      };
      expect(getBinarySourceSettings([downloadSourceWithAllSecrets], undefined)).toEqual({
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        auth: {
          username: 'user1',
        },
        secrets: {
          ssl: {
            key: { id: 'ssl-key-id' },
          },
          auth: {
            password: { id: 'password-secret-id' },
          },
        },
      });
    });

    it('should return agent download config with auth headers', () => {
      const downloadSourceWithHeaders = {
        ...downloadSource,
        auth: {
          username: 'user1',
          password: 'pass1',
          headers: [
            { key: 'X-Custom-Header', value: 'custom-value' },
            { key: 'Authorization', value: 'Bearer token123' },
          ],
        },
      };
      expect(getBinarySourceSettings([downloadSourceWithHeaders], undefined)).toEqual({
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        auth: {
          username: 'user1',
          password: 'pass1',
          headers: [
            { key: 'X-Custom-Header', value: 'custom-value' },
            { key: 'Authorization', value: 'Bearer token123' },
          ],
        },
      });
    });

    it('should filter out empty headers', () => {
      const downloadSourceWithEmptyHeaders = {
        ...downloadSource,
        auth: {
          api_key: 'my-api-key',
          headers: [
            { key: 'X-Valid-Header', value: 'valid-value' },
            { key: '', value: '' },
            { key: 'Another-Header', value: 'another-value' },
          ],
        },
      };
      expect(getBinarySourceSettings([downloadSourceWithEmptyHeaders], undefined)).toEqual({
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        auth: {
          api_key: 'my-api-key',
          headers: [
            { key: 'X-Valid-Header', value: 'valid-value' },
            { key: 'Another-Header', value: 'another-value' },
          ],
        },
      });
    });

    it('should not include headers in auth if all headers are empty', () => {
      const downloadSourceWithOnlyEmptyHeaders = {
        ...downloadSource,
        auth: {
          api_key: 'my-api-key',
          headers: [{ key: '', value: '' }],
        },
      };
      expect(getBinarySourceSettings([downloadSourceWithOnlyEmptyHeaders], undefined)).toEqual({
        sourceURI: 'http://custom-registry-test',
        sources: ['http://custom-registry-test'],
        auth: {
          api_key: 'my-api-key',
        },
      });
    });
  });
});
