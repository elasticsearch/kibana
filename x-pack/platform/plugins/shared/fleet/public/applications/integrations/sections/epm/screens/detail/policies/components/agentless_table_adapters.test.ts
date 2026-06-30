/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PackagePolicy, PackagePolicyInput } from '../../../../../../types';

import { getConnectorsFromPackagePolicy, getSelectedInput } from './agentless_table_adapters';

const makeInput = (overrides: Partial<PackagePolicyInput>): PackagePolicyInput => ({
  type: 'logs',
  enabled: true,
  streams: [],
  ...overrides,
});

const makePackagePolicy = (inputs: PackagePolicyInput[]): PackagePolicy =>
  ({ id: 'pp1', name: 'pp', inputs } as PackagePolicy);

describe('getConnectorsFromPackagePolicy', () => {
  it('returns an empty array when there are no inputs', () => {
    expect(getConnectorsFromPackagePolicy(makePackagePolicy([]))).toEqual([]);
  });

  it('maps an enabled input that carries connector vars', () => {
    const packagePolicy = makePackagePolicy([
      makeInput({
        enabled: true,
        vars: {
          connector_id: { value: 'connector-1' },
          connector_name: { value: 'My Connector' },
        },
      }),
    ]);
    expect(getConnectorsFromPackagePolicy(packagePolicy)).toEqual([
      { id: 'connector-1', name: 'My Connector' },
    ]);
  });

  it('excludes disabled inputs even when they carry connector vars', () => {
    const packagePolicy = makePackagePolicy([
      makeInput({
        enabled: false,
        vars: { connector_id: { value: 'disabled-connector' } },
      }),
    ]);
    expect(getConnectorsFromPackagePolicy(packagePolicy)).toEqual([]);
  });

  it('excludes enabled inputs without connector vars', () => {
    const packagePolicy = makePackagePolicy([
      makeInput({ enabled: true, vars: { period: { value: '5m' } } }),
    ]);
    expect(getConnectorsFromPackagePolicy(packagePolicy)).toEqual([]);
  });
});

describe('getSelectedInput', () => {
  it('returns the single enabled input policy template and type', () => {
    const packagePolicy = makePackagePolicy([
      makeInput({ enabled: true, policy_template: 'aws', type: 'aws/s3' }),
      makeInput({ enabled: false, policy_template: 'gcp', type: 'gcp/metrics' }),
    ]);
    expect(getSelectedInput(packagePolicy)).toEqual({ policyTemplate: 'aws', type: 'aws/s3' });
  });

  it('returns undefined when no input is enabled', () => {
    const packagePolicy = makePackagePolicy([
      makeInput({ enabled: false, policy_template: 'aws', type: 'aws/s3' }),
    ]);
    expect(getSelectedInput(packagePolicy)).toBeUndefined();
  });

  it('returns undefined when more than one input is enabled', () => {
    const packagePolicy = makePackagePolicy([
      makeInput({ enabled: true, policy_template: 'aws', type: 'aws/s3' }),
      makeInput({ enabled: true, policy_template: 'gcp', type: 'gcp/metrics' }),
    ]);
    expect(getSelectedInput(packagePolicy)).toBeUndefined();
  });

  it('returns undefined when the single enabled input has no policy template', () => {
    const packagePolicy = makePackagePolicy([makeInput({ enabled: true, type: 'aws/s3' })]);
    expect(getSelectedInput(packagePolicy)).toBeUndefined();
  });
});
