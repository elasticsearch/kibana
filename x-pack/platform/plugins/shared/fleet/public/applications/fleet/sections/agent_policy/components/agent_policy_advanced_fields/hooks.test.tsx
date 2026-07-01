/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { waitFor } from '@testing-library/react';

import { createFleetTestRendererMock } from '../../../../../../mock';
import type { MockedFleetStartServices } from '../../../../../../mock';
import { useLicense } from '../../../../../../hooks/use_license';
import type { LicenseService } from '../../../../services';
import type { AgentPolicy } from '../../../../types';

import { useOutputOptions, useFleetServerHostsOptions } from './hooks';

jest.mock('../../../../../../hooks/use_license');

const mockedUseLicence = useLicense as jest.MockedFunction<typeof useLicense>;

function defaultHttpClientGetImplementation(path: any) {
  if (typeof path !== 'string') {
    throw new Error('Invalid request');
  }
  const err = new Error(`API [GET ${path}] is not MOCKED!`);
  // eslint-disable-next-line no-console
  console.log(err);
  throw err;
}

const mockApiCallsWithOutputs = (http: MockedFleetStartServices['http']) => {
  http.get.mockImplementation(async (path) => {
    if (typeof path !== 'string') {
      throw new Error('Invalid request');
    }
    if (path === '/api/fleet/outputs') {
      return {
        data: {
          items: [
            {
              id: 'output1',
              name: 'Output 1',
              is_default: true,
              is_default_monitoring: true,
              type: 'elasticsearch',
            },
            {
              id: 'output2',
              name: 'Output 2',
              is_default: false,
              is_default_monitoring: false,
              type: 'remote_elasticsearch',
            },
            {
              id: 'output3',
              name: 'Output 3',
              is_default: false,
              is_default_monitoring: false,
              type: 'logstash',
            },
            {
              id: 'output4',
              name: 'Output 4',
              is_default: false,
              is_default_monitoring: false,
              type: 'kafka',
            },
          ],
        },
      };
    }

    return defaultHttpClientGetImplementation(path);
  });
};

const mockApiCallsWithLogstashOutputs = (http: MockedFleetStartServices['http']) => {
  http.get.mockImplementation(async (path) => {
    if (typeof path !== 'string') {
      throw new Error('Invalid request');
    }
    if (path === '/api/fleet/outputs') {
      return {
        data: {
          items: [
            {
              id: 'elasticsearch1',
              name: 'Elasticsearch1',
              is_default: false,
              type: 'elasticsearch',
              is_default_monitoring: false,
            },
            {
              id: 'logstash1',
              name: 'Logstash 1',
              type: 'logstash',
              is_default: true,
              is_default_monitoring: true,
            },
          ],
        },
      };
    }

    return defaultHttpClientGetImplementation(path);
  });
};

const mockApiCallsWithRemoteESOutputs = (http: MockedFleetStartServices['http']) => {
  http.get.mockImplementation(async (path) => {
    if (typeof path !== 'string') {
      throw new Error('Invalid request');
    }
    if (path === '/api/fleet/outputs') {
      return {
        data: {
          items: [
            {
              id: 'remote1',
              name: 'Remote1',
              type: 'remote_elasticsearch',
              is_default: false,
              is_default_monitoring: false,
            },
          ],
        },
      };
    }

    return defaultHttpClientGetImplementation(path);
  });
};

const mockApiCallsWithInternalOutputs = (http: MockedFleetStartServices['http']) => {
  http.get.mockImplementation(async (path) => {
    if (typeof path !== 'string') {
      throw new Error('Invalid request');
    }
    if (path === '/api/fleet/outputs') {
      return {
        data: {
          items: [
            {
              id: 'default-output',
              name: 'Default',
              type: 'elasticsearch',
              is_default: true,
              is_default_monitoring: true,
            },
            {
              id: 'internal-output',
              name: 'Internal',
              type: 'elasticsearch',
              is_default: false,
              is_default_monitoring: false,
              is_internal: true,
            },
          ],
        },
      };
    }

    return defaultHttpClientGetImplementation(path);
  });
};

