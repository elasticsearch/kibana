/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mapProviderPermissions } from './map_provider_permissions';
import type { ServiceManifestLookup } from './map_provider_permissions';

// Minimal PackageInfo shape for test purposes — only the fields mapProviderPermissions reads.
const makePackageInfo = (overrides: Record<string, unknown> = {}) =>
  ({
    name: 'aws',
    version: '1.0.0',
    title: 'AWS',
    description: '',
    owner: { github: 'elastic' },
    provider_permissions: undefined,
    policy_templates: [],
    data_streams: [],
    ...overrides,
  } as any);

const CLOUDTRAIL_LOOKUP: ServiceManifestLookup = {
  packageName: 'aws',
  policyTemplate: 'cloudtrail',
  inputs: ['aws-s3', 'aws-cloudwatch'],
  dataStream: 'cloudtrail',
};

describe('mapProviderPermissions', () => {
  it('returns null when no provider_permissions are declared at any level', () => {
    const pkgInfo = makePackageInfo();
    expect(mapProviderPermissions(pkgInfo, CLOUDTRAIL_LOOKUP)).toBeNull();
  });

  it('collects permissions from the package level', () => {
    const pkgInfo = makePackageInfo({
      provider_permissions: [
        { provider: 'aws', permissions: ['s3:GetObject'], roles: ['SecurityAudit'] },
      ],
    });

    const result = mapProviderPermissions(pkgInfo, CLOUDTRAIL_LOOKUP);

    expect(result).not.toBeNull();
    expect(result!.actions).toContain('s3:GetObject');
    expect(result!.managedPolicyArns).toContain('SecurityAudit');
  });

  it('collects permissions from the matching policy_template level', () => {
    const pkgInfo = makePackageInfo({
      policy_templates: [
        {
          name: 'cloudtrail',
          title: 'CloudTrail',
          description: '',
          inputs: [],
          provider_permissions: [{ provider: 'aws', permissions: ['cloudtrail:GetTrail'] }],
        },
        {
          name: 'other',
          title: 'Other',
          description: '',
          inputs: [],
          provider_permissions: [{ provider: 'aws', permissions: ['rds:DescribeDBInstances'] }],
        },
      ],
    });

    const result = mapProviderPermissions(pkgInfo, CLOUDTRAIL_LOOKUP);

    expect(result).not.toBeNull();
    expect(result!.actions).toContain('cloudtrail:GetTrail');
    expect(result!.actions).not.toContain('rds:DescribeDBInstances');
  });

  it('collects permissions from the matching input level', () => {
    const pkgInfo = makePackageInfo({
      policy_templates: [
        {
          name: 'cloudtrail',
          title: 'CloudTrail',
          description: '',
          inputs: [
            {
              type: 'aws-s3',
              title: 'S3',
              description: '',
              provider_permissions: [
                { provider: 'aws', permissions: ['s3:GetObject', 's3:ListBucket'] },
              ],
            },
            {
              type: 'aws-cloudwatch',
              title: 'CW',
              description: '',
              provider_permissions: [{ provider: 'aws', permissions: ['logs:FilterLogEvents'] }],
            },
            {
              type: 'cel',
              title: 'CEL',
              description: '',
              provider_permissions: [{ provider: 'aws', permissions: ['config:ListResources'] }],
            },
          ],
        },
      ],
    });

    const result = mapProviderPermissions(pkgInfo, CLOUDTRAIL_LOOKUP);

    // 'aws-s3' and 'aws-cloudwatch' match CLOUDTRAIL_LOOKUP.inputs; 'cel' does not
    expect(result).not.toBeNull();
    expect(result!.actions).toContain('s3:GetObject');
    expect(result!.actions).toContain('logs:FilterLogEvents');
    expect(result!.actions).not.toContain('config:ListResources');
  });

  it('collects permissions from the matching data_stream level', () => {
    const pkgInfo = makePackageInfo({
      data_streams: [
        {
          path: 'cloudtrail',
          type: 'logs',
          dataset: 'aws.cloudtrail',
          title: 'CloudTrail',
          release: 'ga',
          package: 'aws',
          provider_permissions: [{ provider: 'aws', permissions: ['cloudtrail:LookupEvents'] }],
        },
        {
          path: 'vpcflow',
          type: 'logs',
          dataset: 'aws.vpcflow',
          title: 'VPC Flow',
          release: 'ga',
          package: 'aws',
          provider_permissions: [{ provider: 'aws', permissions: ['ec2:DescribeFlowLogs'] }],
        },
      ],
    });

    const result = mapProviderPermissions(pkgInfo, CLOUDTRAIL_LOOKUP);

    expect(result).not.toBeNull();
    expect(result!.actions).toContain('cloudtrail:LookupEvents');
    expect(result!.actions).not.toContain('ec2:DescribeFlowLogs');
  });

  it('unions permissions across all levels and deduplicates actions', () => {
    const pkgInfo = makePackageInfo({
      provider_permissions: [
        { provider: 'aws', permissions: ['s3:GetObject', 'sts:GetCallerIdentity'] },
      ],
      policy_templates: [
        {
          name: 'cloudtrail',
          title: 'CloudTrail',
          description: '',
          inputs: [
            {
              type: 'aws-s3',
              title: 'S3',
              description: '',
              provider_permissions: [
                // s3:GetObject is also at package level — should be deduped
                { provider: 'aws', permissions: ['s3:GetObject', 's3:ListBucket'] },
              ],
            },
          ],
        },
      ],
      data_streams: [
        {
          path: 'cloudtrail',
          type: 'logs',
          dataset: 'aws.cloudtrail',
          title: 'CloudTrail',
          release: 'ga',
          package: 'aws',
          provider_permissions: [{ provider: 'aws', permissions: ['cloudtrail:LookupEvents'] }],
        },
      ],
    });

    const result = mapProviderPermissions(pkgInfo, CLOUDTRAIL_LOOKUP);

    expect(result).not.toBeNull();
    // Unique actions from all levels
    expect(result!.actions).toEqual(
      expect.arrayContaining([
        's3:GetObject',
        'sts:GetCallerIdentity',
        's3:ListBucket',
        'cloudtrail:LookupEvents',
      ])
    );
    // No duplicates
    const uniqueActions = new Set(result!.actions);
    expect(uniqueActions.size).toBe(result!.actions.length);
  });

  it('filters out non-aws provider entries', () => {
    const pkgInfo = makePackageInfo({
      provider_permissions: [
        { provider: 'gcp', permissions: ['storage.objects.get'] },
        { provider: 'aws', permissions: ['s3:GetObject'] },
      ],
    });

    const result = mapProviderPermissions(pkgInfo, CLOUDTRAIL_LOOKUP);

    expect(result).not.toBeNull();
    expect(result!.actions).toEqual(['s3:GetObject']);
  });

  it('maps roles to managedPolicyArns', () => {
    const pkgInfo = makePackageInfo({
      provider_permissions: [
        { provider: 'aws', permissions: [], roles: ['arn:aws:iam::aws:policy/SecurityAudit'] },
      ],
    });

    const result = mapProviderPermissions(pkgInfo, CLOUDTRAIL_LOOKUP);

    expect(result).not.toBeNull();
    expect(result!.managedPolicyArns).toContain('arn:aws:iam::aws:policy/SecurityAudit');
  });

  it('returns null when all provider entries are non-aws', () => {
    const pkgInfo = makePackageInfo({
      provider_permissions: [{ provider: 'gcp', permissions: ['storage.objects.get'] }],
    });

    const result = mapProviderPermissions(pkgInfo, CLOUDTRAIL_LOOKUP);

    // No AWS entries declared — should fall back to the matrix, not return empty arrays.
    expect(result).toBeNull();
  });

  it('collects permissions when policyTemplate is undefined (matches all templates)', () => {
    const lookup: ServiceManifestLookup = {
      packageName: 'aws',
      policyTemplate: undefined,
      inputs: [],
      dataStream: 'cloudtrail',
    };

    const pkgInfo = makePackageInfo({
      policy_templates: [
        {
          name: 'any_template',
          title: 'Any',
          description: '',
          inputs: [],
          provider_permissions: [{ provider: 'aws', permissions: ['logs:DescribeLogGroups'] }],
        },
      ],
    });

    const result = mapProviderPermissions(pkgInfo, lookup);

    expect(result).not.toBeNull();
    expect(result!.actions).toContain('logs:DescribeLogGroups');
  });
});
