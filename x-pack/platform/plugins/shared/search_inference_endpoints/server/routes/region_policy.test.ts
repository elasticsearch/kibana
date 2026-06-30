/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { RequestHandlerContext } from '@kbn/core/server';
import { ROUTE_VERSIONS } from '../../common/constants';
import { APIRoutes } from '../../common/types';
import { MockRouter } from '../../__mocks__/router.mock';
import { defineRegionPolicyRoutes } from './region_policy';

const mockPolicy = {
  region_policy: {
    allowed_regions: [{ csp: 'aws', region: 'us-east-1' }],
    fallback_region: { csp: 'aws', region: 'us-west-2' },
  },
  created_at: '2026-01-10T11:23:00Z',
  updated_at: '2026-01-10T11:23:00Z',
};

const mockEsClient = {
  transport: {
    request: jest.fn(),
  },
};

const mockCore = {
  elasticsearch: {
    client: { asCurrentUser: mockEsClient },
  },
};

describe('Region Policy Routes', () => {
  const mockLogger = loggingSystemMock.createLogger().get();
  let mockRouter: MockRouter;
  let context: jest.Mocked<RequestHandlerContext>;

  beforeEach(() => {
    jest.clearAllMocks();
    context = {
      core: Promise.resolve(mockCore),
    } as unknown as jest.Mocked<RequestHandlerContext>;
  });

  describe('GET /internal/search_inference_endpoints/region_policy', () => {
    beforeEach(() => {
      mockRouter = new MockRouter({
        context,
        method: 'get',
        path: APIRoutes.REGION_POLICY,
        version: ROUTE_VERSIONS.v1,
      });
      defineRegionPolicyRoutes({ logger: mockLogger, router: mockRouter.router });
    });

    it('returns the region policy when it exists', async () => {
      mockEsClient.transport.request.mockResolvedValue(mockPolicy);

      await mockRouter.callRoute({});

      expect(mockEsClient.transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/_inference/_region_policy',
      });
      expect(mockRouter.response.ok).toHaveBeenCalledWith(
        expect.objectContaining({ body: mockPolicy })
      );
    });

    it('propagates a 404 when no policy is configured', async () => {
      const error = Object.assign(new Error('Not Found'), {
        statusCode: 404,
        message: 'Not Found',
      });
      mockEsClient.transport.request.mockRejectedValue(error);

      await mockRouter.callRoute({});

      expect(mockRouter.response.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('PUT /internal/search_inference_endpoints/region_policy', () => {
    beforeEach(() => {
      mockRouter = new MockRouter({
        context,
        method: 'put',
        path: APIRoutes.REGION_POLICY,
        version: ROUTE_VERSIONS.v1,
      });
      defineRegionPolicyRoutes({ logger: mockLogger, router: mockRouter.router });
    });

    it('creates or updates the policy and returns the saved state', async () => {
      mockEsClient.transport.request.mockResolvedValue(mockPolicy);

      const requestBody = {
        allowed_regions: [{ csp: 'aws', region: 'us-east-1' }],
        fallback_region: { csp: 'aws', region: 'us-west-2' },
      };
      await mockRouter.callRoute({ body: requestBody });

      expect(mockEsClient.transport.request).toHaveBeenCalledWith({
        method: 'PUT',
        path: '/_inference/_region_policy',
        body: { region_policy: requestBody },
      });
      expect(mockRouter.response.ok).toHaveBeenCalledWith(
        expect.objectContaining({ body: mockPolicy })
      );
    });

    it('validates that allowed_regions is an array of {csp, region} objects', () => {
      mockRouter.shouldThrow({ body: { allowed_regions: ['not-an-object'] } });
    });

    it('rejects allowed_regions exceeding maxSize of 100', () => {
      const tooManyRegions = Array.from({ length: 101 }, (_, i) => ({
        csp: 'aws',
        region: `us-east-${i}`,
      }));
      mockRouter.shouldThrow({ body: { allowed_regions: tooManyRegions } });
    });

    it('rejects csp strings exceeding maxLength of 64', () => {
      mockRouter.shouldThrow({
        body: { allowed_regions: [{ csp: 'a'.repeat(65), region: 'us-east-1' }] },
      });
    });

    it('rejects region strings exceeding maxLength of 128', () => {
      mockRouter.shouldThrow({
        body: { allowed_regions: [{ csp: 'aws', region: 'r'.repeat(129) }] },
      });
    });

    it('rejects empty allowed_regions array', () => {
      mockRouter.shouldThrow({ body: { allowed_regions: [] } });
    });

    it('rejects allowed_geos with non-string elements', () => {
      mockRouter.shouldThrow({ body: { allowed_geos: [123] } });
    });

    it('rejects empty allowed_geos array', () => {
      mockRouter.shouldThrow({ body: { allowed_geos: [] } });
    });

    it('rejects malformed fallback_region shape', () => {
      mockRouter.shouldThrow({ body: { fallback_region: 'not-an-object' } });
    });
  });

  describe('DELETE /internal/search_inference_endpoints/region_policy', () => {
    beforeEach(() => {
      mockRouter = new MockRouter({
        context,
        method: 'delete',
        path: APIRoutes.REGION_POLICY,
        version: ROUTE_VERSIONS.v1,
      });
      defineRegionPolicyRoutes({ logger: mockLogger, router: mockRouter.router });
    });

    it('removes the policy and returns acknowledged', async () => {
      mockEsClient.transport.request.mockResolvedValue(undefined);

      await mockRouter.callRoute({});

      expect(mockEsClient.transport.request).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/_inference/_region_policy',
      });
      expect(mockRouter.response.ok).toHaveBeenCalledWith(
        expect.objectContaining({ body: { acknowledged: true } })
      );
    });

    it('propagates a 404 when no policy exists to delete', async () => {
      const error = Object.assign(new Error('Not Found'), {
        statusCode: 404,
        message: 'Not Found',
      });
      mockEsClient.transport.request.mockRejectedValue(error);

      await mockRouter.callRoute({});

      expect(mockRouter.response.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });
});
