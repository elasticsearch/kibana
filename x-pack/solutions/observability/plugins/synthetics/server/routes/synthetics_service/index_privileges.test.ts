/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getSyntheticsIndexPrivilegesRoute } from './index_privileges';

describe('getSyntheticsIndexPrivilegesRoute', () => {
  const runHandler = (hasAllRequested: boolean) => {
    const hasPrivileges = jest.fn().mockResolvedValue({ has_all_requested: hasAllRequested });
    const route = getSyntheticsIndexPrivilegesRoute();
    return {
      hasPrivileges,
      // @ts-expect-error partial implementation for testing
      result: route.handler({
        syntheticsEsClient: { baseESClient: { security: { hasPrivileges } } },
      }),
    };
  };

  it('returns canRead true when the user has synthetics-* read', async () => {
    const { hasPrivileges, result } = runHandler(true);

    await expect(result).resolves.toEqual({ canRead: true });
    expect(hasPrivileges).toHaveBeenCalledWith({
      index: [{ names: ['synthetics-*'], privileges: ['read'] }],
    });
  });

  it('returns canRead false when the user lacks synthetics-* read', async () => {
    const { result } = runHandler(false);

    await expect(result).resolves.toEqual({ canRead: false });
  });
});
