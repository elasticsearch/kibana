/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildClientLeaseKey } from './build_client_lease_key';

describe('buildClientLeaseKey', () => {
  it('formats key as connectorId:clientTypeId:shared', () => {
    expect(buildClientLeaseKey('connector-abc', 'mcp')).toBe('connector-abc:mcp:shared');
  });

  it('preserves special characters in connectorId', () => {
    expect(buildClientLeaseKey('.github', 'mcp')).toBe('.github:mcp:shared');
  });
});