const mockApiCallsWithInternalFleetServerHost = (http: MockedFleetStartServices['http']) => {
  http.get.mockImplementation(async (path) => {
    if (typeof path !== 'string') {
      throw new Error('Invalid request');
    }
    if (path === '/api/fleet/fleet_server_hosts') {
      return {
        data: {
          items: [
            {
              id: 'default-host',
              name: 'Default',
              is_default: true,
            },
            {
              id: 'internal-output',
              name: 'Internal',
              is_default: false,
              is_internal: true,
            },
          ],
        },
      };
    }

    return defaultHttpClientGetImplementation(path);
  });
};

describe('useOutputOptions', () => {
  it('should generate enabled options if the licence is platinium', async () => {
    const testRenderer = createFleetTestRendererMock();
    mockedUseLicence.mockReturnValue({
      hasAtLeast: () => true,
    } as unknown as LicenseService);
    mockApiCallsWithOutputs(testRenderer.startServices.http);
    const { result } = testRenderer.renderHook(() => useOutputOptions({} as AgentPolicy));
    expect(result.current.isLoading).toBeTruthy();

    await waitFor(() => new Promise((resolve) => resolve(null)));
    expect(result.current.dataOutputOptions).toMatchInlineSnapshot(`
      Array [
        Object {
          "disabled": false,
          "inputDisplay": "Default (currently Output 1)",
          "value": "@@##DEFAULT_SELECT##@@",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Output 1",
          "value": "output1",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Output 2",
          "value": "output2",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Output 3",
          "value": "output3",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Output 4",
          "value": "output4",
        },
      ]
    `);
    expect(result.current.monitoringOutputOptions).toMatchInlineSnapshot(`
      Array [
        Object {
          "disabled": undefined,
          "inputDisplay": "Default (currently Output 1)",
          "value": "@@##DEFAULT_SELECT##@@",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Output 1",
          "value": "output1",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Output 2",
          "value": "output2",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Output 3",
          "value": "output3",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Output 4",
          "value": "output4",
        },
      ]
    `);
  });

  it('should only enable the default options if the licence is not platinium', async () => {
    const testRenderer = createFleetTestRendererMock();
    mockedUseLicence.mockReturnValue({
      hasAtLeast: () => false,
    } as unknown as LicenseService);
    mockApiCallsWithOutputs(testRenderer.startServices.http);
    const { result } = testRenderer.renderHook(() => useOutputOptions({} as AgentPolicy));
    expect(result.current.isLoading).toBeTruthy();

    await waitFor(() => new Promise((resolve) => resolve(null)));
    expect(result.current.dataOutputOptions).toMatchInlineSnapshot(`
      Array [
        Object {
          "disabled": false,
          "inputDisplay": "Default (currently Output 1)",
          "value": "@@##DEFAULT_SELECT##@@",
        },
        Object {
          "disabled": true,
          "inputDisplay": "Output 1",
          "value": "output1",
        },
        Object {
          "disabled": true,
          "inputDisplay": "Output 2",
          "value": "output2",
        },
        Object {
          "disabled": true,
          "inputDisplay": "Output 3",
          "value": "output3",
        },
        Object {
          "disabled": true,
          "inputDisplay": "Output 4",
          "value": "output4",
        },
      ]
    `);
    expect(result.current.monitoringOutputOptions).toMatchInlineSnapshot(`
      Array [
        Object {
          "disabled": undefined,
          "inputDisplay": "Default (currently Output 1)",
          "value": "@@##DEFAULT_SELECT##@@",
        },
        Object {
          "disabled": true,
          "inputDisplay": "Output 1",
          "value": "output1",
        },
        Object {
          "disabled": true,
          "inputDisplay": "Output 2",
          "value": "output2",
        },
        Object {
          "disabled": true,
          "inputDisplay": "Output 3",
          "value": "output3",
        },
        Object {
          "disabled": true,
          "inputDisplay": "Output 4",
          "value": "output4",
        },
      ]
    `);
  });

  it('should enable logstash output if there is no APM integration in the policy', async () => {
    const testRenderer = createFleetTestRendererMock();
    mockedUseLicence.mockReturnValue({
      hasAtLeast: () => true,
    } as unknown as LicenseService);
    mockApiCallsWithLogstashOutputs(testRenderer.startServices.http);
    const { result } = testRenderer.renderHook(() => useOutputOptions({} as AgentPolicy));
    expect(result.current.isLoading).toBeTruthy();

    await waitFor(() => new Promise((resolve) => resolve(null)));
    expect(result.current.dataOutputOptions).toMatchInlineSnapshot(`
      Array [
        Object {
          "disabled": false,
          "inputDisplay": "Default (currently Logstash 1)",
          "value": "@@##DEFAULT_SELECT##@@",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Elasticsearch1",
          "value": "elasticsearch1",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Logstash 1",
          "value": "logstash1",
        },
      ]
    `);
    expect(result.current.monitoringOutputOptions).toMatchInlineSnapshot(`
      Array [
        Object {
          "disabled": undefined,
          "inputDisplay": "Default (currently Logstash 1)",
          "value": "@@##DEFAULT_SELECT##@@",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Elasticsearch1",
          "value": "elasticsearch1",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Logstash 1",
          "value": "logstash1",
        },
      ]
    `);
  });

  it('should not enable logstash output if there is an APM integration in the policy', async () => {
    const testRenderer = createFleetTestRendererMock();
    mockedUseLicence.mockReturnValue({
      hasAtLeast: () => true,
    } as unknown as LicenseService);
    mockApiCallsWithLogstashOutputs(testRenderer.startServices.http);
    const { result } = testRenderer.renderHook(() =>
      useOutputOptions({
        package_policies: [
          {
            package: {
              name: 'apm',
            },
          },
        ],
      } as AgentPolicy)
    );
    expect(result.current.isLoading).toBeTruthy();

    await waitFor(() => new Promise((resolve) => resolve(null)));
    expect(result.current.dataOutputOptions).toMatchInlineSnapshot(`
      Array [
        Object {
          "disabled": true,
          "inputDisplay": <React.Fragment>
            <EuiText
              size="s"
            >
              Default (currently Logstash 1)
            </EuiText>
            <EuiSpacer
              size="xs"
            />
            <EuiText
              size="s"
            >
              <Memo(MemoizedFormattedMessage)
                defaultMessage="{outputType} output for agent integration is not supported for this policy."
                id="xpack.fleet.agentPolicyForm.outputOptionDisableOutputTypeText"
                values={
                  Object {
                    "outputType": "logstash",
                  }
                }
              />
            </EuiText>
          </React.Fragment>,
          "value": "@@##DEFAULT_SELECT##@@",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Elasticsearch1",
          "value": "elasticsearch1",
        },
        Object {
          "disabled": true,
          "inputDisplay": <React.Fragment>
            <EuiText
              size="s"
            >
              Logstash 1
            </EuiText>
            <EuiSpacer
              size="xs"
            />
            <EuiText
              size="s"
            >
              <Memo(MemoizedFormattedMessage)
                defaultMessage="{outputType} output for agent integration is not supported for this policy."
                id="xpack.fleet.agentPolicyForm.outputOptionDisabledTypeNotSupportedText"
                values={
                  Object {
                    "outputType": "logstash",
                  }
                }
              />
            </EuiText>
          </React.Fragment>,
          "value": "logstash1",
        },
      ]
    `);
    expect(result.current.monitoringOutputOptions).toMatchInlineSnapshot(`
      Array [
        Object {
          "disabled": undefined,
          "inputDisplay": "Default (currently Logstash 1)",
          "value": "@@##DEFAULT_SELECT##@@",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Elasticsearch1",
          "value": "elasticsearch1",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Logstash 1",
          "value": "logstash1",
        },
      ]
    `);
  });

  it('should enable remote es output for data and monitoring output', async () => {
    const testRenderer = createFleetTestRendererMock();
    mockedUseLicence.mockReturnValue({
      hasAtLeast: () => true,
    } as unknown as LicenseService);
    mockApiCallsWithRemoteESOutputs(testRenderer.startServices.http);
    const { result } = testRenderer.renderHook(() => useOutputOptions({} as AgentPolicy));
    expect(result.current.isLoading).toBeTruthy();

    await waitFor(() => new Promise((resolve) => resolve(null)));
    expect(result.current.dataOutputOptions.length).toEqual(2);
    expect(result.current.dataOutputOptions[1].value).toEqual('remote1');
    expect(result.current.monitoringOutputOptions.length).toEqual(2);
    expect(result.current.monitoringOutputOptions[1].value).toEqual('remote1');
  });

  it('should not enable internal outputs', async () => {
    const testRenderer = createFleetTestRendererMock();
    mockedUseLicence.mockReturnValue({
      hasAtLeast: () => true,
    } as unknown as LicenseService);
    mockApiCallsWithInternalOutputs(testRenderer.startServices.http);
    const { result } = testRenderer.renderHook(() => useOutputOptions({} as AgentPolicy));
    expect(result.current.isLoading).toBeTruthy();

    await waitFor(() => new Promise((resolve) => resolve(null)));
    expect(result.current.dataOutputOptions).toMatchInlineSnapshot(`
      Array [
        Object {
          "disabled": false,
          "inputDisplay": "Default (currently Default)",
          "value": "@@##DEFAULT_SELECT##@@",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Default",
          "value": "default-output",
        },
      ]
    `);
    expect(result.current.monitoringOutputOptions).toMatchInlineSnapshot(`
      Array [
        Object {
          "disabled": undefined,
          "inputDisplay": "Default (currently Default)",
          "value": "@@##DEFAULT_SELECT##@@",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Default",
          "value": "default-output",
        },
      ]
    `);
  });

  it('should only enable elasticsearch data output for agentless policy', async () => {
    const testRenderer = createFleetTestRendererMock();
    mockedUseLicence.mockReturnValue({
      hasAtLeast: () => true,
    } as unknown as LicenseService);
    mockApiCallsWithOutputs(testRenderer.startServices.http);
    const { result } = testRenderer.renderHook(() =>
      useOutputOptions({
        supports_agentless: true,
      } as AgentPolicy)
    );
    expect(result.current.isLoading).toBeTruthy();
    await waitFor(() => new Promise((resolve) => resolve(null)));
    expect(result.current.dataOutputOptions).toMatchInlineSnapshot(`
      Array [
        Object {
          "disabled": false,
          "inputDisplay": "Default (currently Output 1)",
          "value": "@@##DEFAULT_SELECT##@@",
        },
        Object {
          "disabled": false,
          "inputDisplay": "Output 1",
          "value": "output1",
        },
        Object {
          "disabled": true,
          "inputDisplay": <React.Fragment>
            <EuiText
              size="s"
            >
              Output 2
            </EuiText>
            <EuiSpacer
              size="xs"
            />
            <EuiText
              size="s"
            >
              <Memo(MemoizedFormattedMessage)
                defaultMessage="{outputType} output for agent integration is not supported for this policy."
                id="xpack.fleet.agentPolicyForm.outputOptionDisabledTypeNotSupportedText"
                values={
                  Object {
                    "outputType": "remote_elasticsearch",
                  }
                }
              />
            </EuiText>
          </React.Fragment>,
          "value": "output2",
        },
        Object {
          "disabled": true,
          "inputDisplay": <React.Fragment>
            <EuiText
              size="s"
            >
              Output 3
            </EuiText>
            <EuiSpacer
              size="xs"
            />
            <EuiText
              size="s"
            >
              <Memo(MemoizedFormattedMessage)
                defaultMessage="{outputType} output for agent integration is not supported for this policy."
                id="xpack.fleet.agentPolicyForm.outputOptionDisabledTypeNotSupportedText"
                values={
                  Object {
                    "outputType": "logstash",
                  }
                }
              />
            </EuiText>
          </React.Fragment>,
          "value": "output3",
        },
        Object {
          "disabled": true,
          "inputDisplay": <React.Fragment>
            <EuiText
              size="s"
            >
              Output 4
            </EuiText>
            <EuiSpacer
              size="xs"
            />
            <EuiText
              size="s"
            >
              <Memo(MemoizedFormattedMessage)
                defaultMessage="{outputType} output for agent integration is not supported for this policy."
                id="xpack.fleet.agentPolicyForm.outputOptionDisabledTypeNotSupportedText"
                values={
                  Object {
                    "outputType": "kafka",
                  }
                }
              />
            </EuiText>
          </React.Fragment>,
          "value": "output4",
        },
      ]
    `);
  });
});

