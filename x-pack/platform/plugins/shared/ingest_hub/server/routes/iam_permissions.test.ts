/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock, httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { PackageInfo } from '@kbn/fleet-plugin/common';

import { AWS_SERVICE_PROVIDER_PERMISSIONS } from '../../common/aws_provider_permissions';
import { registerIamPermissionsRoute } from './iam_permissions';

/** Build a minimal PackageInfo stub with package-level provider_permissions. */
const makePackageInfo = (
  overrides: Partial<
    Pick<PackageInfo, 'provider_permissions' | 'policy_templates' | 'data_streams'>
  > = {}
): PackageInfo =>
  ({
    name: 'aws',
    version: '1.0.0',
    provider_permissions: [],
    policy_templates: [],
    data_streams: [],
    ...overrides,
  } as unknown as PackageInfo);

describe('registerIamPermissionsRoute', () => {
  let router: ReturnType<typeof httpServiceMock.createRouter>;
  let getFleet: jest.Mock;
  let mockGetLatestPackageInfo: jest.Mock;
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;

  beforeEach(() => {
    router = httpServiceMock.createRouter();
    mockGetLatestPackageInfo = jest.fn();
    getFleet = jest.fn().mockReturnValue({
      packageService: {
        asInternalUser: {
          getLatestPackageInfo: mockGetLatestPackageInfo,
        },
      },
    });
    logger = loggingSystemMock.createLogger();

    registerIamPermissionsRoute(router, getFleet, logger);
  });

  /** Extract the registered GET handler. */
  const getHandler = () => router.get.mock.calls[0][1];

  it('registers a GET route at the correct path', () => {
    const [config] = router.get.mock.calls[0];
    expect(config.path).toBe('/internal/onboarding/iam_permissions');
    expect(config.security?.authz).toMatchObject({ enabled: false });
  });

  it('returns 400 when services param is empty after trimming', async () => {
    const request = httpServerMock.createKibanaRequest({ query: { services: '   ,  ' } });
    const response = httpServerMock.createResponseFactory();
    const handler = getHandler();

    await handler({} as any, request, response);

    expect(response.badRequest).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('non-empty') })
    );
  });

  it('returns 400 when a service id is unknown', async () => {
    const request = httpServerMock.createKibanaRequest({
      query: { services: 'cloudtrail,totally_unknown_service' },
    });
    const response = httpServerMock.createResponseFactory();
    const handler = getHandler();

    await handler({} as any, request, response);

    expect(response.badRequest).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('totally_unknown_service') })
    );
  });

  it('returns manifest-sourced permissions when package declares provider_permissions', async () => {
    // cloudtrail in `aws` package with package-level aws permissions declared
    const manifestActions = ['cloudtrail:GetTrail', 'cloudtrail:DescribeTrails'];
    mockGetLatestPackageInfo.mockResolvedValue(
      makePackageInfo({
        provider_permissions: [{ provider: 'aws', permissions: manifestActions }],
      })
    );

    const request = httpServerMock.createKibanaRequest({ query: { services: 'cloudtrail' } });
    const response = httpServerMock.createResponseFactory();
    const handler = getHandler();

    await handler({} as any, request, response);

    expect(response.ok).toHaveBeenCalled();
    const body = (response.ok as jest.Mock).mock.calls[0][0].body;

    // byService entry for cloudtrail uses manifest actions (sorted), not the matrix
    expect(body.byService.cloudtrail.policy.Statement[0].Action).toEqual(
      [...manifestActions].sort()
    );
    expect(body.byService.cloudtrail.managedPolicyArns).toEqual([]);

    // merged is the same since there's only one service
    expect(body.merged.Statement[0].Action).toEqual([...manifestActions].sort());
    expect(body.mergedManagedPolicyArns).toEqual([]);
  });

  it('surfaces managed policy ARNs from manifest roles', async () => {
    const arn = 'arn:aws:iam::aws:policy/SecurityAudit';
    mockGetLatestPackageInfo.mockResolvedValue(
      makePackageInfo({
        provider_permissions: [{ provider: 'aws', permissions: ['s3:GetObject'], roles: [arn] }],
      })
    );

    const request = httpServerMock.createKibanaRequest({ query: { services: 'cloudtrail' } });
    const response = httpServerMock.createResponseFactory();
    const handler = getHandler();

    await handler({} as any, request, response);

    expect(response.ok).toHaveBeenCalled();
    const body = (response.ok as jest.Mock).mock.calls[0][0].body;

    expect(body.byService.cloudtrail.managedPolicyArns).toContain(arn);
    expect(body.mergedManagedPolicyArns).toContain(arn);
  });

  it('falls back to the hardcoded matrix when the package has no provider_permissions', async () => {
    // Return a package with no permissions declared at any level
    mockGetLatestPackageInfo.mockResolvedValue(makePackageInfo());

    const request = httpServerMock.createKibanaRequest({ query: { services: 'cloudtrail' } });
    const response = httpServerMock.createResponseFactory();
    const handler = getHandler();

    await handler({} as any, request, response);

    expect(response.ok).toHaveBeenCalled();
    const body = (response.ok as jest.Mock).mock.calls[0][0].body;

    // Should equal the hardcoded matrix actions for cloudtrail
    const matrixActions = AWS_SERVICE_PROVIDER_PERMISSIONS.cloudtrail?.actions ?? [];
    expect(body.byService.cloudtrail.policy.Statement[0].Action).toEqual([...matrixActions].sort());
  });

  it('logs a debug message when using the matrix fallback', async () => {
    mockGetLatestPackageInfo.mockResolvedValue(makePackageInfo());

    const request = httpServerMock.createKibanaRequest({ query: { services: 'cloudtrail' } });
    const response = httpServerMock.createResponseFactory();
    const handler = getHandler();

    await handler({} as any, request, response);

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('cloudtrail'));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('fallback'));
  });

  it('falls back silently when Fleet package fetch throws', async () => {
    mockGetLatestPackageInfo.mockRejectedValue(new Error('Fleet unavailable'));

    const request = httpServerMock.createKibanaRequest({ query: { services: 'cloudtrail' } });
    const response = httpServerMock.createResponseFactory();
    const handler = getHandler();

    await handler({} as any, request, response);

    // Should still respond ok, using matrix fallback
    expect(response.ok).toHaveBeenCalled();
    const body = (response.ok as jest.Mock).mock.calls[0][0].body;

    const matrixActions = AWS_SERVICE_PROVIDER_PERMISSIONS.cloudtrail?.actions ?? [];
    expect(body.byService.cloudtrail.policy.Statement[0].Action).toEqual([...matrixActions].sort());

    // Logger should have recorded the debug message about the failed fetch
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Could not fetch package info')
    );
  });

  it('deduplicates actions in the merged document across multiple services', async () => {
    // Both cloudtrail and vpcflow share some S3 / CloudWatch actions in the matrix.
    // When fetching via manifest, return no permissions → fall back to matrix.
    mockGetLatestPackageInfo.mockResolvedValue(makePackageInfo());

    const request = httpServerMock.createKibanaRequest({
      query: { services: 'cloudtrail,vpcflow' },
    });
    const response = httpServerMock.createResponseFactory();
    const handler = getHandler();

    await handler({} as any, request, response);

    expect(response.ok).toHaveBeenCalled();
    const body = (response.ok as jest.Mock).mock.calls[0][0].body;

    // Both services have their own byService entries
    expect(body.byService).toHaveProperty('cloudtrail');
    expect(body.byService).toHaveProperty('vpcflow');

    // merged.Action is a deduped union — each action appears at most once
    const mergedActions: string[] = body.merged.Statement[0].Action;
    expect(mergedActions).toEqual([...new Set(mergedActions)].sort());

    // merged.Action must be a superset of each service's actions
    const cloudtrailActions: string[] = body.byService.cloudtrail.policy.Statement[0].Action;
    for (const action of cloudtrailActions) {
      expect(mergedActions).toContain(action);
    }
  });

  it('fetches each distinct package only once for multiple services', async () => {
    // cloudtrail and vpcflow both come from the 'aws' package
    mockGetLatestPackageInfo.mockResolvedValue(makePackageInfo());

    const request = httpServerMock.createKibanaRequest({
      query: { services: 'cloudtrail,vpcflow' },
    });
    const response = httpServerMock.createResponseFactory();
    const handler = getHandler();

    await handler({} as any, request, response);

    // Only one Fleet fetch for the shared 'aws' package
    expect(mockGetLatestPackageInfo).toHaveBeenCalledTimes(1);
    expect(mockGetLatestPackageInfo).toHaveBeenCalledWith('aws');
  });

  it('handles a mix of manifest-sourced and matrix-fallback services', async () => {
    // cloudtrail returns manifest permissions; fargate is from a different package (awsfargate)
    // with no manifest permissions → falls back to matrix.
    mockGetLatestPackageInfo.mockImplementation((pkgName: string) => {
      if (pkgName === 'aws') {
        return Promise.resolve(
          makePackageInfo({
            provider_permissions: [{ provider: 'aws', permissions: ['cloudtrail:GetTrail'] }],
          })
        );
      }
      // awsfargate package returns no permissions
      return Promise.resolve(makePackageInfo());
    });

    const request = httpServerMock.createKibanaRequest({
      query: { services: 'cloudtrail,fargate' },
    });
    const response = httpServerMock.createResponseFactory();
    const handler = getHandler();

    await handler({} as any, request, response);

    expect(response.ok).toHaveBeenCalled();
    const body = (response.ok as jest.Mock).mock.calls[0][0].body;

    // cloudtrail: uses manifest
    expect(body.byService.cloudtrail.policy.Statement[0].Action).toContain('cloudtrail:GetTrail');

    // fargate: uses matrix fallback
    const fargateMatrix = AWS_SERVICE_PROVIDER_PERMISSIONS.fargate?.actions ?? [];
    if (fargateMatrix.length > 0) {
      expect(body.byService.fargate.policy.Statement[0].Action).toEqual([...fargateMatrix].sort());
    }
  });

  it('uses title-cased Sid for byService entries', async () => {
    mockGetLatestPackageInfo.mockResolvedValue(
      makePackageInfo({
        provider_permissions: [{ provider: 'aws', permissions: ['ec2:DescribeInstances'] }],
      })
    );

    const request = httpServerMock.createKibanaRequest({ query: { services: 'ec2_metrics' } });
    const response = httpServerMock.createResponseFactory();
    const handler = getHandler();

    await handler({} as any, request, response);

    expect(response.ok).toHaveBeenCalled();
    const body = (response.ok as jest.Mock).mock.calls[0][0].body;

    // Sid should be ElasticEc2Metrics, not Elasticec2metrics
    expect(body.byService.ec2_metrics.policy.Statement[0].Sid).toBe('ElasticEc2Metrics');
  });
});
