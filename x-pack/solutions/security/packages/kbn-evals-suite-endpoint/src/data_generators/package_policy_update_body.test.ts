/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PackagePolicy, UpdatePackagePolicy } from '@kbn/fleet-plugin/common';
import { toPackagePolicyUpdateBody } from './package_policy_update_body';

const ENDPOINT_POLICY_VALUE = {
  windows: {
    malware: { mode: 'prevent' },
    popup: { malware: { enabled: true, message: 'blocked' } },
  },
};

const createStoredPackagePolicy = (): PackagePolicy => ({
  id: 'pkg-1',
  name: 'eval-agent-pm-shaper',
  description: 'stored defend policy',
  namespace: 'default',
  enabled: true,
  policy_id: 'agent-policy-1',
  policy_ids: ['agent-policy-1'],
  output_id: 'output-1',
  spaceIds: ['default'],
  package_agent_version_condition: '>=8.0.0',
  agents: 3,
  version: 'WzFd',
  revision: 7,
  secret_references: [{ id: 'secret-1' }],
  created_at: '2026-01-01T00:00:00.000Z',
  created_by: 'elastic',
  updated_at: '2026-01-02T00:00:00.000Z',
  updated_by: 'kibana',
  elasticsearch: { privileges: { cluster: ['monitor'] } },
  overrides: { inputs: { endpoint: { enabled: true } } },
  package: { name: 'endpoint', title: 'Elastic Defend', version: '8.16.0' },
  inputs: [
    {
      type: 'endpoint',
      enabled: true,
      compiled_input: { compiled: 'endpoint' },
      vars: { host: { value: 'defend-host' } },
      streams: [
        {
          id: 'stream-1',
          enabled: true,
          compiled_stream: { compiled: 'alerts' },
          data_stream: { dataset: 'endpoint.alerts', type: 'logs' },
          vars: { interval: { value: '10s' } },
        },
      ],
      config: {
        artifact_manifest: { value: { manifest_version: '1.0.0' } },
        policy: { value: ENDPOINT_POLICY_VALUE },
      },
    },
    {
      type: 'logfile',
      enabled: false,
      compiled_input: { compiled: 'logfile' },
      streams: [],
    },
  ],
});

const acceptUpdatePackagePolicy = (body: UpdatePackagePolicy): UpdatePackagePolicy => body;

describe('toPackagePolicyUpdateBody', () => {
  it('removes storage-only fields and compiled_input while preserving the Fleet update contract', () => {
    const source = createStoredPackagePolicy();
    const sourceSnapshot = structuredClone(source);

    const body = toPackagePolicyUpdateBody(source);
    acceptUpdatePackagePolicy(body);

    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('agents');
    expect(body).not.toHaveProperty('version');
    expect(body).not.toHaveProperty('revision');
    expect(body).not.toHaveProperty('secret_references');
    expect(body).not.toHaveProperty('created_at');
    expect(body).not.toHaveProperty('created_by');
    expect(body).not.toHaveProperty('updated_at');
    expect(body).not.toHaveProperty('updated_by');
    expect(body).not.toHaveProperty('elasticsearch');
    expect(body.inputs).toHaveLength(2);
    expect(body.inputs[0]).not.toHaveProperty('compiled_input');
    expect(body.inputs[1]).not.toHaveProperty('compiled_input');

    expect(source).toEqual(sourceSnapshot);
    expect(source.inputs[0]?.compiled_input).toEqual({ compiled: 'endpoint' });
    expect(source.inputs[1]?.compiled_input).toEqual({ compiled: 'logfile' });
  });
});