describe('useFleetServerHostsOptions', () => {
  it('should not enable internal fleet server hosts', async () => {
    const testRenderer = createFleetTestRendererMock();
    mockApiCallsWithInternalFleetServerHost(testRenderer.startServices.http);
    const { result } = testRenderer.renderHook(() => useFleetServerHostsOptions({} as AgentPolicy));
    expect(result.current.isLoading).toBeTruthy();

    await waitFor(() => new Promise((resolve) => resolve(null)));
    expect(result.current.fleetServerHostsOptions).toMatchInlineSnapshot(`
      Array [
        Object {
          "disabled": undefined,
          "inputDisplay": "Default (currently Default)",
          "value": "@@##DEFAULT_SELECT##@@",
        },
        Object {
          "inputDisplay": "Default",
          "value": "default-host",
        },
      ]
    `);
  });

  it('should include internal fleet server hosts for an agentless policy but not the PrivateLink host', async () => {
    const testRenderer = createFleetTestRendererMock();
    testRenderer.startServices.cloud!.isCloudEnabled = true;
    (testRenderer.config as any).agentless = { enabled: true };
    testRenderer.startServices.http.get.mockImplementation(async (path: any) => {
      if (path === '/api/fleet/fleet_server_hosts') {
        return {
          data: {
            items: [
              { id: 'default-fleet-server', name: 'Default', is_default: true },
              {
                id: 'default-fleet-server-internal',
                name: 'Agentless Internal',
                is_default: false,
                is_internal: true,
              },
              {
                id: 'private-fleet-server',
                name: 'Private Fleet Server',
                is_default: false,
                is_internal: true,
              },
            ],
          },
        };
      }
      throw new Error(`Unmocked path: ${path}`);
    });

    const { result } = testRenderer.renderHook(() =>
      useFleetServerHostsOptions({ supports_agentless: true } as AgentPolicy)
    );

    await waitFor(() => new Promise((resolve) => resolve(null)));

    const values = result.current.fleetServerHostsOptions.map((o) => o.value);
    // Agentless-internal host should be visible for agentless policies
    expect(values).toContain('default-fleet-server-internal');
    // PrivateLink host should NOT be visible for agentless policies (runs on Elastic infra)
    expect(values).not.toContain('private-fleet-server');
  });

  it('should include the PrivateLink Fleet Server host in serverless even though it is internal', async () => {
    const testRenderer = createFleetTestRendererMock();
    testRenderer.startServices.cloud!.isServerlessEnabled = true;
    testRenderer.startServices.http.get.mockImplementation(async (path: any) => {
      if (path === '/api/fleet/fleet_server_hosts') {
        return {
          data: {
            items: [
              { id: 'default-fleet-server', name: 'Default', is_default: true },
              {
                id: 'default-fleet-server-internal',
                name: 'Agentless Internal',
                is_default: false,
                is_internal: true,
              },
              {
                id: 'private-fleet-server',
                name: 'Private Fleet Server',
                is_default: false,
                is_internal: true,
              },
            ],
          },
        };
      }
      throw new Error(`Unmocked path: ${path}`);
    });

    const { result } = testRenderer.renderHook(() => useFleetServerHostsOptions({} as AgentPolicy));

    await waitFor(() => new Promise((resolve) => resolve(null)));

    const values = result.current.fleetServerHostsOptions.map((o) => o.value);
    // PrivateLink host should be present
    expect(values).toContain('private-fleet-server');
    // Agentless-internal host should be absent
    expect(values).not.toContain('default-fleet-server-internal');
  });
});

