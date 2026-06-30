/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getRegionPolicy, putRegionPolicy, deleteRegionPolicy } from './region_policy';

describe('region_policy lib', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      transport: {
        request: jest.fn(),
      },
    };
  });

  describe('getRegionPolicy', () => {
    it('calls GET /_inference/_region_policy', async () => {
      const policy = {
        region_policy: {
          allowed_regions: [{ csp: 'aws', region: 'us-east-1' }],
          fallback_region: { csp: 'aws', region: 'us-west-2' },
        },
        created_at: '2026-01-10T11:23:00Z',
        updated_at: '2026-01-10T11:23:00Z',
      };
      mockClient.transport.request.mockResolvedValue(policy);

      const result = await getRegionPolicy(mockClient);

      expect(mockClient.transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/_inference/_region_policy',
      });
      expect(result).toEqual(policy);
    });

    it('propagates errors from the ES client', async () => {
      const error = Object.assign(new Error('Not Found'), { statusCode: 404 });
      mockClient.transport.request.mockRejectedValue(error);

      await expect(getRegionPolicy(mockClient)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('putRegionPolicy', () => {
    it('calls PUT /_inference/_region_policy with the provided body', async () => {
      const body = {
        allowed_regions: [{ csp: 'aws', region: 'eu-west-1' }],
        fallback_region: { csp: 'aws', region: 'us-east-1' },
      };
      const response = {
        region_policy: body,
        created_at: '2026-01-10T11:23:00Z',
        updated_at: '2026-01-10T11:23:00Z',
      };
      mockClient.transport.request.mockResolvedValue(response);

      const result = await putRegionPolicy(mockClient, body);

      expect(mockClient.transport.request).toHaveBeenCalledWith({
        method: 'PUT',
        path: '/_inference/_region_policy',
        body: { region_policy: body },
      });
      expect(result).toEqual(response);
    });

    it('propagates errors from the ES client', async () => {
      const error = Object.assign(new Error('Forbidden'), { statusCode: 403 });
      mockClient.transport.request.mockRejectedValue(error);

      await expect(
        putRegionPolicy(mockClient, { allowed_regions: [{ csp: 'aws', region: 'us-east-1' }] })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('deleteRegionPolicy', () => {
    it('calls DELETE /_inference/_region_policy', async () => {
      mockClient.transport.request.mockResolvedValue(undefined);

      await deleteRegionPolicy(mockClient);

      expect(mockClient.transport.request).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/_inference/_region_policy',
      });
    });

    it('propagates errors from the ES client', async () => {
      const error = Object.assign(new Error('Not Found'), { statusCode: 404 });
      mockClient.transport.request.mockRejectedValue(error);

      await expect(deleteRegionPolicy(mockClient)).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