describe('useOutputOptions — serverless PrivateLink', () => {
  it('should include the PrivateLink output in serverless even though it is internal', async () => {
    const testRenderer = createFleetTestRendererMock();
    testRenderer.startServices.cloud!.isServerlessEnabled = true;
    mockedUseLicence.mockReturnValue({ hasAtLeast: () => true } as unknown as LicenseService);
    testRenderer.startServices.http.get.mockImplementation(async (path: any) => {
      if (path === '/api/fleet/outputs') {
        return {
          data: {
            items: [
              {
                id: 'es-default-output',
                name: 'Default',
                is_default: true,
                is_default_monitoring: true,
                type: 'elasticsearch',
              },
              {
                id: 'es-default-output-internal',
                name: 'Agentless Internal',
                is_default: false,
                is_default_monitoring: false,
                type: 'elasticsearch',
                is_internal: true,
              },
              {
                id: 'es-private-output',
                name: 'Private ES Output',
                is_default: false,
                is_default_monitoring: false,
                type: 'elasticsearch',
                is_internal: true,
              },
            ],
          },
        };
      }
      throw new Error(`Unmocked path: ${path}`);
    });

    const { result } = testRenderer.renderHook(() => useOutputOptions({} as AgentPolicy));

    await waitFor(() => new Promise((resolve) => resolve(null)));

    const dataValues = result.current.dataOutputOptions.map((o) => o.value);
    const monitoringValues = result.current.monitoringOutputOptions.map((o) => o.value);

    // PrivateLink output should appear in both selectors
    expect(dataValues).toContain('es-private-output');
    expect(monitoringValues).toContain('es-private-output');

    // Agentless-internal output should be absent from both
    expect(dataValues).not.toContain('es-default-output-internal');
    expect(monitoringValues).not.toContain('es-default-output-internal');
  });

  it('should not include internal outputs in non-serverless', async () => {
    const testRenderer = createFleetTestRendererMock();
    testRenderer.startServices.cloud!.isServerlessEnabled = false;
    mockedUseLicence.mockReturnValue({ hasAtLeast: () => true } as unknown as LicenseService);
    testRenderer.startServices.http.get.mockImplementation(async (path: any) => {
      if (path === '/api/fleet/outputs') {
        return {
          data: {
            items: [
              {
                id: 'default-output',
                name: 'Default',
                is_default: true,
                is_default_monitoring: true,
                type: 'elasticsearch',
              },
              {
                id: 'some-internal-output',
                name: 'Internal',
                is_default: false,
                is_default_monitoring: false,
                type: 'elasticsearch',
                is_internal: true,
              },
            ],
          },
        };
      }
      throw new Error(`Unmocked path: ${path}`);
    });

    const { result } = testRenderer.renderHook(() => useOutputOptions({} as AgentPolicy));

    await waitFor(() => new Promise((resolve) => resolve(null)));

    const dataValues = result.current.dataOutputOptions.map((o) => o.value);
    expect(dataValues).not.toContain('some-internal-output');
  });

  it('should include internal outputs for agentless but not the PrivateLink output', async () => {
    const testRenderer = createFleetTestRendererMock();
    testRenderer.startServices.cloud!.isCloudEnabled = true;
    (testRenderer.config as any).agentless = { enabled: true };
    mockedUseLicence.mockReturnValue({ hasAtLeast: () => true } as unknown as LicenseService);
    testRenderer.startServices.http.get.mockImplementation(async (path: any) => {
      if (path === '/api/fleet/outputs') {
        return {
          data: {
            items: [
              {
                id: 'es-default-output',
                name: 'Default',
                is_default: true,
                is_default_monitoring: true,
                type: 'elasticsearch',
              },
              {
                id: 'es-default-output-internal',
                name: 'Agentless Internal',
                is_default: false,
                is_default_monitoring: false,
                type: 'elasticsearch',
                is_internal: true,
              },
              {
                id: 'es-private-output',
                name: 'Private ES Output',
                is_default: false,
                is_default_monitoring: false,
                type: 'elasticsearch',
                is_internal: true,
              },
            ],
          },
        };
      }
      throw new Error(`Unmocked path: ${path}`);
    });

    const { result } = testRenderer.renderHook(() =>
      useOutputOptions({ supports_agentless: true } as AgentPolicy)
    );

    await waitFor(() => new Promise((resolve) => resolve(null)));

    const dataValues = result.current.dataOutputOptions.map((o) => o.value);
    const monitoringValues = result.current.monitoringOutputOptions.map((o) => o.value);

    // Agentless-internal output should be visible for agentless policies
    expect(dataValues).toContain('es-default-output-internal');
    expect(monitoringValues).toContain('es-default-output-internal');
    // PrivateLink output should NOT be visible for agentless policies (runs on Elastic infra)
    expect(dataValues).not.toContain('es-private-output');
    expect(monitoringValues).not.toContain('es-private-output');
  });
});
